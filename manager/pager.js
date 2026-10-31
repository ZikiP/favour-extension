import { els } from './dom.js';
import { state } from './store.js';

export const PAGE_SIZE = 12;

export function paginate(items) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pages);
  const start = (state.page - 1) * PAGE_SIZE;
  return { items: items.slice(start, start + PAGE_SIZE), total, pages, page: state.page };
}

export function renderPager({ total, pages, page }) {
  state.pages = pages;
  if (!total || pages <= 1) {
    els.pager.hidden = true;
    return;
  }
  els.pager.hidden = false;
  els.pagerInfo.textContent = `第 ${page} / ${pages} 页 · 共 ${total} 条`;
  els.pagerPrev.disabled = page <= 1;
  els.pagerNext.disabled = page >= pages;
  els.pagerJump.max = String(pages);
  els.pagerJump.value = String(page);
}
