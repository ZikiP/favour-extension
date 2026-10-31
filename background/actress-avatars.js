import { baseActressName } from '../shared/names.js';

async function collectActressAvatars(config, names) {
  const wanted = new Set(names);
  const links = [];
  const seen = new Set();

  for (const anchor of document.querySelectorAll(config.links)) {
    const name = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (!wanted.has(name) || seen.has(name)) continue;
    const href = anchor.href || anchor.getAttribute('href');
    if (!href || !/^https?:/i.test(href)) continue;
    seen.add(name);
    links.push({ name, href });
  }

  const found = [];
  const results = await Promise.all(
    links.slice(0, 8).map(async ({ name, href }) => {
      try {
        const response = await fetch(href, {
          credentials: 'same-origin',
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return null;
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');

        let url = '';
        const baseName = name.replace(/\s*[（(].*?[)）]\s*$/, '').trim();
        const portrait = Array.from(doc.querySelectorAll('img')).find((img) => {
          const alt = (img.getAttribute('alt') || '').trim();
          return alt === name || (baseName && alt === baseName);
        });
        if (portrait) url = portrait.getAttribute('src') || '';

        for (const key of config.meta || []) {
          if (url) break;
          const meta = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
          if (meta) url = meta.getAttribute('content') || '';
        }

        if (!url) return null;
        try {
          url = new URL(url, href).href;
        } catch {
          return null;
        }
        if (url.startsWith('http://')) url = 'https://' + url.slice(7);
        if (!/^https?:\/\//i.test(url)) return null;
        return { name, url };
      } catch {
        // profile page unreachable — avatar stays unset
        return null;
      }
    }),
  );

  for (const entry of results) if (entry) found.push(entry);
  return found;
}

export async function readActressAvatars() {
  const { actressAvatars } = await chrome.storage.local.get('actressAvatars');
  return actressAvatars && typeof actressAvatars === 'object' ? actressAvatars : {};
}

export async function enrichActressAvatars(tab, rule, extras) {
  const field = rule && Array.isArray(rule.fields)
    ? rule.fields.find((entry) => entry && entry.key === 'actress' && entry.avatar && entry.avatar.links)
    : null;
  if (!field || !tab || tab.id == null) return;

  const actress = (extras || []).find((entry) => entry && entry.key === 'actress');
  const names = actress && typeof actress.value === 'string'
    ? actress.value.split(/[,，、]/).map((name) => name.trim()).filter(Boolean)
    : [];
  if (!names.length) return;

  const current = await readActressAvatars();
  const missing = names.filter((name) => !current[baseActressName(name).toLowerCase()]);
  if (!missing.length) return;

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectActressAvatars,
      args: [{ links: field.avatar.links, meta: field.avatar.meta || [] }, missing],
    });
  } catch {
    return;
  }

  const found = results && results[0] && Array.isArray(results[0].result) ? results[0].result : [];
  const next = { ...current };
  let changed = false;
  for (const entry of found) {
    if (!entry || typeof entry.name !== 'string' || typeof entry.url !== 'string') continue;
    const key = baseActressName(entry.name).toLowerCase();
    if (!key || next[key]) continue;
    next[key] = entry.url;
    changed = true;
  }
  if (!changed) return;

  try {
    await chrome.storage.local.set({ actressAvatars: next });
  } catch {
    // avatar cache is best-effort
  }
}
