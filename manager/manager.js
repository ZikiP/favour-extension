import { $ } from './dom.js';
import { refresh } from './store.js';
import { render } from './views.js';
import { bindEvents } from './events.js';
import { maybeShowBlocked } from './actions.js';

init();

async function init() {
  bindEvents();
  await refresh();
  render();
  await maybeShowBlocked();
  const kbd = $('.search kbd');
  if (kbd) kbd.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
}
