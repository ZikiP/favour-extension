export function extraValue(item, key) {
  const extra = item.extras.find((entry) => entry.key === key);
  return extra && typeof extra.value === 'string' ? extra.value.trim() : '';
}

export function splitValues(raw) {
  return String(raw || '')
    .split(/[,，、]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function genresOf(item) {
  return splitValues(extraValue(item, 'genres'));
}

export function seriesOf(item) {
  return extraValue(item, 'series');
}

export function runtimeSeconds(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return 0;
  if (match[3] === undefined) return Number(match[1]) * 60 + Number(match[2]);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function previewUrl(item) {
  const preview = extraValue(item, 'preview');
  if (preview) return preview;
  const cover = item.cover || '';
  return /\/cover(?:-[a-z])?\.jpg$/i.test(cover)
    ? cover.replace(/\/cover(?:-[a-z])?\.jpg$/i, '/preview.mp4')
    : '';
}
