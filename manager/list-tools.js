import { els } from './dom.js';
import { state } from './store.js';
import { removeMany } from './items.js';
import { render, renderMain } from './views.js';

export function renderListTools() {
  const canSelect = state.view !== 'actresses';
  els.sortToggle.hidden = !canSelect;
  els.sortToggle.textContent = state.sort === 'opened' ? '最近打开' : state.sort === 'runtime' ? '时长' : '收录时间';
  els.sortToggle.title = '切换排序：收录时间 → 最近打开 → 时长';
  els.selectToggle.hidden = !canSelect || state.selecting;
  els.list.classList.toggle('is-selecting', state.selecting && canSelect);

  const active = state.selecting && canSelect;
  document.body.classList.toggle('has-selection', active);
  els.selectionBar.hidden = !active;
  if (!active) return;
  els.selectionCount.textContent = state.selected.size ? `已选 ${state.selected.size} 项` : '未选择';
  els.selectionDelete.disabled = state.selected.size === 0;
}

export function toggleSort() {
  state.sort = state.sort === 'created' ? 'opened' : state.sort === 'opened' ? 'runtime' : 'created';
  state.page = 1;
  render();
}

export function toggleSelecting() {
  if (state.view === 'actresses') return;
  state.selecting = !state.selecting;
  state.selected.clear();
  render();
}

export function toggleSelected(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  const card = [...els.list.querySelectorAll('.card')].find((node) => node.dataset.id === id);
  if (card) card.classList.toggle('is-selected', state.selected.has(id));
  renderListTools();
}

export function selectAllOnPage() {
  for (const card of els.list.querySelectorAll('.card')) {
    state.selected.add(card.dataset.id);
    card.classList.add('is-selected');
  }
  renderListTools();
}

export function clearSelected() {
  state.selected.clear();
  for (const card of els.list.querySelectorAll('.card.is-selected')) {
    card.classList.remove('is-selected');
  }
  renderListTools();
}

export function exitSelecting() {
  state.selecting = false;
  state.selected.clear();
  renderMain();
  renderListTools();
}

export async function deleteSelected() {
  const ids = [...state.selected];
  if (!ids.length) return;
  state.selecting = false;
  state.selected.clear();
  await removeMany(ids);
}
