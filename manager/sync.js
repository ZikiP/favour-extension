import { els, el, ICON, iconButton, toast } from './dom.js';
import { local } from './store.js';
import {
  readSyncTargets,
  syncTargetId,
  SYNC_TARGET_LIMIT,
} from '../shared/sync-targets.js';

let lastSavedTargets = [];

export async function openSyncDialog() {
  clearSyncError();
  const data = await local.get(['syncTargets', 'syncSettings', 'syncStatus']);
  const targets = readSyncTargets(data);
  lastSavedTargets = targets;
  renderSyncTargets(targets.length ? targets : [blankTarget()]);
  renderSyncStatus(data.syncStatus || null, targets);
  if (!els.syncDialog.open) els.syncDialog.showModal();
  requestAnimationFrame(() => {
    const input = els.syncTargets.querySelector('.sync-target [data-role="url"]');
    if (input && !input.value) input.focus();
  });
}

export function addSyncTarget() {
  const cards = targetCards();
  if (cards.length >= SYNC_TARGET_LIMIT) return;
  els.syncTargets.querySelector('.rule-empty')?.remove();
  const card = syncTargetCard(blankTarget(), cards.length);
  els.syncTargets.append(card);
  refreshTargetPlaceholders();
  refreshAddButton();
  clearSyncError();
  card.querySelector('[data-role="url"]')?.focus();
}

export function collectSyncTargets() {
  clearSyncError();
  const cards = targetCards();
  if (!cards.length) {
    showSyncError('请至少添加一个同步目标');
    return null;
  }

  const targets = [];
  const seen = new Set();
  let firstInvalid = null;
  let message = '';
  let hasContent = false;

  const fail = (input, text) => {
    if (!message) message = text;
    if (!input) return;
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    if (!firstInvalid) firstInvalid = input;
  };

  cards.forEach((card, index) => {
    const nameInput = card.querySelector('[data-role="name"]');
    const urlInput = card.querySelector('[data-role="url"]');
    const tokenInput = card.querySelector('[data-role="token"]');
    [urlInput, tokenInput].forEach((input) => {
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
    });

    const rawUrl = urlInput.value.trim();
    const token = tokenInput.value.trim();
    const rawName = nameInput.value.trim();
    if (!rawUrl && !token && !rawName) return;
    hasContent = true;

    const label = `第 ${index + 1} 个目标`;
    if (!rawUrl) {
      fail(urlInput, `${label}：请填写接收地址`);
      return;
    }
    const url = syncUrlValue(rawUrl);
    if (!url) {
      fail(urlInput, `${label}：接收地址需要是 http(s) 地址`);
      return;
    }
    if (!token) {
      fail(tokenInput, `${label}：请填写访问令牌`);
      return;
    }
    if (seen.has(url)) {
      fail(urlInput, `${label}：接收地址重复`);
      return;
    }
    seen.add(url);

    const name = rawName || `目标 ${index + 1}`;
    if (!rawName) nameInput.value = name;
    targets.push({
      id: card.dataset.id || syncTargetId(),
      name,
      url,
      token,
    });
  });

  if (!hasContent) {
    showSyncError('请至少填写一个同步目标的地址和令牌');
    return null;
  }
  if (message) {
    showSyncError(message);
    firstInvalid?.focus();
    return null;
  }
  return targets;
}

export async function saveSyncTargets(targets) {
  await local.set({ syncTargets: targets });
  try {
    await local.remove('syncSettings');
  } catch {
    // syncTargets takes precedence; the legacy key is harmless
  }
  lastSavedTargets = targets;
}

export async function runPhoneSync() {
  els.syncNow.disabled = true;
  try {
    const status = await chrome.runtime.sendMessage({ type: 'favour.sync-now' });
    renderSyncStatus(status || null);
    if (status && status.ok) {
      const targets = Array.isArray(status.results) ? status.results.length : 1;
      toast(`已同步到 ${targets} 个目标 · ${status.count || 0} 条`);
    } else if (status && Array.isArray(status.results) && status.results.length) {
      const okCount = status.results.filter((result) => result.ok).length;
      toast(`同步完成：${okCount}/${status.results.length} 个目标成功`, { tone: 'error' });
    } else {
      toast(status && status.error ? `同步失败：${status.error}` : '同步失败', {
        tone: 'error',
      });
    }
  } catch {
    toast('同步失败', { tone: 'error' });
  } finally {
    els.syncNow.disabled = false;
  }
}

export function renderSyncStatus(status, targets = lastSavedTargets) {
  els.syncStatus.replaceChildren();
  if (!status) {
    els.syncStatus.textContent = '尚未同步';
    return;
  }

  const time = formatSyncTime(status.at);
  const results = Array.isArray(status.results) ? status.results : null;
  if (!results) {
    els.syncStatus.textContent = status.ok
      ? `上次同步：${time} · ${status.count || 0} 条`
      : `上次同步失败：${status.error || '未知错误'}（${time}）`;
    return;
  }

  if (!results.length) {
    els.syncStatus.textContent = status.error
      ? `${status.error}（${time}）`
      : `尚未同步（${time}）`;
    return;
  }

  const okCount = results.filter((result) => result.ok).length;
  const headText = status.ok
    ? `全部成功 · ${time}`
    : okCount
      ? `部分失败 · ${time}`
      : `全部失败 · ${time}`;
  els.syncStatus.append(
    el('div', 'sync-status-head' + (status.ok ? '' : ' is-fail'), headText),
  );

  const byId = new Map(results.map((result) => [result.id, result]));
  const rows = targets.length ? targets : results;
  for (const target of rows) {
    const result = byId.get(target.id);
    const row = el('div', 'sync-status-row');
    row.append(el('span', 'sync-status-name', target.name));
    if (!result) {
      row.append(el('span', 'sync-status-detail', '等待同步'));
    } else if (result.ok) {
      row.append(el('span', 'sync-status-detail', `${result.count || 0} 条`));
    } else {
      row.append(el('span', 'sync-status-detail is-fail', result.error || '同步失败'));
    }
    els.syncStatus.append(row);
  }
}

export function clearSyncError() {
  els.syncError.hidden = true;
  els.syncError.textContent = '';
}

function renderSyncTargets(targets) {
  els.syncTargets.replaceChildren();
  targets.forEach((target, index) => {
    els.syncTargets.append(syncTargetCard(target, index));
  });
  if (!targets.length) {
    els.syncTargets.append(
      el('p', 'rule-empty', '还没有同步目标。点下方「添加目标」填写地址和令牌。'),
    );
  }
  refreshAddButton();
}

function syncTargetCard(target, index) {
  const card = el('div', 'sync-target');
  card.dataset.id = target.id;

  const head = el('div', 'sync-target-head');
  const name = textInput(target.name, `目标 ${index + 1}`);
  name.className = 'sync-target-name';
  name.dataset.role = 'name';
  name.setAttribute('aria-label', `第 ${index + 1} 个目标名称`);
  head.append(name, iconButton('移除目标', ICON.trash, () => removeSyncTarget(card), 'is-danger'));

  const url = textInput(target.url, 'https://host/favour 或 http://ip:8790');
  url.dataset.role = 'url';
  url.setAttribute('aria-label', `第 ${index + 1} 个目标地址`);

  const token = textInput(target.token, '中间服务或 App 的访问令牌');
  token.type = 'password';
  token.dataset.role = 'token';
  token.setAttribute('aria-label', `第 ${index + 1} 个目标访问令牌`);

  card.append(head, field('地址', url), field('访问令牌', token));
  return card;
}

function textInput(value, placeholder) {
  const input = el('input');
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder || '';
  input.autocomplete = 'off';
  input.spellcheck = false;
  return input;
}

function field(label, control) {
  const wrap = el('label', 'field');
  wrap.append(el('span', null, label), control);
  return wrap;
}

function removeSyncTarget(card) {
  card.remove();
  if (!targetCards().length) {
    els.syncTargets.append(
      el('p', 'rule-empty', '还没有同步目标。点下方「添加目标」填写地址和令牌。'),
    );
  }
  refreshTargetPlaceholders();
  refreshAddButton();
  clearSyncError();
}

function targetCards() {
  return [...els.syncTargets.querySelectorAll('.sync-target')];
}

function blankTarget() {
  return { id: syncTargetId(), name: '', url: '', token: '' };
}

function refreshTargetPlaceholders() {
  targetCards().forEach((card, index) => {
    const name = card.querySelector('[data-role="name"]');
    if (name) name.placeholder = `目标 ${index + 1}`;
  });
}

function refreshAddButton() {
  els.syncAdd.disabled = targetCards().length >= SYNC_TARGET_LIMIT;
}

function syncUrlValue(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function formatSyncTime(at) {
  if (!at) return '未知时间';
  const date = new Date(at);
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function showSyncError(message) {
  els.syncError.textContent = message;
  els.syncError.hidden = false;
}
