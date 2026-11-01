import { els, el } from './dom.js';
import { state } from './store.js';

const META_FIELDS = [
  ['code', '番号'],
  ['actress', '女优'],
  ['releaseDate', '发行日期'],
  ['publisher', '发行商'],
  ['director', '导演'],
  ['series', '系列'],
  ['genres', '类型'],
  ['label', '厂牌'],
  ['runtime', '时长'],
];

export function openEditor({ item = null, prefill = null, parsed = null } = {}) {
  if (els.editor.open) els.editor.close();

  state.editing = item || null;
  let url = '';
  let title = '';
  let extras = [];
  let cover = '';
  let source = null;

  if (item) {
    url = item.url;
    title = item.title || '';
    extras = [...item.extras];
    cover = item.cover;
    source = item.source;
  } else if (prefill) {
    url = prefill.url || '';
    title = prefill.title || '';
    const existing = state.items.find((entry) => entry.url === url);
    if (existing) {
      state.editing = existing;
      title = existing.title || title;
      extras = [...existing.extras];
      cover = existing.cover;
      source = existing.source;
    }
  }

  if (parsed) {
    if (!extras.length && Array.isArray(parsed.extras)) extras = parsed.extras;
    if (!cover && parsed.cover) cover = parsed.cover;
    if (!source && parsed.source) source = parsed.source;
    if (!state.editing && parsed.title) title = parsed.title;
  }

  state.draftExtras = Array.isArray(extras) ? extras : [];
  state.draftCover = cover || '';
  state.draftSource = source || null;
  els.dialogTitle.textContent = state.editing ? '编辑收藏' : '添加收藏';
  els.dialogHint.textContent = state.editing ? '该网址已在收藏中，保存会更新原有记录。' : '';
  els.dialogHint.hidden = !state.editing;
  els.fUrl.value = url;
  els.fTitle.value = title;
  clearUrlError();
  renderMetaEditor(state.draftExtras, state.draftCover);
  els.editor.showModal();

  requestAnimationFrame(() => {
    if (els.fUrl.value.trim()) {
      els.fTitle.focus();
      els.fTitle.select();
    } else {
      els.fUrl.focus();
    }
  });
}

function metaInput(key, label, value, wide = false) {
  const wrap = el('label', 'meta-field' + (wide ? ' meta-field--wide' : ''));
  const input = el('input');
  input.type = 'text';
  input.dataset.key = key;
  input.dataset.label = label;
  input.value = value || '';
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (key === 'cover') input.placeholder = 'https://…';
  wrap.append(el('span', null, label), input);
  return wrap;
}

function renderMetaEditor(extras, cover) {
  const list = Array.isArray(extras) ? extras : [];
  const byKey = new Map(list.map((extra) => [extra.key, extra]));

  els.metaList.replaceChildren();

  for (const [key, label] of META_FIELDS) {
    const extra = byKey.get(key);
    els.metaList.append(metaInput(key, (extra && extra.label) || label, extra ? extra.value : ''));
  }

  for (const extra of list) {
    if (META_FIELDS.some(([key]) => key === extra.key)) continue;
    els.metaList.append(metaInput(extra.key, extra.label || extra.key, extra.value || ''));
  }

  els.metaList.append(metaInput('cover', '封面图 URL', cover || '', true));
}

export function collectMeta() {
  const extras = [];
  let cover = '';

  for (const input of els.metaList.querySelectorAll('input[data-key]')) {
    const key = input.dataset.key;
    const value = input.value.trim();
    if (key === 'cover') {
      cover = value;
      continue;
    }
    if (!value) continue;
    extras.push({ key, label: input.dataset.label || key, value });
  }

  return { extras, cover };
}

export function showUrlError(message) {
  els.urlError.textContent = message;
  els.urlError.hidden = false;
  els.fUrl.classList.add('is-invalid');
  els.fUrl.setAttribute('aria-invalid', 'true');
}

export function clearUrlError() {
  els.urlError.hidden = true;
  els.fUrl.classList.remove('is-invalid');
  els.fUrl.removeAttribute('aria-invalid');
}
