import { els, el } from './dom.js';
import { state } from './store.js';

const PRIMARY_FIELDS = [
  ['code', '番号'],
  ['actress', '女优'],
  ['releaseDate', '发行日期'],
  ['series', '系列'],
  ['runtime', '时长'],
];

const ADVANCED_FIELDS = [
  ['publisher', '发行商'],
  ['director', '导演'],
  ['label', '厂牌'],
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

  state.draftGenres = splitGenres(extraValue(extras, 'genres'));
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
  wrap.append(el('span', null, label), input);
  return wrap;
}

function renderMetaEditor(extras, cover) {
  const list = Array.isArray(extras) ? extras : [];
  const byKey = new Map(list.map((extra) => [extra.key, extra]));

  els.metaList.replaceChildren();

  for (const [key, label] of PRIMARY_FIELDS) {
    const extra = byKey.get(key);
    els.metaList.append(metaInput(key, (extra && extra.label) || label, extra ? extra.value : ''));
  }

  els.metaList.append(renderGenreEditor());
  els.metaList.append(coverField(cover));

  const advanced = [];
  for (const [key, label] of ADVANCED_FIELDS) {
    const extra = byKey.get(key);
    advanced.push(metaInput(key, (extra && extra.label) || label, extra ? extra.value : ''));
  }
  for (const extra of list) {
    if (extra.key === 'genres' || extra.key === 'cover') continue;
    if (PRIMARY_FIELDS.some(([key]) => key === extra.key)) continue;
    if (ADVANCED_FIELDS.some(([key]) => key === extra.key)) continue;
    advanced.push(metaInput(extra.key, extra.label || extra.key, extra.value || ''));
  }

  if (advanced.length) {
    const details = el('details', 'meta-more');
    details.append(el('summary', null, '更多字段'));
    const inner = el('div', 'meta-grid-inner');
    for (const field of advanced) inner.append(field);
    details.append(inner);
    details.open = [...inner.querySelectorAll('input')].some((input) => input.value.trim());
    els.metaList.append(details);
  }
}

function renderGenreEditor() {
  const wrap = el('div', 'meta-field meta-field--wide');
  wrap.append(el('span', null, '类型'));
  const box = el('div', 'genre-editor');
  const input = el('input', 'genre-add');
  input.type = 'text';
  input.placeholder = '输入类型后按 Enter';
  input.autocomplete = 'off';

  const paint = () => {
    box.replaceChildren();
    for (const genre of state.draftGenres) {
      const chip = el('span', 'genre-chip genre-chip--edit');
      chip.append(el('span', null, genre));
      const remove = el('button', 'genre-x', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `移除类型 ${genre}`);
      remove.addEventListener('click', () => {
        state.draftGenres = state.draftGenres.filter((value) => value !== genre);
        paint();
        input.focus();
      });
      chip.append(remove);
      box.append(chip);
    }
    box.append(input);
  };

  const add = (raw) => {
    const value = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!value) return;
    if (state.draftGenres.some((genre) => genre.toLowerCase() === value.toLowerCase())) return;
    state.draftGenres.push(value);
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault();
      add(input.value);
      input.value = '';
      paint();
      input.focus();
    }
  });
  input.addEventListener('blur', () => {
    if (!input.value.trim()) return;
    add(input.value);
    input.value = '';
    paint();
  });

  paint();
  wrap.append(box);
  return wrap;
}

function coverField(cover) {
  const wrap = el('div', 'meta-field meta-field--wide');
  wrap.append(el('span', null, '封面图 URL'));
  const row = el('div', 'cover-row');

  const input = el('input');
  input.type = 'text';
  input.dataset.key = 'cover';
  input.dataset.label = '封面图 URL';
  input.value = cover || '';
  input.placeholder = 'https://…';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const preview = el('img', 'cover-preview');
  preview.alt = '';
  preview.referrerPolicy = 'no-referrer';
  preview.hidden = !cover;
  if (cover) preview.src = cover;

  input.addEventListener('input', () => {
    const value = input.value.trim();
    if (/^(https?:|data:image\/)/i.test(value)) {
      preview.src = value;
      preview.hidden = false;
    } else {
      preview.hidden = true;
    }
  });
  preview.addEventListener('error', () => {
    preview.hidden = true;
  });

  row.append(input, preview);
  wrap.append(row);
  return wrap;
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

  if (state.draftGenres.length) {
    extras.push({ key: 'genres', label: '类型', value: state.draftGenres.join(', ') });
  }

  return { extras, cover };
}

function extraValue(extras, key) {
  const extra = (Array.isArray(extras) ? extras : []).find((entry) => entry.key === key);
  return extra && typeof extra.value === 'string' ? extra.value : '';
}

function splitGenres(raw) {
  const seen = new Set();
  const result = [];
  for (const value of String(raw || '')
    .split(/[,，、]/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
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
