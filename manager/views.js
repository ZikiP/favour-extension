import { els, el, ICON, hueOf, scrollMainTop } from './dom.js';
import { state } from './store.js';
import { actressStats, tagStats } from './selectors.js';
import { renderActressView, renderFavorites, renderLibrary } from './cards.js';
import { renderListTools } from './list-tools.js';

export function render() {
  renderSidebar();
  renderTabs();
  renderMain();
}

export function renderRangeNotice() {
  els.rangeNotice.hidden = state.view !== 'library' || state.rules.length > 0;
}

function renderTabs() {
  const stats = actressStats();
  const favoriteCount = state.items.filter((item) => item.favorite).length;

  els.tabLibraryCount.textContent = String(state.items.length);
  els.tabActressesCount.textContent = String(stats.length);
  els.tabFavoritesCount.textContent = String(favoriteCount);

  for (const [view, tab] of [
    ['library', els.tabLibrary],
    ['actresses', els.tabActresses],
    ['favorites', els.tabFavorites],
  ]) {
    const active = state.view === view;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  }
}

export function renderMain() {
  els.search.placeholder = state.view === 'actresses' ? '搜索演员…' : '搜索标题、网址或标签…';
  renderRangeNotice();

  if (state.view === 'actresses') renderActressView();
  else if (state.view === 'favorites') renderFavorites();
  else renderLibrary();

  renderListTools();
}

function renderSidebar() {
  const library = state.view === 'library';
  const untagged = state.items.filter((item) => item.tags.length === 0).length;
  const unwatched = state.items.filter((item) => !item.watched).length;

  els.sideNav.replaceChildren(
    navRow({ label: '全部收藏', icon: ICON.grid, count: state.items.length, active: library && !state.watched && state.tag === null, onClick: () => setFilter(null) }),
    navRow({ label: '未分类', icon: ICON.tag, count: untagged, active: library && !state.watched && state.tag === '', onClick: () => setFilter('') }),
    navRow({ label: '未看', icon: ICON.eye, count: unwatched, active: library && state.watched, onClick: setWatched }),
  );

  const stats = tagStats();
  els.sidebarTags.replaceChildren();
  if (!stats.length) {
    els.sidebarTags.append(el('p', 'side-empty', '还没有标签'));
    return;
  }

  const head = el('div', 'side-heading-row');
  head.append(el('h2', 'side-heading', '标签'));
  els.sidebarTags.append(head);

  for (const stat of stats) {
    const key = stat.label.toLowerCase();
    const active = library && !state.watched && state.tag === key;
    const btn = el('button', 'side-item' + (active ? ' is-active' : ''));
    btn.type = 'button';
    btn.title = stat.label;
    if (active) btn.setAttribute('aria-current', 'true');

    const dot = el('span', 'side-dot');
    dot.style.setProperty('--h', hueOf(key));
    btn.append(dot, el('span', 'side-label', stat.label), el('span', 'side-count', String(stat.count)));
    btn.addEventListener('click', () => setFilter(active ? null : key));
    els.sidebarTags.append(btn);
  }
}

function navRow({ label, icon, count, active, onClick }) {
  const btn = el('button', 'side-item' + (active ? ' is-active' : ''));
  btn.type = 'button';
  if (active) btn.setAttribute('aria-current', 'true');
  const iconBox = el('span', 'side-icon');
  iconBox.innerHTML = icon;
  btn.append(iconBox, el('span', 'side-label', label), el('span', 'side-count', String(count)));
  btn.addEventListener('click', onClick);
  return btn;
}

export function setView(view) {
  if (state.view === view) return;
  state.view = view;
  state.query = '';
  state.page = 1;
  state.selecting = false;
  state.selected.clear();
  els.search.value = '';
  render();
}

export function setFilter(tag) {
  state.view = 'library';
  state.tag = tag;
  state.actress = null;
  state.watched = false;
  state.selecting = false;
  state.selected.clear();
  state.page = 1;
  render();
}

export function setWatched() {
  state.view = 'library';
  state.tag = null;
  state.actress = null;
  state.watched = true;
  state.selecting = false;
  state.selected.clear();
  state.page = 1;
  render();
}

export function openActress(key) {
  state.view = 'library';
  state.actress = key;
  state.tag = null;
  state.watched = false;
  state.query = '';
  state.page = 1;
  state.selecting = false;
  state.selected.clear();
  els.search.value = '';
  render();
}

export function jumpToPage() {
  const pages = state.pages || 1;
  if (pages <= 1) return;

  let value = Number.parseInt(els.pagerJump.value, 10);
  if (!Number.isFinite(value)) value = state.page;
  value = Math.min(Math.max(1, value), pages);

  if (value === state.page) {
    els.pagerJump.value = String(state.page);
    return;
  }

  state.page = value;
  state.selected.clear();
  els.pagerJump.value = String(value);
  renderMain();
  scrollMainTop();
  els.pagerJump.blur();
}
