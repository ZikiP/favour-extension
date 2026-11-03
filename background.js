import { isAllowed } from './shared/url-rules.js';
import { codeOfItem, parseCode } from './shared/versions.js';
import { readSyncTargets } from './shared/sync-targets.js';
import { buildSyncBody, probeTargets, pushToTargets } from './background/phone-sync.js';
import { enrichActressAvatars } from './background/actress-avatars.js';
import { setupBackupSchedule } from './background/backup-schedule.js';

const MANAGER_PATH = 'manager/manager.html';
const NOTIFICATION_ID = 'favour-saved';

const isWebUrl = (url) => /^https?:\/\//i.test(url || '');

async function getSettingsRules() {
  const { settings } = await chrome.storage.local.get('settings');
  return settings && Array.isArray(settings.whitelist) ? settings.whitelist : [];
}

async function getParserRules() {
  const { parserRules } = await chrome.storage.local.get('parserRules');
  if (!Array.isArray(parserRules)) return [];
  return parserRules.filter(
    (rule) =>
      rule &&
      typeof rule.id === 'string' &&
      Array.isArray(rule.matches) &&
      Array.isArray(rule.fields),
  );
}

async function rememberTab(tab) {
  if (!tab || !tab.active || !isWebUrl(tab.url)) return;
  const now = { url: tab.url, title: tab.title || '' };
  const { lastTab } = await chrome.storage.session.get('lastTab');
  if (lastTab && lastTab.url === now.url && lastTab.title === now.title) return;
  await chrome.storage.session.set({ lastTab: now });
}

async function openManager(blocked = null) {
  if (blocked) await chrome.storage.session.set({ pendingBlocked: blocked });

  const managerUrl = chrome.runtime.getURL(MANAGER_PATH);
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((item) => item.url && item.url.split('#')[0] === managerUrl);

  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: managerUrl });
  }
}

async function extractWithRule(tab, rule) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['shared/parser-engine.js'],
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (matchedRule, pageUrl) =>
        globalThis.FavourParser ? globalThis.FavourParser.extract(matchedRule, pageUrl) : null,
      args: [rule, tab.url],
    });
    return results && results[0] ? results[0].result : null;
  } catch {
    return null;
  }
}

async function quickSave(tab) {
  const parserRules = await getParserRules();
  const matchedRule = parserRules.find((rule) => isAllowed(tab.url, rule.matches)) || null;
  const parsed = matchedRule ? await extractWithRule(tab, matchedRule) : null;

  const extras = parsed && Array.isArray(parsed.extras) ? parsed.extras : [];
  const cover = parsed && typeof parsed.cover === 'string' ? parsed.cover : '';
  const title = (parsed && parsed.title) || tab.title || new URL(tab.url).hostname;
  const now = Date.now();

  const data = await chrome.storage.local.get('items');
  const items = Array.isArray(data.items) ? data.items.slice() : [];
  const codeOf = (entry) => {
    const list = entry && Array.isArray(entry.extras) ? entry.extras : [];
    const extra = list.find((e) => e && e.key === 'code' && e.value);
    return extra ? String(extra.value).trim().toLowerCase() : '';
  };
  const parsedCode = String(
    (extras.find((e) => e.key === 'code' && e.value) || {}).value || '',
  ).trim().toLowerCase();
  let index = items.findIndex((entry) => entry && entry.url === tab.url);
  if (index < 0 && parsedCode) {
    index = items.findIndex((entry) => entry && codeOf(entry) === parsedCode);
  }
  const existing = index >= 0 ? items[index] : null;

  const item = {
    id: existing && existing.id ? existing.id : crypto.randomUUID(),
    url: tab.url,
    title,
    tags: existing && Array.isArray(existing.tags) ? existing.tags : [],
    favorite: Boolean(existing && existing.favorite),
    watched: Boolean(existing && existing.watched),
    lastOpenedAt: existing && existing.lastOpenedAt ? existing.lastOpenedAt : 0,
    extras: extras.length
      ? extras
      : existing && Array.isArray(existing.extras)
        ? existing.extras
        : [],
    cover: cover || (existing && existing.cover) || '',
    source: matchedRule
      ? { id: matchedRule.id, name: matchedRule.name }
      : existing && existing.source
        ? existing.source
        : null,
    createdAt: existing && existing.createdAt ? existing.createdAt : now,
    updatedAt: now,
  };

  if (index >= 0) items[index] = item;
  else items.unshift(item);
  await chrome.storage.local.set({ items });

  showSaved(item, Boolean(existing));
  await enrichActressAvatars(tab, matchedRule, extras).catch(() => {});
  return item;
}

function showSaved(item, existed) {
  // 番号带上版本标签，一眼看出收的是原版还是中文字幕 / 无码
  const info = parseCode(codeOfItem(item));
  const version = info.versioned ? `（${info.label}）` : '';
  const summary = item.extras
    .map((extra) => extra.value)
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ');

  chrome.action.setBadgeBackgroundColor({ color: '#4f6bf5' }).catch(() => {});
  chrome.action.setBadgeText({ text: '✓' }).catch(() => {});
  setTimeout(() => chrome.action.setBadgeText({ text: '' }).catch(() => {}), 2200);

  chrome.notifications
    .create(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `已收藏${info.base ? ' ' + info.base : ''}${version}${existed ? '（更新）' : ''}`,
      message: summary || item.title || '已保存到 Favour',
      buttons: [{ title: '打开管理页' }],
    })
    .catch(() => {});
}

async function parseUrl(url) {
  const parserRules = await getParserRules();
  const rule = parserRules.find((entry) => isAllowed(url, entry.matches));
  if (!rule) return null;

  const tabs = await chrome.tabs.query({});
  const target = tabs.find(
    (tab) => tab.url && tab.url.split('#')[0] === String(url).split('#')[0],
  );
  if (!target || target.id == null) return null;

  const parsed = await extractWithRule(target, rule);
  if (!parsed) return null;

  enrichActressAvatars(target, rule, Array.isArray(parsed.extras) ? parsed.extras : []).catch(() => {});

  return {
    title: parsed.title || target.title || '',
    cover: parsed.cover || '',
    extras: Array.isArray(parsed.extras) ? parsed.extras : [],
    source: { id: rule.id, name: rule.name },
  };
}

let syncTimer = null;
let syncPromise = null;

async function readConfiguredTargets() {
  const { syncTargets, syncSettings } = await chrome.storage.local.get([
    'syncTargets',
    'syncSettings',
  ]);
  return readSyncTargets({ syncTargets, syncSettings });
}

async function writeSyncStatus(status) {
  try {
    await chrome.storage.local.set({ syncStatus: status });
  } catch {
    // status is best-effort
  }
}

async function runSync() {
  const targets = await readConfiguredTargets();
  if (!targets.length) {
    const status = {
      ok: false,
      at: Date.now(),
      count: 0,
      error: '未配置同步设备',
      results: [],
    };
    await writeSyncStatus(status);
    return status;
  }

  const { items, actressAvatars, actressMeta } = await chrome.storage.local.get([
    'items',
    'actressAvatars',
    'actressMeta',
  ]);
  const status = await pushToTargets(
    targets,
    buildSyncBody(items, { actressAvatars, actressMeta }),
  );
  await writeSyncStatus(status);
  return status;
}

async function writeTestStatus(status) {
  try {
    await chrome.storage.local.set({ syncTestStatus: status });
  } catch {
    // status is best-effort
  }
}

async function runConnectionTest() {
  const targets = await readConfiguredTargets();
  if (!targets.length) {
    const status = { ok: false, at: Date.now(), results: [], error: '未配置同步目标' };
    await writeTestStatus(status);
    return status;
  }
  const status = await probeTargets(targets);
  await writeTestStatus(status);
  return status;
}

function syncNow() {
  if (!syncPromise) {
    syncPromise = runSync()
      .catch(async (error) => {
        const status = {
          ok: false,
          at: Date.now(),
          count: 0,
          error: error && error.message ? error.message : '同步失败',
          results: [],
        };
        await writeSyncStatus(status);
        return status;
      })
      .finally(() => {
        syncPromise = null;
      });
  }
  return syncPromise;
}

function queueSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncNow();
  }, 1200);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.items || changes.actressAvatars || changes.actressMeta) queueSync();
});

chrome.runtime.onStartup.addListener(() => queueSync());

async function openPrivate(url) {
  if (!isWebUrl(url)) return { ok: false, error: '不支持的网址' };
  try {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const existing = windows.find((window) => window.incognito && window.id != null);
    if (existing) {
      await chrome.tabs.create({ windowId: existing.id, url, active: true });
      await chrome.windows.update(existing.id, { focused: true });
      return { ok: true, reused: true };
    }
    await chrome.windows.create({ url, incognito: true, focused: true });
    return { ok: true, reused: false };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : '请先在扩展详情中允许 InPrivate',
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return undefined;
  if (message.type === 'favour.parse-url') {
    parseUrl(message.url)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse(null));
    return true;
  }
  if (message.type === 'favour.open-private') {
    openPrivate(message.url)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false, error: '打开隐私标签页失败' }));
    return true;
  }
  if (message.type === 'favour.sync-now') {
    syncNow()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false, error: '同步失败' }));
    return true;
  }
  if (message.type === 'favour.sync-test') {
    runConnectionTest()
      .then((result) => sendResponse(result))
      .catch(() =>
        sendResponse({ ok: false, at: Date.now(), results: [], error: '测试失败' }),
      );
    return true;
  }
  return undefined;
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await rememberTab(await chrome.tabs.get(tabId));
  } catch {
    // tab closed before we could read it
  }
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.title === undefined) return;
  rememberTab(tab);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !isWebUrl(tab.url)) {
    await openManager({ reason: 'unsupported-page', url: null });
    return;
  }

  if (!isAllowed(tab.url, await getSettingsRules())) {
    await openManager({ reason: 'not-in-range', url: tab.url });
    return;
  }

  await quickSave(tab);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId !== NOTIFICATION_ID) return;
  chrome.notifications.clear(notificationId);
  openManager();
});

chrome.notifications.onButtonClicked.addListener((notificationId) => {
  if (notificationId !== NOTIFICATION_ID) return;
  chrome.notifications.clear(notificationId);
  openManager();
});

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'favour-save-page',
      title: '用 Favour 收藏此页',
      contexts: ['page', 'selection', 'link', 'image'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
    chrome.contextMenus.create({
      id: 'favour-open-manager',
      title: '打开 Favour 管理页',
      contexts: ['page', 'selection', 'link', 'image'],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'favour-open-manager') {
    await openManager();
    return;
  }
  if (info.menuItemId !== 'favour-save-page') return;

  const target = tab || (info.tabId != null ? await chrome.tabs.get(info.tabId).catch(() => null) : null);
  if (!target || !isWebUrl(target.url)) {
    await openManager({ reason: 'unsupported-page', url: null });
    return;
  }
  if (!isAllowed(target.url, await getSettingsRules())) {
    await openManager({ reason: 'not-in-range', url: target.url });
    return;
  }
  await quickSave(target);
});

setupMenus();
setupBackupSchedule();
chrome.runtime.onStartup.addListener(setupMenus);
chrome.runtime.onInstalled.addListener(({ reason }) => {
  setupMenus();
  if (reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL(MANAGER_PATH) });
  }
});
