import { els } from './dom.js';
import { groupOfItem } from './groups.js';
import { state } from './store.js';
import { openGroup, removeGroup } from './items.js';
import { openDetail } from './detail.js';

let cursor = -1;

export function bindListKeys() {
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('dialog[open]')) return;
    if (state.view === 'actresses' || state.view === 'collections' || state.selecting) return;

    const cards = [...els.list.querySelectorAll('.card')];
    if (!cards.length) return;

    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault();
      move(cards, event.key === 'j' ? 1 : -1);
      return;
    }
    if (!['Enter', 'o', 'O', 'Delete'].includes(event.key)) return;

    const active = els.list.querySelector('.card.is-cursor');
    if (!active) return;
    const item = state.items.find((entry) => entry.id === active.dataset.id);
    if (!item) return;
    const group = groupOfItem(item);
    if (!group) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      openDetail(group);
    } else if (event.key === 'o' || event.key === 'O') {
      event.preventDefault();
      openGroup(group);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      removeGroup(group);
    }
  });
}

function move(cards, step) {
  if (!els.list.querySelector('.card.is-cursor')) cursor = -1;
  cursor = cursor < 0
    ? (step > 0 ? 0 : cards.length - 1)
    : Math.min(Math.max(cursor + step, 0), cards.length - 1);

  for (const card of cards) card.classList.remove('is-cursor');
  cards[cursor].classList.add('is-cursor');
  cards[cursor].scrollIntoView({ block: 'nearest' });
}
