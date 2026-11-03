import { els, toast } from './dom.js';
import { expandIds, groupsOf } from './groups.js';
import { savePrefs, state } from './store.js';
import { removeMany, setFavoriteMany, setWatchedMany } from './items.js';
import { render, renderMain } from './views.js';

// 选中的是一张卡片（一个作品），批量操作要展开成它的全部版本
function selectedItems() {
  const wanted = new Set(expandIds([...state.selected]));
  return state.items.filter((item) => wanted.has(item.id));
}

function selectedGroups() {
  return groupsOf(state.items).filter((group) => state.selected.has(group.primary.id));
}

export function renderListTools() {
  const canSelect = state.view === 'library' || state.view === 'favorites';
  els.sortSelect.hidden = !canSelect;
  els.sortSelect.value = state.sort;
  els.filterBtn.hidden = !canSelect;
  els.selectToggle.hidden = !canSelect || state.selecting;
  els.list.classList.toggle('is-selecting', state.selecting && canSelect);

  const active = state.selecting && canSelect;
  document.body.classList.toggle('has-selection', active);
  els.selectionBar.hidden = !active;
  if (!active) return;

  const items = selectedItems();
  const groups = selectedGroups();
  els.selectionCount.textContent = groups.length
    ? `已选 ${groups.length} 部${items.length > groups.length ? ` · ${items.length} 个版本` : ''}`
    : '未选择';
  els.selectionDelete.disabled = !items.length;
  els.selectionFavorite.disabled = !items.length;
  els.selectionWatched.disabled = !items.length;
  els.selectionScrape.disabled = !items.length;
  els.selectionFavorite.textContent =
    items.length && items.every((item) => item.favorite) ? '取消喜爱' : '喜爱';
  els.selectionWatched.textContent =
    items.length && items.every((item) => item.watched) ? '标记未看' : '标记已看';
}

export function setSort(value) {
  if (!['created', 'opened', 'runtime'].includes(value)) return;
  state.sort = value;
  state.page = 1;
  savePrefs();
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

export async function favoriteSelected() {
  const items = selectedItems();
  if (!items.length) return;
  const favorite = !items.every((item) => item.favorite);
  await setFavoriteMany(items.map((item) => item.id), favorite);
  toast(favorite ? '已加入喜爱' : '已取消喜爱');
  renderListTools();
}

export async function watchedSelected() {
  const items = selectedItems();
  if (!items.length) return;
  const watched = !items.every((item) => item.watched);
  await setWatchedMany(items.map((item) => item.id), watched);
  toast(watched ? '已标记为已看' : '已标记为未看');
  renderListTools();
}

export async function deleteSelected() {
  const ids = expandIds([...state.selected]);
  if (!ids.length) return;
  state.selecting = false;
  state.selected.clear();
  await removeMany(ids);
}
