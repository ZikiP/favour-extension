import { els, toast } from './dom.js';
import { local } from './store.js';

const SYNC_DEFAULT_URL = 'http://127.0.0.1:8789';

export async function openSyncDialog() {
  const data = await local.get(['syncSettings', 'syncStatus']);
  const settings = data.syncSettings || {};
  els.syncUrl.value = settings.url || SYNC_DEFAULT_URL;
  els.syncPublicUrl.value = settings.publicUrl || '';
  els.syncToken.value = settings.token || '';
  renderSyncStatus(data.syncStatus || null);
  if (!els.syncDialog.open) els.syncDialog.showModal();
}

export function syncUrlValue(raw) {
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

export function renderSyncStatus(status) {
  if (!status) {
    els.syncStatus.textContent = '尚未同步';
    return;
  }
  const time = formatSyncTime(status.at);
  els.syncStatus.textContent = status.ok
    ? `上次同步：${time} · ${status.count || 0} 条`
    : `上次同步失败：${status.error || '未知错误'}（${time}）`;
}

export async function runPhoneSync() {
  els.syncNow.disabled = true;
  try {
    const status = await chrome.runtime.sendMessage({ type: 'favour.sync-now' });
    renderSyncStatus(status || null);
    if (status && status.ok) toast(`已同步 ${status.count || 0} 条`);
    else toast(status && status.error ? `同步失败：${status.error}` : '同步失败', { tone: 'error' });
  } catch {
    toast('同步失败', { tone: 'error' });
  } finally {
    els.syncNow.disabled = false;
  }
}
