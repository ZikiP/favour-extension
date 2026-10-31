export function baseActressName(name) {
  const value = String(name || '').replace(/\s+/g, ' ').trim();
  return value.replace(/\s*[（(][^（）()]*[)）]\s*$/, '').trim() || value;
}
