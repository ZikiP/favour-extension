import { baseActressName } from '../shared/names.js';
import { matchesQuery } from './dom.js';
import { state } from './store.js';

export function actressNames(item) {
  const extra = item.extras.find((entry) => entry.key === 'actress');
  if (!extra || !extra.value) return [];
  return extra.value
    .split(/[,，、]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function actressStats() {
  const map = new Map();
  for (const item of state.items) {
    for (const raw of actressNames(item)) {
      const name = baseActressName(raw);
      const key = name.toLowerCase();
      if (!key) continue;
      if (!map.has(key)) map.set(key, { key, name, count: 0, avatar: state.actressAvatars[key] || '' });
      map.get(key).count += 1;
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'),
  );
}

export function actressLabel(key) {
  const match = actressStats().find((stat) => stat.key === key);
  return match ? match.name : key;
}

export function tagStats() {
  const map = new Map();
  for (const item of state.items) {
    for (const tag of item.tags) {
      const key = tag.toLowerCase();
      if (!map.has(key)) map.set(key, { label: tag, count: 0 });
      map.get(key).count += 1;
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'),
  );
}

export function tagLabel(key) {
  const match = tagStats().find((stat) => stat.label.toLowerCase() === key);
  return match ? match.label : key;
}

export function sortItems(items) {
  const sorted = items.slice();
  if (state.sort === 'opened') {
    sorted.sort(
      (a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || b.createdAt - a.createdAt,
    );
  } else {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

export function visibleItems() {
  return sortItems(
    state.items
      .filter((item) => (state.watched ? !item.watched : true))
      .filter((item) => {
        if (!state.actress) return true;
        return actressNames(item).some((name) => baseActressName(name).toLowerCase() === state.actress);
      })
      .filter((item) => {
        if (state.tag === null) return true;
        if (state.tag === '') return item.tags.length === 0;
        return item.tags.some((tag) => tag.toLowerCase() === state.tag);
      })
      .filter((item) => matchesQuery(item, state.query)),
  );
}
