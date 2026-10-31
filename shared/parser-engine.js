// Extraction engine for imported parser rules. Runs inside the page's isolated
// world (injected by the background worker) and is also require()-able for tests.
(function (root) {
  'use strict';

  const norm = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

  function normalizeLabel(value) {
    return norm(value).replace(/[:：]\s*$/, '').trim();
  }

  function normalizeDate(value) {
    const match = String(value || '').match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (!match) return norm(value);
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  function finalize(value, source) {
    let text = norm(value);
    if (!text) return '';

    if (source.regex) {
      let pattern;
      try {
        pattern = new RegExp(source.regex);
      } catch {
        return '';
      }
      const match = text.match(pattern);
      if (!match) return '';
      text = match[source.group == null ? 1 : source.group];
      if (text == null) text = match[0];
      text = norm(text);
    }

    if (source.date) text = normalizeDate(text);
    if (source.upper) text = text.toUpperCase();
    if (source.lower) text = text.toLowerCase();
    return norm(text);
  }

  function fromMeta(source, documentRef) {
    const key = String(source.property || source.name || '');
    if (!key) return '';
    const escaped = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const element = documentRef.querySelector(`meta[property="${escaped}"], meta[name="${escaped}"]`);
    return element ? element.getAttribute('content') || '' : '';
  }

  function fromLabel(source, documentRef) {
    const rows = documentRef.querySelectorAll(source.rows || '.space-y-2 > div');
    const labels = (source.labels || []).map(normalizeLabel);
    if (!labels.length) return '';

    for (const row of rows) {
      const labelElement = row.querySelector(source.labelSelector || 'span');
      if (!labelElement) continue;
      if (!labels.includes(normalizeLabel(labelElement.textContent))) continue;

      const valueElement = source.selector ? row.querySelector(source.selector) : null;
      const kind = source.value || 'text';

      if (kind === 'attr') {
        const target = valueElement || row.querySelector('time') || row;
        return target.getAttribute(source.attr || 'datetime') || target.textContent || '';
      }

      if (kind === 'linkText') {
        return Array.from((valueElement || row).querySelectorAll('a'))
          .map((link) => norm(link.textContent))
          .filter(Boolean)
          .join(', ');
      }

      if (kind === 'href') {
        const link = (valueElement || row).querySelector('a');
        return link ? link.getAttribute('href') || '' : '';
      }

      if (valueElement) return valueElement.textContent || '';

      const clone = row.cloneNode(true);
      const cloneLabel = clone.querySelector(source.labelSelector || 'span');
      if (cloneLabel) cloneLabel.remove();
      return clone.textContent || '';
    }

    return '';
  }

  function fromSelector(source, documentRef) {
    if (!source.selector) return '';
    const element = documentRef.querySelector(source.selector);
    if (!element) return '';
    if (source.value === 'backgroundImage') {
      const view = element.ownerDocument && element.ownerDocument.defaultView;
      const raw =
        (view && view.getComputedStyle(element).backgroundImage) ||
        element.style.backgroundImage ||
        '';
      const match = String(raw).match(/url\((['"]?)(.*?)\1\)/);
      return match ? match[2] : '';
    }
    if (source.value === 'attr') return element.getAttribute(source.attr || 'content') || '';
    if (source.value === 'linkText') {
      return Array.from(element.querySelectorAll('a'))
        .map((link) => norm(link.textContent))
        .filter(Boolean)
        .join(', ');
    }
    if (source.value === 'href') {
      const link = element.closest('a') || element.querySelector('a');
      return link ? link.getAttribute('href') || '' : '';
    }
    return element.textContent || '';
  }

  function resolveSource(source, context) {
    if (!source || typeof source !== 'object') return '';
    let raw = '';

    if (source.type === 'meta') raw = fromMeta(source, context.documentRef);
    else if (source.type === 'label') raw = fromLabel(source, context.documentRef);
    else if (source.type === 'css') raw = fromSelector(source, context.documentRef);
    else if (source.type === 'url') raw = context.url;
    else if (source.type === 'title') raw = context.documentRef.title;
    else if (source.type === 'constant') raw = source.value || '';

    return finalize(raw, source);
  }

  function extract(rule, url, doc) {
    const documentRef = doc || root.document;
    if (!rule || !Array.isArray(rule.fields) || !documentRef) return { title: '', cover: '', extras: [] };

    const context = {
      documentRef,
      url: String(url || (documentRef.location && documentRef.location.href) || ''),
    };
    const extras = [];
    let title = '';
    let cover = '';

    for (const field of rule.fields) {
      if (!field || typeof field.key !== 'string' || !Array.isArray(field.sources)) continue;
      let value = '';
      for (const source of field.sources) {
        value = resolveSource(source, context);
        if (value) break;
      }
      if (!value) continue;
      if (field.key === 'title') {
        title = value;
        continue;
      }
      if (field.key === 'cover') {
        cover = value;
        continue;
      }
      extras.push({ key: field.key, label: field.label || field.key, value });
    }

    if (!title) title = norm(documentRef.title);
    return { title, cover, extras };
  }

  const api = { extract, normalizeLabel, normalizeDate };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FavourParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
