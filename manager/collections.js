import { els, el, ICON, fuzzyMatch, hueOf } from './dom.js';
import { state } from './store.js';
import { seriesStats } from './selectors.js';
import { COLLECTION_PAGE_SIZE, paginate, renderPager } from './pager.js';
import { renderMain, setSeries, setView } from './views.js';

export function renderCollectionView() {
  const stats = seriesStats();
  const filtered = stats.filter((stat) => fuzzyMatch(stat.label, state.query));
  const pageData = paginate(filtered, COLLECTION_PAGE_SIZE);

  els.list.className = 'list list--collections';
  els.list.replaceChildren();
  els.listTitle.textContent = '合集';
  els.listCount.textContent = `${filtered.length} 个`;
  els.clearActress.hidden = true;

  els.empty.hidden = filtered.length > 0;
  if (!filtered.length) {
    renderPager({ total: 0, pages: 1, page: 1 }, '个');
    renderCollectionEmpty(stats);
    return;
  }

  for (const stat of pageData.items) els.list.append(renderCollectionCard(stat));
  renderPager(pageData, '个');
}

function renderCollectionCard(stat) {
  const card = el('article', 'collection-card');
  card.dataset.key = stat.key;

  const hit = el('button', 'collection-hit');
  hit.type = 'button';
  hit.setAttribute('aria-label', `查看合集 ${stat.label}`);
  hit.addEventListener('click', () => setSeries(stat.key));
  card.append(hit);

  const cover = el('div', 'collection-cover');
  const fallback = el('div', 'collection-cover-fallback', stat.label);
  fallback.style.setProperty('--h', hueOf(stat.key));
  cover.append(fallback);

  if (stat.cover) {
    const img = el('img');
    img.src = stat.cover;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove());
    cover.append(img);
  }

  const body = el('div', 'collection-body');
  body.append(
    el('div', 'collection-name', stat.label),
    el('div', 'collection-count', `${stat.count} 部作品`),
  );

  card.append(cover, body);
  return card;
}

function renderCollectionEmpty(stats) {
  els.empty.replaceChildren();
  const iconBox = el('div', 'empty-icon');
  iconBox.innerHTML = ICON.grid;
  els.empty.append(iconBox);

  if (state.query.trim()) {
    els.empty.append(
      el('h2', null, '没有匹配的合集'),
      el('p', null, '换个关键词试试。'),
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
      el('h2', null, '还没有合集'),
      el('p', null, '收藏带「系列」信息的作品后，会自动汇总到这里。'),
    );
    const go = el('button', 'btn btn-primary', '去收藏');
    go.type = 'button';
    go.addEventListener('click', () => setView('library'));
    els.empty.append(go);
  }
}
