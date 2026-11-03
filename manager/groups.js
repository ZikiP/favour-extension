// 按「作品」聚合收藏：同一部作品的不同版本（原版 / 中文字幕 / 无码）在列表里只占一张卡片。
//
// 条目本身仍然是一条一个版本地存在 chrome.storage 里 —— 播放地址、封面、番号都各是各的，
// 这里只在渲染时把它们归到一组，不改动存储格式，同步快照也不用跟着变。

import { compareVersions, pickPreferred, versionOf, workKeyOf } from '../shared/versions.js';
import { extraValue, runtimeSeconds } from './meta.js';
import { state } from './store.js';

const cache = new WeakMap();

export function groupKeyOf(item) {
  return workKeyOf(item) || `item:${item.id}`;
}

export function groupsOf(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const cached = cache.get(items);
  if (cached) return cached;

  const map = new Map();
  for (const item of items) {
    const key = groupKeyOf(item);
    let group = map.get(key);
    if (!group) {
      group = { key, items: [] };
      map.set(key, group);
    }
    group.items.push(item);
  }

  const groups = [...map.values()].map(build);
  cache.set(items, groups);
  return groups;
}

function build({ key, items }) {
  const versions = items.slice().sort(compareVersions);
  const primary = pickPreferred(versions) || versions[0];
  const coverFrom = versions.find((entry) => entry.cover) || primary;
  const titleFrom = versions.find((entry) => entry.title) || primary;

  return {
    key,
    code: versionOf(primary).base,
    versions,
    primary,
    ids: versions.map((entry) => entry.id),
    title: titleFrom.title || '',
    cover: coverFrom.cover || '',
    source: primary.source || null,
    favorite: versions.some((entry) => entry.favorite),
    watched: versions.some((entry) => entry.watched),
    runtime: runtimeSeconds(extraValue(primary, 'runtime')),
    createdAt: Math.min(...versions.map((entry) => Number(entry.createdAt) || 0)),
    updatedAt: Math.max(...versions.map((entry) => Number(entry.updatedAt) || 0)),
    lastOpenedAt: Math.max(...versions.map((entry) => Number(entry.lastOpenedAt) || 0)),
  };
}

export function groupOfItem(item, items = state.items) {
  if (!item) return null;
  const key = groupKeyOf(item);
  return groupsOf(items).find((group) => group.key === key) || null;
}

// 选中一张卡片等于选中它的全部版本，删除 / 喜爱 / 已看都按作品生效
export function expandIds(ids, items = state.items) {
  const wanted = new Set(ids);
  if (!wanted.size) return [];
  const result = new Set();
  for (const group of groupsOf(items)) {
    if (group.ids.some((id) => wanted.has(id))) {
      for (const id of group.ids) result.add(id);
    }
  }
  for (const id of wanted) result.add(id);
  return [...result];
}

export function sortGroups(groups, sort = state.sort) {
  const list = groups.slice();
  if (sort === 'opened') {
    list.sort(
      (a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || b.createdAt - a.createdAt,
    );
  } else if (sort === 'runtime') {
    list.sort((a, b) => (b.runtime || 0) - (a.runtime || 0) || b.createdAt - a.createdAt);
  } else {
    list.sort((a, b) => b.createdAt - a.createdAt);
  }
  return list;
}

export function versionCount(groups) {
  return groups.reduce((total, group) => total + group.versions.length, 0);
}
