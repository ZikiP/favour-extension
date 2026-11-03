import { baseActressName } from '../shared/names.js';
import { dedupeTags, toast } from './dom.js';

export const local = chrome.storage.local;
export const session = chrome.storage.session;

export const state = {
  items: [],
  rules: [],
  parserRules: [],
  actressAvatars: {},
  actressMeta: {},
  lastTab: null,
  query: '',
  view: 'library', // library | actresses | favorites
  actress: null, // 小写演员名，用于收藏视图筛选
  watched: false, // 只看未看
  genre: null, // 小写类型名
  series: null, // 小写系列名
  sort: 'created', // created | opened | runtime
  page: 1,
  pages: 1,
  selecting: false,
  selected: new Set(),
  editing: null,
  lastRandomId: null,
  pendingImport: null,
  draftGenres: [],
  draftExtras: [],
  draftCover: '',
  draftSource: null,
};

export async function refresh() {
  const data = await local.get(['items', 'settings', 'parserRules', 'actressAvatars', 'actressMeta', 'prefs']);
  const { items, merged } = mergeByCode(normalizeItems(data.items));
  state.items = items;
  state.rules = readRules(data.settings);
  state.parserRules = readParserRules(data.parserRules);
  state.actressAvatars = normalizeAvatars(data.actressAvatars);
  state.actressMeta = normalizeActressMeta(data.actressMeta);
  const prefs = data.prefs && typeof data.prefs === 'object' ? data.prefs : {};
  if (['library', 'actresses', 'favorites', 'collections'].includes(prefs.view)) state.view = prefs.view;
  if (['created', 'opened', 'runtime'].includes(prefs.sort)) state.sort = prefs.sort;
  if (merged) {
    try {
      await local.set({ items });
    } catch {
      // keep the in-memory merge even if the write fails
    }
    toast(`已合并 ${merged} 条同番号收藏`);
  }
  try {
    state.lastTab = (await session.get('lastTab')).lastTab || null;
  } catch {
    state.lastTab = null;
  }
}

export function readRules(settings) {
  if (!settings || !Array.isArray(settings.whitelist)) return [];
  return settings.whitelist.filter((rule) => typeof rule === 'string');
}

export function savePrefs() {
  local.set({ prefs: { view: state.view, sort: state.sort } }).catch(() => {});
}

export function normalizeAvatars(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const avatars = {};
  for (const [name, url] of Object.entries(raw)) {
    const key = baseActressName(name).toLowerCase();
    if (!key || typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
    avatars[key] = url;
  }
  return avatars;
}

export function normalizeActressMeta(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const meta = {};
  for (const [name, value] of Object.entries(raw)) {
    const key = baseActressName(name).toLowerCase();
    if (!key || !value || typeof value !== 'object') continue;
    const favorite = value.favorite === true;
    const parsed = Math.trunc(Number(value.order));
    const order = Number.isFinite(parsed) ? Math.max(0, Math.min(9999, parsed)) : 0;
    if (!favorite && !order) continue;
    meta[key] = { favorite, order };
  }
  return meta;
}

export async function keep(items) {
  const { items: merged } = mergeByCode(normalizeItems(items));
  state.items = merged;
  try {
    await local.set({ items: state.items });
  } catch (error) {
    toast('保存失败：' + (error && error.message ? error.message : '存储空间不足'), { tone: 'error' });
  }
}

function codeOfExtras(extras) {
  const extra = (Array.isArray(extras) ? extras : []).find(
    (entry) => entry && entry.key === 'code' && typeof entry.value === 'string' && entry.value.trim(),
  );
  return extra ? extra.value.trim().toLowerCase() : '';
}

function codeOfItem(item) {
  return item ? codeOfExtras(item.extras) : '';
}

export function normalizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry.url === 'string')
    .map((entry) => ({
      id: typeof entry.id === 'string' && entry.id ? entry.id : crypto.randomUUID(),
      url: entry.url,
      title: typeof entry.title === 'string' ? entry.title : '',
      tags: Array.isArray(entry.tags) ? dedupeTags(entry.tags.filter((tag) => typeof tag === 'string')) : [],
      favorite: entry.favorite === true,
      watched: entry.watched === true,
      lastOpenedAt: Number(entry.lastOpenedAt) || 0,
      extras: Array.isArray(entry.extras)
        ? entry.extras
            .filter((extra) => extra && typeof extra.value === 'string' && extra.value.trim())
            .map((extra) => ({
              key: String(extra.key || extra.label || ''),
              label: String(extra.label || extra.key || ''),
              value: String(extra.value),
            }))
        : [],
      cover:
        typeof entry.cover === 'string' && /^(https?:|data:image\/)/i.test(entry.cover)
          ? entry.cover
          : '',
      source:
        entry.source && typeof entry.source === 'object' && entry.source.name
          ? { id: String(entry.source.id || ''), name: String(entry.source.name) }
          : null,
      createdAt: Number(entry.createdAt) || Date.now(),
      updatedAt: Number(entry.updatedAt) || Number(entry.createdAt) || Date.now(),
    }));
}

function mergeExtras(oldList, newList) {
  const map = new Map();
  for (const extra of oldList) map.set(extra.key, extra);
  for (const extra of newList) {
    const previous = map.get(extra.key);
    map.set(extra.key, previous && !extra.value ? previous : extra);
  }
  return [...map.values()];
}

function mergeItem(base, other) {
  const [older, newer] = base.updatedAt <= other.updatedAt ? [base, other] : [other, base];
  return {
    ...base,
    url: newer.url,
    title: newer.title || older.title,
    cover: newer.cover || older.cover,
    source: newer.source || older.source,
    extras: mergeExtras(older.extras, newer.extras),
    tags: dedupeTags([...base.tags, ...other.tags]),
    favorite: base.favorite || other.favorite,
    watched: base.watched || other.watched,
    lastOpenedAt: Math.max(base.lastOpenedAt || 0, other.lastOpenedAt || 0),
    createdAt: Math.min(base.createdAt, other.createdAt),
    updatedAt: Math.max(base.updatedAt, other.updatedAt),
  };
}

export function mergeByCode(items) {
  const seen = new Map();
  const result = [];
  let merged = 0;
  for (const item of items) {
    const code = codeOfItem(item);
    if (!code) {
      result.push(item);
      continue;
    }
    const index = seen.get(code);
    if (index === undefined) {
      seen.set(code, result.length);
      result.push(item);
    } else {
      result[index] = mergeItem(result[index], item);
      merged += 1;
    }
  }
  return { items: result, merged };
}

export async function upsert({ id, url, title, tags, extras = [], cover = '', source = null }) {
  const now = Date.now();
  const items = state.items.slice();
  let index = id ? items.findIndex((entry) => entry.id === id) : -1;
  if (index < 0) index = items.findIndex((entry) => entry.url === url);
  if (index < 0) {
    const code = codeOfExtras(extras);
    if (code) index = items.findIndex((entry) => codeOfItem(entry) === code);
  }

  if (index >= 0) {
    const existing = items[index];
    const mergedTags = id && existing.id === id ? tags : dedupeTags([...existing.tags, ...tags]);
    items[index] = {
      ...existing,
      url,
      title,
      tags: mergedTags,
      extras: Array.isArray(extras) && extras.length ? extras : existing.extras || [],
      cover: cover || existing.cover || '',
      source: source || existing.source || null,
      updatedAt: now,
    };
    await keep(items);
    return 'updated';
  }

  items.unshift({
    id: crypto.randomUUID(),
    url,
    title,
    tags,
    favorite: false,
    watched: false,
    lastOpenedAt: 0,
    extras: Array.isArray(extras) ? extras : [],
    cover: cover || '',
    source: source || null,
    createdAt: now,
    updatedAt: now,
  });
  await keep(items);
  return 'added';
}

// 页面弹窗守卫的配置，随规则一起存。缺省（没有 guard）表示该站点不需要守卫。
export function normalizeGuard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const popPath =
    typeof raw.popPath === 'string' && raw.popPath.trim().startsWith('/')
      ? raw.popPath.trim().replace(/\/+$/, '')
      : '';
  const blockCrossOrigin = raw.blockCrossOrigin !== false;
  if (!popPath && !blockCrossOrigin) return null;
  return { popPath, blockCrossOrigin };
}

export function normalizeParserRule(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const searchUrl = typeof raw.searchUrl === 'string' ? raw.searchUrl.trim() : '';
  const matches = Array.isArray(raw.matches)
    ? raw.matches.filter((match) => typeof match === 'string' && match.trim())
    : [];
  const fields = Array.isArray(raw.fields)
    ? raw.fields.filter(
        (field) =>
          field &&
          typeof field.key === 'string' &&
          Array.isArray(field.sources) &&
          field.sources.length > 0,
      )
    : [];

  if (!id || !name || !matches.length || !fields.length) return null;

  const guard = normalizeGuard(raw.guard);

  return {
    id,
    name,
    version: typeof raw.version === 'string' && raw.version ? raw.version : '1.0.0',
    description: typeof raw.description === 'string' ? raw.description : '',
    searchUrl,
    matches,
    fields,
    ...(guard ? { guard } : {}),
  };
}

export function readParserRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeParserRule).filter(Boolean);
}
