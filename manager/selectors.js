import { baseActressName } from '../shared/names.js';
import { workKeyOf } from '../shared/versions.js';
import { matchesQuery } from './dom.js';
import { extraValue, genresOf, runtimeSeconds, seriesOf } from './meta.js';
import { state } from './store.js';

// 统计口径按「作品」算：同一部作品的中文字幕版和无码版只算一部
function workOf(item) {
  return workKeyOf(item) || `item:${item.id}`;
}

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
  const works = new Map();
  for (const item of state.items) {
    const work = workOf(item);
    for (const raw of actressNames(item)) {
      const name = baseActressName(raw);
      const key = name.toLowerCase();
      if (!key) continue;
      if (!map.has(key)) {
        const meta = state.actressMeta[key] || {};
        map.set(key, {
          key,
          name,
          count: 0,
          avatar: state.actressAvatars[key] || '',
          favorite: meta.favorite === true,
          order: Number(meta.order) || 0,
        });
        works.set(key, new Set());
      }
      const seen = works.get(key);
      if (seen.has(work)) continue;
      seen.add(work);
      map.get(key).count += 1;
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      Number(b.favorite) - Number(a.favorite) ||
      b.order - a.order ||
      b.count - a.count ||
      a.name.localeCompare(b.name, 'zh-Hans-CN'),
  );
}

export function actressLabel(key) {
  const match = actressStats().find((stat) => stat.key === key);
  return match ? match.name : key;
}

export function genreStats() {
  const map = new Map();
  const works = new Map();
  for (const item of state.items) {
    const work = workOf(item);
    for (const label of genresOf(item)) {
      const key = label.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { key, label, count: 0 });
        works.set(key, new Set());
      }
      const seen = works.get(key);
      if (seen.has(work)) continue;
      seen.add(work);
      map.get(key).count += 1;
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'),
  );
}

export function genreLabel(key) {
  const match = genreStats().find((stat) => stat.key === key);
  return match ? match.label : key;
}

export function seriesStats() {
  const map = new Map();
  const works = new Map();
  for (const item of state.items) {
    const label = seriesOf(item);
    if (!label) continue;
    const key = label.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { key, label, count: 0, cover: '', latestAt: 0 });
      works.set(key, new Set());
    }
    const entry = map.get(key);
    if (item.cover && (!entry.cover || item.createdAt >= entry.latestAt)) {
      entry.cover = item.cover;
    }
    if (item.createdAt > entry.latestAt) entry.latestAt = item.createdAt;
    const seen = works.get(key);
    const work = workOf(item);
    if (seen.has(work)) continue;
    seen.add(work);
    entry.count += 1;
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'),
  );
}

export function seriesLabel(key) {
  const match = seriesStats().find((stat) => stat.key === key);
  return match ? match.label : key;
}

export function relatedItems(item) {
  const genres = genresOf(item).map((value) => value.toLowerCase());
  const series = seriesOf(item).toLowerCase();
  const actresses = actressNames(item).map((name) => baseActressName(name).toLowerCase());
  const work = workOf(item);

  return state.items
    // 同一部作品的其他版本不算「相关收藏」，它们在详情页的版本选择里
    .filter((other) => other.id !== item.id && workOf(other) !== work)
    .map((other) => {
      let score = 0;
      if (series && seriesOf(other).toLowerCase() === series) score += 4;
      const otherGenres = genresOf(other).map((value) => value.toLowerCase());
      score += otherGenres.filter((value) => genres.includes(value)).length;
      const otherActresses = actressNames(other).map((name) =>
        baseActressName(name).toLowerCase(),
      );
      if (actresses.some((name) => otherActresses.includes(name))) score += 2;
      return { item: other, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.createdAt - a.item.createdAt)
    .slice(0, 6)
    .map((entry) => entry.item);
}

export function sortItems(items) {
  const sorted = items.slice();
  if (state.sort === 'opened') {
    sorted.sort(
      (a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || b.createdAt - a.createdAt,
    );
  } else if (state.sort === 'runtime') {
    const seconds = new Map(
      sorted.map((item) => [item.id, runtimeSeconds(extraValue(item, 'runtime'))]),
    );
    sorted.sort(
      (a, b) => (seconds.get(b.id) || 0) - (seconds.get(a.id) || 0) || b.createdAt - a.createdAt,
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
        if (!state.genre) return true;
        return genresOf(item).some((value) => value.toLowerCase() === state.genre);
      })
      .filter((item) => {
        if (!state.series) return true;
        return seriesOf(item).toLowerCase() === state.series;
      })
      .filter((item) => matchesQuery(item, state.query)),
  );
}
