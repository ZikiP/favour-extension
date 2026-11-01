import { els, el, hostOf, originPattern, toast } from './dom.js';
import { keep, state } from './store.js';
import { render } from './views.js';
import { isAllowed } from '../shared/url-rules.js';
import '../shared/parser-engine.js';

let running = false;
let progress = null;

export function openScrapeDialog() {
  renderStatus();
  renderFailures();
  if (!els.scrapeDialog.open) els.scrapeDialog.showModal();
}

export async function startScrapeAll() {
  await runScrape(state.items.slice());
}

export async function scrapeSelected() {
  if (running) return;
  const ids = new Set(state.selected);
  const items = state.items.filter((item) => ids.has(item.id));
  if (!items.length) return;

  state.selecting = false;
  state.selected.clear();
  render();
  openScrapeDialog();
  await runScrape(items);
}

export async function rescanItem(item) {
  const rule = ruleFor(item);
  if (!rule) throw new Error('没有匹配的解析规则');
  const granted = await requestAccess([item.url]);
  if (!granted) throw new Error('未获得该网站的访问权限');

  const updated = await scrapeSmart(item, rule, { useTabs: false });
  await keep(state.items.map((entry) => (entry.id === item.id ? updated : entry)));
  render();
  return state.items.find((entry) => entry.id === item.id) || updated;
}

async function runScrape(items) {
  if (running) return;

  const entries = items
    .map((item) => ({ item, rule: ruleFor(item) }))
    .filter((entry) => entry.rule);

  if (!entries.length) {
    els.scrapeStatus.textContent = '没有匹配解析规则的收藏，请先导入解析规则。';
    return;
  }

  const granted = await requestAccess(entries.map((entry) => entry.item.url));
  if (!granted) {
    els.scrapeStatus.textContent = '未获得网站访问权限，无法刮削。';
    return;
  }

  const skipped = items.length - entries.length;
  progress = {
    total: items.length,
    done: skipped,
    ok: 0,
    skip: skipped,
    fail: 0,
    failures: [],
    finished: false,
  };
  running = true;
  renderStatus();
  renderFailures();

  const updates = new Map();
  const strategy = { useTabs: false };
  for (const entry of entries) {
    try {
      updates.set(entry.item.id, await scrapeSmart(entry.item, entry.rule, strategy));
      progress.ok += 1;
    } catch (error) {
      progress.fail += 1;
      progress.failures.push({
        id: entry.item.id,
        title: entry.item.title || hostOf(entry.item.url),
        error: error && error.message ? error.message : '抓取失败',
      });
    }
    progress.done += 1;
    renderStatus();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (updates.size) {
    await keep(state.items.map((item) => updates.get(item.id) || item));
    render();
  }

  running = false;
  progress.finished = true;
  renderStatus();
  renderFailures();
  toast(`刮削完成：成功 ${progress.ok}、跳过 ${progress.skip}、失败 ${progress.fail}`);
}

function ruleFor(item) {
  return (
    state.parserRules.find((rule) => item.source && rule.id === item.source.id) ||
    state.parserRules.find((rule) => isAllowed(item.url, rule.matches)) ||
    null
  );
}

async function requestAccess(urls) {
  const origins = [...new Set(urls.map((url) => originPattern(url)).filter(Boolean))];
  if (!origins.length) return false;
  if (!chrome.permissions || typeof chrome.permissions.request !== 'function') return false;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

function mergeExtras(existing, incoming) {
  const map = new Map();
  for (const extra of existing) map.set(extra.key, extra);
  for (const extra of incoming) {
    if (!extra || typeof extra.key !== 'string' || !extra.value) continue;
    map.set(extra.key, {
      key: extra.key,
      label: extra.label || extra.key,
      value: extra.value,
    });
  }
  return [...map.values()];
}

function applyParsed(item, parsed, rule, finalUrl) {
  return {
    ...item,
    url: /^https?:\/\//i.test(finalUrl || '') ? finalUrl : item.url,
    title: parsed.title || item.title,
    extras: mergeExtras(item.extras, parsed.extras),
    cover: parsed.cover || item.cover,
    source: rule ? { id: rule.id, name: rule.name } : item.source,
    updatedAt: Date.now(),
  };
}

async function scrapeSmart(item, rule, strategy) {
  if (!strategy.useTabs) {
    try {
      return await scrapeOne(item, rule);
    } catch {
      strategy.useTabs = true;
    }
  }
  return scrapeViaTab(item, rule);
}

async function scrapeViaTab(item, rule) {
  if (!chrome.tabs || !chrome.scripting) throw new Error('浏览器不支持标签页抓取');

  const tab = await chrome.tabs.create({ url: item.url, active: false });
  try {
    await waitForTabLoad(tab.id);
    await new Promise((resolve) => setTimeout(resolve, 200));

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['shared/parser-engine.js'],
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (ruleArg, urlArg) =>
        globalThis.FavourParser ? globalThis.FavourParser.extract(ruleArg, urlArg) : null,
      args: [rule, item.url],
    });
    const parsed = results && results[0] ? results[0].result : null;
    const hasData =
      parsed &&
      ((Array.isArray(parsed.extras) && parsed.extras.some((entry) => entry && entry.value)) ||
        parsed.cover);
    if (!hasData) throw new Error('页面没有解析到数据');

    const current = await chrome.tabs.get(tab.id).catch(() => null);
    return applyParsed(item, parsed, rule, current && current.url ? current.url : item.url);
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      // tab already closed
    }
  }
}

function waitForTabLoad(tabId, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const onUpdated = (id, info) => {
      if (id === tabId && info && info.status === 'complete') {
        cleanup();
        resolve();
      }
    };
    const onRemoved = (id) => {
      if (id === tabId) {
        cleanup();
        reject(new Error('页面已关闭'));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('页面加载超时'));
    }, timeout);
    const cleanup = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId)
      .then((tab) => {
        if (tab && tab.status === 'complete') {
          cleanup();
          resolve();
        }
      })
      .catch(() => {});
  });
}

async function scrapeOne(item, rule) {
  if (!globalThis.FavourParser) throw new Error('解析引擎不可用');

  const response = await fetch(item.url, {
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const parsed = globalThis.FavourParser.extract(rule, response.url || item.url, doc);
  const hasData =
    (Array.isArray(parsed.extras) && parsed.extras.some((entry) => entry && entry.value)) ||
    Boolean(parsed.cover);
  if (!hasData) throw new Error('页面没有解析到数据');

  return applyParsed(item, parsed, rule, response.url);
}

async function retryFailure(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) {
    progress.fail = Math.max(0, progress.fail - 1);
    removeFailure(id);
    renderStatus();
    return;
  }

  try {
    await rescanItem(item);
    progress.fail = Math.max(0, progress.fail - 1);
    progress.ok += 1;
    removeFailure(id);
    renderStatus();
  } catch (error) {
    const failure = progress.failures.find((entry) => entry.id === id);
    if (failure) failure.error = error && error.message ? error.message : '重试失败';
    renderFailures();
  }
}

function removeFailure(id) {
  progress.failures = progress.failures.filter((entry) => entry.id !== id);
  renderFailures();
}

function renderFailures() {
  const failures = progress && Array.isArray(progress.failures) ? progress.failures : [];
  els.scrapeFailures.replaceChildren();
  els.scrapeFailuresWrap.hidden = !failures.length;
  if (!failures.length) return;

  for (const failure of failures) {
    const row = el('div', 'scrape-failure');
    const text = el('div', 'scrape-failure-text');
    text.append(
      el('span', 'scrape-failure-title', failure.title),
      el('span', 'scrape-failure-error', failure.error),
    );
    text.title = failure.error;

    const retry = el('button', 'btn btn-ghost btn-sm', '重试');
    retry.type = 'button';
    retry.addEventListener('click', () => {
      retry.disabled = true;
      void retryFailure(failure.id);
    });

    row.append(text, retry);
    els.scrapeFailures.append(row);
  }
}

function renderStatus() {
  if (running && progress) {
    els.scrapeStatus.textContent =
      `进行中 ${progress.done}/${progress.total} · 成功 ${progress.ok} · 跳过 ${progress.skip} · 失败 ${progress.fail}`;
  } else if (progress && progress.finished) {
    els.scrapeStatus.textContent =
      `上次结果：成功 ${progress.ok}、跳过 ${progress.skip}、失败 ${progress.fail}`;
  } else {
    els.scrapeStatus.textContent = `共 ${state.items.length} 条收藏，点击开始重新刮削。`;
  }
  els.scrapeStart.disabled = running;
}
