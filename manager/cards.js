import { els, el, ICON, iconButton, fuzzyMatch, hostOf, hueOf, initialOf, matchesQuery } from './dom.js';
import { state } from './store.js';
import { groupsOf, sortGroups, versionCount } from './groups.js';
import { actressStats, actressLabel, genreLabel, seriesLabel, visibleItems } from './selectors.js';
import { extraValue, genresOf } from './meta.js';
import { ACTRESS_PAGE_SIZE, paginate, renderPager } from './pager.js';
import { openEditor } from './editor.js';
import { openDetail } from './detail.js';
import { onAddCurrent } from './actions.js';
import { openSettings } from './dialogs.js';
import { openGroup, removeGroup, toggleFavoriteGroup, toggleWatchedGroup } from './items.js';
import { setActressOrder, toggleActressFavorite } from './actresses.js';
import { toggleSelected } from './list-tools.js';
import { render, renderMain, openActress, setView } from './views.js';
import { versionOf } from '../shared/versions.js';

export function renderLibrary() {
  const items = visibleItems();
  const groups = sortGroups(groupsOf(items));
  const pageData = paginate(groups);
  els.list.className = 'list';
  els.list.replaceChildren();

  const label = state.watched
    ? '未看'
    : state.actress
      ? `演员 · ${actressLabel(state.actress)}`
      : state.genre
        ? `类型 · ${genreLabel(state.genre)}`
        : state.series
          ? `系列 · ${seriesLabel(state.series)}`
          : '全部收藏';
  els.listTitle.textContent = state.query.trim() ? '搜索结果' : label;
  els.listCount.textContent = countLabel(groups);
  els.clearActress.hidden = !state.actress;

  els.empty.hidden = groups.length > 0;
  if (!groups.length) {
    renderPager({ total: 0, pages: 1, page: 1 });
    renderEmpty();
    return;
  }
  for (const group of pageData.items) els.list.append(renderCard(group));
  renderPager(pageData, '部');
}

export function renderFavorites() {
  const groups = sortGroups(
    groupsOf(
      state.items
        .filter((item) => item.favorite)
        .filter((item) => matchesQuery(item, state.query)),
    ),
  );

  const pageData = paginate(groups);
  els.list.className = 'list';
  els.list.replaceChildren();
  els.listTitle.textContent = '最爱';
  els.listCount.textContent = countLabel(groups);
  els.clearActress.hidden = true;

  els.empty.hidden = groups.length > 0;
  if (!groups.length) {
    renderPager({ total: 0, pages: 1, page: 1 }, '部');
    renderFavoritesEmpty();
    return;
  }

  for (const group of pageData.items) els.list.append(renderCard(group));
  renderPager(pageData, '部');
}

// 「12 部 · 15 个版本」——版本数和作品数一致时只显示作品数
function countLabel(groups) {
  const total = versionCount(groups);
  return total > groups.length ? `${groups.length} 部 · ${total} 个版本` : `${groups.length} 部`;
}

export function renderActressView() {

  const stats = actressStats();
  const filtered = stats.filter((stat) => fuzzyMatch(stat.name, state.query));
  const pageData = paginate(filtered, ACTRESS_PAGE_SIZE);

  els.list.className = 'list list--actresses';
  els.list.replaceChildren();
  els.listTitle.textContent = '演员';
  els.listCount.textContent = `${filtered.length} 位`;
  els.clearActress.hidden = true;

  els.empty.hidden = filtered.length > 0;
  if (!filtered.length) {
    renderPager({ total: 0, pages: 1, page: 1 }, '位');
    renderActressEmpty(stats);
    return;
  }

  for (const stat of pageData.items) els.list.append(renderActressCard(stat));
  renderPager(pageData, '位');
}

function renderActressCard(stat) {
  const card = el('article', 'actress-card');
  card.dataset.key = stat.key;

  const hit = el('button', 'actress-hit');
  hit.type = 'button';
  hit.setAttribute('aria-label', `查看 ${stat.name} 的作品`);
  hit.addEventListener('click', () => openActress(stat.key));
  card.append(hit);

  const avatar = el('span', 'actress-avatar');
  avatar.style.setProperty('--h', hueOf(stat.key));
  const initial = stat.name.slice(0, 1).toUpperCase();
  if (stat.avatar) {
    const img = el('img', 'actress-avatar-img');
    img.src = stat.avatar;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.remove();
      avatar.textContent = initial;
    });
    avatar.append(img);
  } else {
    avatar.textContent = initial;
  }

  const favorite = el('button', 'actress-fav' + (stat.favorite ? ' is-fav' : ''));
  favorite.type = 'button';
  favorite.innerHTML = stat.favorite ? ICON.heartOn : ICON.heart;
  favorite.title = stat.favorite ? '取消喜爱' : '设为喜爱';
  favorite.setAttribute('aria-label', stat.favorite ? `取消喜爱 ${stat.name}` : `喜爱 ${stat.name}`);
  favorite.setAttribute('aria-pressed', stat.favorite ? 'true' : 'false');
  favorite.addEventListener('click', () => toggleActressFavorite(stat.key));

  const body = el('div', 'actress-body');
  body.append(
    el('span', 'actress-name', stat.name),
    el('span', 'actress-count', `${stat.count} 部作品`),
  );

  const order = el('label', 'actress-order');
  order.append(el('span', null, '排序'));
  const input = el('input');
  input.type = 'number';
  input.min = '0';
  input.step = '1';
  input.inputMode = 'numeric';
  input.placeholder = '0';
  input.value = stat.order ? String(stat.order) : '';
  input.title = '排序值，数值越大越靠前';
  input.setAttribute('aria-label', `${stat.name} 的排序值`);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });
  input.addEventListener('change', () => setActressOrder(stat.key, input.value));
  order.append(input);

  card.append(avatar, favorite, body, order);
  return card;
}

function renderCard(group) {
  const item = group.primary;
  const extras = Array.isArray(item.extras) ? item.extras : [];
  const actress = extras.find((extra) => extra.key === 'actress');
  const releaseDate = extras.find((extra) => extra.key === 'releaseDate');
  const multi = group.versions.length > 1;

  const card = el('article', 'card');
  card.dataset.id = item.id;
  card.dataset.work = group.key;
  if (state.selecting && state.selected.has(item.id)) card.classList.add('is-selected');

  const link = el('button', 'card-hit');
  link.type = 'button';
  link.setAttribute('aria-label', `查看 ${group.title || item.url} 的详情`);
  link.addEventListener('click', () => {
    if (state.selecting) {
      toggleSelected(item.id);
      return;
    }
    openDetail(group);
  });
  card.append(link);

  const coverBox = el('div', 'card-cover');
  const fallback = el('div', 'cover-fallback');
  fallback.style.setProperty('--h', hueOf(group.code || hostOf(item.url)));
  fallback.textContent = group.code || initialOf(item.url);
  coverBox.append(fallback);

  if (group.cover) {
    const img = el('img', 'cover-img');
    img.src = group.cover;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', () => img.classList.add('is-loaded'));
    img.addEventListener('error', () => img.remove());
    coverBox.append(img);
  }

  const play = el('button', 'card-play');
  play.type = 'button';
  const preferredLabel = versionOf(item).label;
  play.title = multi ? `播放（${preferredLabel}）` : '播放';
  play.setAttribute('aria-label', multi
    ? `播放 ${group.title || item.url}（${preferredLabel}）`
    : `播放 ${group.title || item.url}`);
  play.innerHTML = ICON.play;
  play.addEventListener('click', () => openGroup(group));
  coverBox.append(play);

  const favorite = el('button', 'card-fav' + (group.favorite ? ' is-fav' : ''));
  favorite.type = 'button';
  favorite.innerHTML = group.favorite ? ICON.heartOn : ICON.heart;
  favorite.title = group.favorite ? '取消最爱' : '加入最爱';
  favorite.setAttribute('aria-label', group.favorite ? '取消最爱' : '加入最爱');
  favorite.setAttribute('aria-pressed', group.favorite ? 'true' : 'false');
  favorite.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavoriteGroup(group);
  });
  coverBox.append(favorite);

  if (releaseDate && releaseDate.value) {
    coverBox.append(el('div', 'card-date', releaseDate.value));
  }

  if (group.watched) {
    coverBox.append(el('div', 'card-watched', '已看'));
  }

  const selectMark = el('span', 'card-select');
  selectMark.innerHTML = ICON.check;
  coverBox.append(selectMark);

  const body = el('div', 'card-body');

  // 卡片上只留番号：版本号、版本标签都放到详情页的版本选择里
  if (group.code || group.runtime) {
    const codeRow = el('div', 'card-code-row');
    if (group.code) codeRow.append(el('span', 'card-code', group.code));
    if (group.runtime) codeRow.append(el('span', 'card-runtime', extraValue(item, 'runtime')));
    body.append(codeRow);
  }

  if (actress && actress.value) {
    body.append(el('div', 'card-actress', actress.value));
  }

  const genres = genresOf(item);
  if (genres.length) {
    const genreRow = el('div', 'card-genres');
    for (const genre of genres.slice(0, 3)) genreRow.append(el('span', 'genre-chip', genre));
    if (genres.length > 3) genreRow.append(el('span', 'genre-more', `+${genres.length - 3}`));
    body.append(genreRow);
  }

  const title = el('div', 'card-title', group.title || hostOf(item.url));
  title.title = group.title || item.url;
  body.append(title);

  const actions = el('div', 'card-actions');
  actions.append(
    iconButton(group.watched ? '标记为未看' : '标记为已看', ICON.eye, () => toggleWatchedGroup(group), group.watched ? 'is-on' : ''),
    iconButton('编辑', ICON.pencil, () => openEditor({ item })),
    iconButton(multi ? '删除（含全部版本）' : '删除', ICON.trash, () => removeGroup(group), 'is-danger'),
  );

  card.append(coverBox, body, actions);
  return card;
}

function renderEmpty() {
  els.empty.replaceChildren();
  const iconBox = el('div', 'empty-icon');
  iconBox.innerHTML = ICON.bookmark;
  els.empty.append(iconBox);

  if (!state.items.length) {
    const ready = state.rules.length > 0;
    els.empty.append(
      el('h2', null, '还没有收藏'),
      el('p', null, ready
        ? '点击右上角「收藏当前页」，开始收集你喜欢的网址。'
        : '先添加允许收藏的网站，再开始收集你喜欢的网址。'),
    );
    const cta = el('button', 'btn btn-primary', ready ? '收藏当前页' : '配置收藏范围');
    cta.type = 'button';
    cta.addEventListener('click', ready ? onAddCurrent : openSettings);
    els.empty.append(cta);
    return;
  }

  els.empty.append(
    el('h2', null, '没有匹配的收藏'),
    el('p', null, '换个关键词，或清除筛选条件再试试。'),
  );
  const reset = el('button', 'btn btn-ghost', '清除搜索与筛选');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    els.search.value = '';
    state.query = '';
    state.actress = null;
    state.watched = false;
    state.genre = null;
    state.series = null;
    render();
    els.search.focus();
  });
  els.empty.append(reset);
}

function renderFavoritesEmpty() {
  els.empty.replaceChildren();
  const iconBox = el('div', 'empty-icon');
  iconBox.innerHTML = ICON.heart;
  els.empty.append(iconBox);

  if (state.query.trim()) {
    els.empty.append(
      el('h2', null, '没有匹配的收藏'),
      el('p', null, '换个关键词，或清除搜索再试试。'),
    );
    const reset = el('button', 'btn btn-ghost', '清除搜索');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      state.query = '';
      els.search.value = '';
      renderMain();
      els.search.focus();
    });
    els.empty.append(reset);
    return;
  }

  const hasAny = state.items.some((item) => item.favorite);
  els.empty.append(
    el('h2', null, hasAny ? '没有匹配的收藏' : '还没有最爱的作品'),
    el('p', null, hasAny
      ? '换个关键词，或清除搜索再试试。'
      : '在收藏卡片左上角点爱心，把喜欢的作品加入最爱。'),
  );
  const go = el('button', 'btn btn-primary', '去收藏');
  go.type = 'button';
  go.addEventListener('click', () => setView('library'));
  els.empty.append(go);
}

function renderActressEmpty(stats) {
  els.empty.replaceChildren();
  const iconBox = el('div', 'empty-icon');
  iconBox.innerHTML = ICON.tag;
  els.empty.append(iconBox);

  const query = state.query.trim();

  if (query) {
    els.empty.append(
      el('h2', null, '没有匹配的演员'),
      el('p', null, '换个关键词试试，支持模糊匹配。'),
    );
    const reset = el('button', 'btn btn-ghost', '清除搜索');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      state.query = '';
      els.search.value = '';
      renderMain();
      els.search.focus();
    });
    els.empty.append(reset);
    return;
  }

  if (!stats.length) {
    els.empty.append(
      el('h2', null, '还没有演员信息'),
      el('p', null, '收藏带解析字段的作品后，演员会自动汇总到这里。'),
    );
    const go = el('button', 'btn btn-primary', '回到收藏');
    go.type = 'button';
    go.addEventListener('click', () => setView('library'));
    els.empty.append(go);
  }
}

