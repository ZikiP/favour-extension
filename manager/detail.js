import { els, el, hostOf, hueOf, initialOf, toast } from './dom.js';
import { actressNames, relatedItems } from './selectors.js';
import { extraValue, genresOf, previewUrl } from './meta.js';
import { copyUrl, openItem, openRelocate, searchUrlFor } from './items.js';
import { openEditor } from './editor.js';
import { rescanItem } from './scrape.js';

let current = null;
let ring = [];
let ringIndex = 0;
let noteTimer = 0;

export function openDetail(item) {
  ring = [item, ...relatedItems(item)];
  ringIndex = 0;
  showDetail(item);
}

function showDetail(item) {
  current = item;
  renderDetail(item);
  if (!els.detailDialog.open) els.detailDialog.showModal();
  loadPreview(item);
}

export function closeDetail() {
  current = null;
  ring = [];
  ringIndex = 0;
  stopPreview();
  if (els.detailDialog.open) els.detailDialog.close();
}

export function detailOpenItem() {
  const item = current;
  closeDetail();
  if (item) openItem(item);
}

export function detailEditItem() {
  const item = current;
  closeDetail();
  if (item) openEditor({ item });
}

export function detailRelocateItem() {
  if (current) openRelocate(current);
}

export function detailCopyItem() {
  const item = current;
  if (!item) return;
  copyUrl(item).then((ok) => {
    showDetailNote(ok ? '链接已复制' : '复制失败，请手动复制');
  });
}

export function handleDetailKey(event) {
  if (!els.detailDialog.open) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const target = event.target;
  if (target instanceof Element && target.closest('video, input, textarea, select')) return;
  if (ring.length <= 1) return;

  event.preventDefault();
  const step = event.key === 'ArrowRight' ? 1 : -1;
  ringIndex = (ringIndex + step + ring.length) % ring.length;
  showDetail(ring[ringIndex]);
}

export async function detailRescanItem() {
  const item = current;
  if (!item || els.detailRescan.disabled) return;

  els.detailRescan.disabled = true;
  els.detailRescan.textContent = '刮削中…';
  clearDetailError();
  try {
    const updated = await rescanItem(item);
    if (current === item) {
      openDetail(updated);
      showDetailNote('已重新刮削');
    }
  } catch (error) {
    const message = '刮削失败：' + (error && error.message ? error.message : '未知错误');
    if (els.detailDialog.open) showDetailError(message);
    else toast(message, { tone: 'error' });
  } finally {
    els.detailRescan.disabled = false;
    els.detailRescan.textContent = '重新刮削';
  }
}

function renderDetail(item) {
  clearDetailError();
  clearDetailNote();
  const code = extraValue(item, 'code');
  els.detailTitle.textContent = item.title || hostOf(item.url);

  els.detailCode.replaceChildren();
  if (code) els.detailCode.append(el('span', 'card-code', code));

  renderCover(item, code);
  renderRows(item);
  renderDescription(item);
  renderGenres(item);
  renderRelated(item);
  els.detailRelocate.hidden = !searchUrlFor(item);
}

function renderCover(item, code) {
  els.detailCover.replaceChildren();
  if (item.cover) {
    const img = el('img');
    img.src = item.cover;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.remove();
      appendFallback(item, code);
    });
    els.detailCover.append(img);
    return;
  }
  appendFallback(item, code);
}

function appendFallback(item, code) {
  const fallback = el('div', 'detail-cover-fallback', code || initialOf(item.url));
  fallback.style.setProperty('--h', hueOf(code || hostOf(item.url)));
  els.detailCover.append(fallback);
}

function renderRows(item) {
  const rows = [
    ['女优', actressNames(item).join('、')],
    ['发行日期', extraValue(item, 'releaseDate')],
    ['发行商', extraValue(item, 'publisher')],
    ['导演', extraValue(item, 'director')],
    ['系列', extraValue(item, 'series')],
    ['厂牌', extraValue(item, 'label')],
    ['时长', extraValue(item, 'runtime')],
  ].filter(([, value]) => value);

  els.detailMeta.replaceChildren();
  els.detailMeta.hidden = !rows.length;
  for (const [label, value] of rows) {
    const row = el('div', 'detail-row');
    const text = el('span', 'detail-value', value);
    text.title = value;
    row.append(el('span', 'detail-label', label), text);
    els.detailMeta.append(row);
  }
}

function renderDescription(item) {
  const node = els.detailDesc;
  if (!node) return;
  const text = extraValue(item, 'description');
  node.textContent = text;
  node.hidden = !text;
  node.classList.remove('is-open');
  node.title = text.length > 80 ? '点击展开全文' : '';
  node.onclick = text && text.length > 80
    ? () => {
        const open = node.classList.toggle('is-open');
        node.title = open ? '点击收起' : '点击展开全文';
      }
    : null;
}

function renderGenres(item) {
  const genres = genresOf(item);
  els.detailGenres.replaceChildren();
  els.detailGenres.hidden = !genres.length;
  for (const genre of genres) els.detailGenres.append(el('span', 'genre-chip', genre));
}

function renderRelated(item) {
  const related = relatedItems(item);
  els.detailRelated.replaceChildren();
  els.detailRelatedWrap.hidden = !related.length;
  if (!related.length) return;

  for (const entry of related) {
    const button = el('button', 'detail-related-item');
    button.type = 'button';

    const cover = el('span', 'detail-related-cover');
    if (entry.cover) {
      const img = el('img');
      img.src = entry.cover;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => img.remove());
      cover.append(img);
    } else {
      const code = extraValue(entry, 'code');
      const fallback = el('span', 'detail-related-fallback', code || initialOf(entry.url));
      fallback.style.setProperty('--h', hueOf(code || hostOf(entry.url)));
      cover.append(fallback);
    }

    button.append(cover, el('span', 'detail-related-title', entry.title || hostOf(entry.url)));
    button.addEventListener('click', () => openDetail(entry));
    els.detailRelated.append(button);
  }
}

function loadPreview(item) {
  stopPreview();
  const url = previewUrl(item);
  els.detailPreview.hidden = !url;
  if (!url) return;
  els.detailVideo.poster = item.cover || '';
  els.detailVideo.src = url;
  els.detailVideo.load();
}

function stopPreview() {
  const video = els.detailVideo;
  try {
    video.pause();
  } catch {
    // ignore
  }
  video.removeAttribute('src');
  video.removeAttribute('poster');
  video.load();
}

function showDetailError(message) {
  els.detailError.textContent = message;
  els.detailError.hidden = false;
}

function clearDetailError() {
  els.detailError.textContent = '';
  els.detailError.hidden = true;
}

function showDetailNote(message) {
  clearTimeout(noteTimer);
  els.detailNote.textContent = message;
  els.detailNote.hidden = false;
  noteTimer = setTimeout(() => {
    els.detailNote.hidden = true;
  }, 2200);
}

function clearDetailNote() {
  clearTimeout(noteTimer);
  els.detailNote.textContent = '';
  els.detailNote.hidden = true;
}
