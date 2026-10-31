export const $ = (selector, root = document) => root.querySelector(selector);

export const ICON = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4-6.5 4V4.5a1 1 0 0 1 1-1Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12.5" height="12.5" rx="2.2"/><path d="M5.5 15H4.2A1.2 1.2 0 0 1 3 13.8V4.2A1.2 1.2 0 0 1 4.2 3h9.6A1.2 1.2 0 0 1 15 4.2V5.5"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5h9"/><path d="M16.6 3.9a2.1 2.1 0 0 1 3 3L7.3 19.2l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6h17"/><path d="M8.5 6V4.4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1V6"/><path d="M18.6 6l-.9 13.6a1 1 0 0 1-1 .9H7.3a1 1 0 0 1-1-.9L5.4 6"/><path d="M10 10.8v5.4M14 10.8v5.4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.4s-7.4-4.5-7.4-9.6A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 7.4 3.1c0 5.1-7.4 9.6-7.4 9.6Z"/></svg>',
  heartOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.4s-7.4-4.5-7.4-9.6A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 7.4 3.1c0 5.1-7.4 9.6-7.4 9.6Z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"/><path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6"/><path d="M6.6 6.7A17 17 0 0 0 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};

export const els = {
  search: $('#search'),
  addCurrent: $('#addCurrent'),
  randomBtn: $('#randomBtn'),
  settingsBtn: $('#settingsBtn'),
  rangeNotice: $('#rangeNotice'),
  noticeConfig: $('#noticeConfig'),
  settings: $('#settings'),
  settingsForm: $('#settingsForm'),
  ruleList: $('#ruleList'),
  ruleInput: $('#ruleInput'),
  ruleError: $('#ruleError'),
  settingsDone: $('#settingsDone'),
  syncBtn: $('#syncBtn'),
  syncDialog: $('#syncDialog'),
  syncForm: $('#syncForm'),
  syncUrl: $('#syncUrl'),
  syncPublicUrl: $('#syncPublicUrl'),
  syncToken: $('#syncToken'),
  syncStatus: $('#syncStatus'),
  syncOpen: $('#syncOpen'),
  syncNow: $('#syncNow'),
  rulesBtn: $('#rulesBtn'),
  tagsBtn: $('#tagsBtn'),
  rulesDialog: $('#rulesDialog'),
  rulesForm: $('#rulesForm'),
  parserRuleList: $('#parserRuleList'),
  importRuleBtn: $('#importRuleBtn'),
  importRuleFile: $('#importRuleFile'),
  parserRuleError: $('#parserRuleError'),
  rulesDone: $('#rulesDone'),
  metaList: $('#metaList'),
  sideNav: $('#sideNav'),
  sidebarTags: $('#sidebarTags'),
  list: $('#list'),
  listTitle: $('#listTitle'),
  listCount: $('#listCount'),
  clearActress: $('#clearActress'),
  sortToggle: $('#sortToggle'),
  selectToggle: $('#selectToggle'),
  selectionBar: $('#selectionBar'),
  selectionCount: $('#selectionCount'),
  selectionAll: $('#selectionAll'),
  selectionDelete: $('#selectionDelete'),
  selectionCancel: $('#selectionCancel'),
  tagsDialog: $('#tagsDialog'),
  tagsForm: $('#tagsForm'),
  tagManageList: $('#tagManageList'),
  tagsDone: $('#tagsDone'),
  importDialog: $('#importDialog'),
  importForm: $('#importForm'),
  importSummary: $('#importSummary'),
  importMerge: $('#importMerge'),
  importReplace: $('#importReplace'),
  importCancel: $('#importCancel'),
  pager: $('#pager'),
  pagerInfo: $('#pagerInfo'),
  pagerPrev: $('#pagerPrev'),
  pagerNext: $('#pagerNext'),
  pagerJump: $('#pagerJump'),
  pagerGo: $('#pagerGo'),
  main: $('.main'),
  tabLibrary: $('#tabLibrary'),
  tabLibraryCount: $('#tabLibraryCount'),
  tabActresses: $('#tabActresses'),
  tabActressesCount: $('#tabActressesCount'),
  tabFavorites: $('#tabFavorites'),
  tabFavoritesCount: $('#tabFavoritesCount'),
  empty: $('#empty'),
  editor: $('#editor'),
  editorForm: $('#editorForm'),
  dialogTitle: $('#dialogTitle'),
  dialogHint: $('#dialogHint'),
  fUrl: $('#fUrl'),
  fTitle: $('#fTitle'),
  fTag: $('#fTag'),
  tagEditor: $('#tagEditor'),
  tagChips: $('#tagChips'),
  tagSuggest: $('#tagSuggest'),
  urlError: $('#urlError'),
  cancelBtn: $('#cancelBtn'),
  exportBtn: $('#exportBtn'),
  importBtn: $('#importBtn'),
  importFile: $('#importFile'),
  toasts: $('#toasts'),
};

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function iconButton(label, iconSvg, onClick, extra = '') {
  const btn = el('button', 'icon-btn' + (extra ? ' ' + extra : ''));
  btn.type = 'button';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = iconSvg;
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return btn;
}

export function toast(message, { label, onAction, tone, duration } = {}) {
  while (els.toasts.children.length >= 4) els.toasts.firstElementChild.remove();

  const node = el('div', 'toast' + (tone === 'error' ? ' toast--error' : ''));
  node.append(el('span', 'toast-msg', message));

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 200);
  };

  if (label && onAction) {
    const action = el('button', 'toast-action', label);
    action.type = 'button';
    action.addEventListener('click', async () => {
      dismiss();
      await onAction();
    });
    node.append(action);
  }

  els.toasts.append(node);
  timer = setTimeout(dismiss, duration || 4200);
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function initialOf(url) {
  const host = hostOf(url);
  return (host[0] || '?').toUpperCase();
}

export function hueOf(text) {
  let hue = 0;
  for (const char of String(text)) hue = (hue * 31 + char.codePointAt(0)) % 360;
  return hue;
}

export function truncate(text, length) {
  const value = String(text);
  return value.length > length ? value.slice(0, length - 1) + '…' : value;
}

export function fuzzyMatch(text, query) {
  const source = String(text || '').toLowerCase();
  const needle = String(query || '').replace(/\s+/g, '').toLowerCase();
  if (!needle) return true;
  if (source.includes(needle)) return true;

  let index = 0;
  for (const char of source) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

export function matchesQuery(item, rawQuery) {
  const query = String(rawQuery || '').trim().toLowerCase();
  if (!query) return true;
  const extras = item.extras.map((extra) => `${extra.label} ${extra.value}`).join(' ');
  return `${item.title}\n${item.url}\n${item.tags.join(' ')}\n${extras}`.toLowerCase().includes(query);
}

export function normalizeUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // Chrome percent-encodes spaces in the host ("not a url" -> not%20a%20url)
    if (!url.hostname || /[\s%]/.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function dedupeTags(tags) {
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const value = String(tag).trim().replace(/\s+/g, ' ');
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function originPattern(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return '';
  }
}

export function scrollMainTop() {
  if (els.main) els.main.scrollTo({ top: 0, behavior: 'smooth' });
}
