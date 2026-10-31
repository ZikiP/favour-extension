import { els } from './dom.js';
import { state } from './store.js';

export const PAGE_SIZE = 12;
export const ACTRESS_PAGE_SIZE = 18;

export function paginate(items, size = PAGE_SIZE) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  state.page = Math.min(Math.max(1, state.page), pages);
  const start = (state.page - 1) * size;
  return { items: items.slice(start, start + size), total, pages, page: state.page };
}

export function renderPager({ total, pages, page }, unit = '条') {
  state.pages = pages;
  if (!total || pages <= 1) {
    els.pager.hidden = true;
    return;
  }
  els.pager.hidden = false;
  els.pagerInfo.textContent = `第 ${page} / ${pages} 页 · 共 ${total} ${unit}`;
  els.pagerPrev.disabled = page <= 1;
  els.pagerNext.disabled = page >= pages;
  els.pagerJump.max = String(pages);
  els.pagerJump.value = String(page);
}
