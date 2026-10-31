import { hostOf, toast, truncate } from './dom.js';
import { keep, local, normalizeItems, state } from './store.js';
import { isAllowed } from '../shared/url-rules.js';
import { render } from './views.js';

export async function openPrivate(url) {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'favour.open-private', url });
    if (!result || !result.ok) {
      toast(result && result.error ? `无法打开隐私标签页：${result.error}` : '无法打开隐私标签页', {
        tone: 'error',
        duration: 6000,
      });
    }
  } catch {
    toast('无法打开隐私标签页', { tone: 'error', duration: 6000 });
  }
}

export async function openItem(item) {
  const opened = { ...item, lastOpenedAt: Date.now() };
  await keep(state.items.map((entry) => (entry.id === item.id ? opened : entry)));
  render();
  await openPrivate(item.url);
}

export async function openRandom() {
  const pool = state.items.filter((item) => item.id !== state.lastRandomId);
  const candidates = pool.length ? pool : state.items;
  if (!candidates.length) {
    toast('还没有收藏，先收藏一个页面吧');
    return;
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  state.lastRandomId = pick.id;
  await openItem(pick);
}

export async function toggleFavoriteItem(item) {
  const next = state.items.map((entry) =>
    entry.id === item.id ? { ...entry, favorite: !entry.favorite, updatedAt: Date.now() } : entry,
  );
  await keep(next);
  render();
  toast(item.favorite ? '已取消最爱' : '已加入最爱');
}

export async function toggleWatched(item) {
  const next = state.items.map((entry) =>
    entry.id === item.id ? { ...entry, watched: !entry.watched, updatedAt: Date.now() } : entry,
  );
  await keep(next);
  render();
  toast(item.watched ? '已标记为未看' : '已标记为已看');
}

async function restoreItems(removed) {
  const data = await local.get('items');
  const current = normalizeItems(data.items);
  const existing = new Set(current.map((entry) => entry.id));
  const restore = removed.filter((entry) => !existing.has(entry.id));
  await keep([...restore, ...current]);
  render();
  return restore.length;
}

export async function removeItem(item) {
  const index = state.items.findIndex((entry) => entry.id === item.id);
  if (index < 0) return;

  await keep(state.items.filter((entry) => entry.id !== item.id));
  render();

  toast(`已删除「${truncate(item.title || hostOf(item.url), 18)}」`, {
    label: '撤销',
    duration: 6000,
    onAction: async () => {
      await restoreItems([item]);
      toast('已恢复收藏');
    },
  });
}

export async function removeMany(ids) {
  const wanted = new Set(ids);
  const removed = state.items.filter((entry) => wanted.has(entry.id));
  if (!removed.length) return;

  await keep(state.items.filter((entry) => !wanted.has(entry.id)));
  render();

  toast(`已删除 ${removed.length} 条收藏`, {
    label: '撤销',
    duration: 6000,
    onAction: async () => {
      const count = await restoreItems(removed);
      toast(`已恢复 ${count} 条收藏`);
    },
  });
}

export async function copyUrl(item) {
  try {
    await navigator.clipboard.writeText(item.url);
    toast('链接已复制');
  } catch {
    const area = document.createElement('textarea');
    area.value = item.url;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    toast(ok ? '链接已复制' : '复制失败，请手动复制', ok ? {} : { tone: 'error' });
  }
}

export function searchUrlFor(item) {
  const codeExtra = item.extras.find((extra) => extra.key === 'code');
  const code = codeExtra && typeof codeExtra.value === 'string' ? codeExtra.value.trim() : '';
  const rule =
    state.parserRules.find((entry) => item.source && entry.id === item.source.id) ||
    state.parserRules.find((entry) => isAllowed(item.url, entry.matches));
  if (!rule || typeof rule.searchUrl !== 'string' || !rule.searchUrl) return '';
  if (rule.searchUrl.includes('{code}') && !code) return '';
  return rule.searchUrl
    .replace(/\{code\}/g, encodeURIComponent(code))
    .replace(/\{title\}/g, encodeURIComponent(item.title || ''));
}

export function openRelocate(item) {
  const url = searchUrlFor(item);
  if (url) openPrivate(url);
}
