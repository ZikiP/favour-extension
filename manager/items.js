import { hostOf, toast, truncate } from './dom.js';
import { groupsOf } from './groups.js';
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

// 卡片的播放按钮：一部作品有多版本时按优先级选版本（中文字幕 > 无码 > 原版）
export async function openGroup(group) {
  if (!group || !group.primary) return;
  await openItem(group.primary);
}

export async function openRandom() {
  const groups = groupsOf(state.items).filter((group) => group.key !== state.lastRandomId);
  const candidates = groups.length ? groups : groupsOf(state.items);
  if (!candidates.length) {
    toast('还没有收藏，先收藏一个页面吧');
    return;
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  state.lastRandomId = pick.key;
  await openGroup(pick);
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

// 最爱与已看按作品生效：点一次卡片，所有版本一起变
export async function toggleFavoriteGroup(group) {
  if (!group || !group.ids.length) return;
  const ids = new Set(group.ids);
  const favorite = !group.favorite;
  await keep(state.items.map((entry) =>
    ids.has(entry.id) ? { ...entry, favorite, updatedAt: Date.now() } : entry,
  ));
  render();
  toast(favorite ? '已加入最爱' : '已取消最爱');
}

export async function toggleWatchedGroup(group) {
  if (!group || !group.ids.length) return;
  const ids = new Set(group.ids);
  const watched = !group.watched;
  await keep(state.items.map((entry) =>
    ids.has(entry.id) ? { ...entry, watched, updatedAt: Date.now() } : entry,
  ));
  render();
  toast(watched ? '已标记为已看' : '已标记为未看');
}

export async function setFavoriteMany(ids, favorite) {
  const wanted = new Set(ids);
  await keep(state.items.map((entry) =>
    wanted.has(entry.id) ? { ...entry, favorite, updatedAt: Date.now() } : entry,
  ));
  render();
}

export async function setWatchedMany(ids, watched) {
  const wanted = new Set(ids);
  await keep(state.items.map((entry) =>
    wanted.has(entry.id) ? { ...entry, watched, updatedAt: Date.now() } : entry,
  ));
  render();
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

// 删除一张卡片 = 删掉这部作品的全部版本，撤销时一起恢复
export async function removeGroup(group) {
  if (!group || !group.ids.length) return;
  const wanted = new Set(group.ids);
  const removed = state.items.filter((entry) => wanted.has(entry.id));
  if (!removed.length) return;

  await keep(state.items.filter((entry) => !wanted.has(entry.id)));
  render();

  const name = group.code || truncate(group.title || hostOf(group.primary.url), 18);
  const suffix = removed.length > 1 ? `（${removed.length} 个版本）` : '';
  toast(`已删除「${name}」${suffix}`, {
    label: '撤销',
    duration: 6000,
    onAction: async () => {
      await restoreItems(removed);
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
    return true;
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
    return ok;
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
