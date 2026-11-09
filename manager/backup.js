import { dedupeTags, els, hostOf, normalizeUrl, toast } from './dom.js';
import { state, local, mergeByCode, normalizeActressMeta, normalizeAvatars, normalizeItems, normalizeParserRule } from './store.js';
import { normalizeRule } from '../shared/url-rules.js';
import { render } from './views.js';

export function exportBackup() {
  const payload = {
    app: 'favour',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    items: state.items,
    settings: { whitelist: state.rules },
    parserRules: state.parserRules,
    actressAvatars: state.actressAvatars,
    actressMeta: state.actressMeta,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `favour-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  toast(`已导出 ${state.items.length} 条收藏、${state.rules.length} 条范围规则、${state.parserRules.length} 条解析规则`);
}

function rawCode(raw) {
  const extras = raw && Array.isArray(raw.extras) ? raw.extras : [];
  const extra = extras.find(
    (entry) => entry && entry.key === 'code' && typeof entry.value === 'string' && entry.value.trim(),
  );
  return extra ? extra.value.trim().toLowerCase() : '';
}

function itemFromRaw(raw, url) {
  const tags = Array.isArray(raw.tags)
    ? dedupeTags(raw.tags.filter((tag) => typeof tag === 'string'))
    : [];
  const extras = Array.isArray(raw.extras)
    ? raw.extras
        .filter((extra) => extra && typeof extra.value === 'string' && extra.value.trim())
        .map((extra) => ({
          key: String(extra.key || extra.label || ''),
          label: String(extra.label || extra.key || ''),
          value: String(extra.value),
        }))
    : [];
  const cover =
    typeof raw.cover === 'string' && /^(https?:|data:image\/)/i.test(raw.cover) ? raw.cover : '';
  const source =
    raw.source && typeof raw.source === 'object' && raw.source.name
      ? { id: String(raw.source.id || ''), name: String(raw.source.name) }
      : null;

  return {
    // 保留备份里的 id：播放器端按作品关联的字幕/进度都认这个 id，
    // 重新生成会让恢复出来的收藏变成「新作品」
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    url,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : hostOf(url),
    tags,
    favorite: raw.favorite === true,
    watched: raw.watched === true,
    lastOpenedAt: Number(raw.lastOpenedAt) || 0,
    extras,
    cover,
    source,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now(),
  };
}

export async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('导入失败：不是有效的 JSON 文件', { tone: 'error' });
    return;
  }

  const incoming = Array.isArray(data) ? data : data && data.items;
  const rules = data && data.settings && Array.isArray(data.settings.whitelist)
    ? data.settings.whitelist
    : Array.isArray(data && data.whitelist)
      ? data.whitelist
      : [];
  const parserRules = data && Array.isArray(data.parserRules) ? data.parserRules : [];
  const avatars = data && data.actressAvatars && typeof data.actressAvatars === 'object'
    ? data.actressAvatars
    : {};
  const actressMeta = data && data.actressMeta && typeof data.actressMeta === 'object'
    ? data.actressMeta
    : {};

  if (!Array.isArray(incoming) && !rules.length && !parserRules.length && !Object.keys(avatars).length && !Object.keys(actressMeta).length) {
    toast('导入失败：文件里没有可导入的数据', { tone: 'error' });
    return;
  }

  state.pendingImport = {
    items: Array.isArray(incoming) ? incoming : [],
    rules,
    parserRules,
    avatars,
    actressMeta,
  };
  els.importSummary.textContent =
    `备份包含 ${state.pendingImport.items.length} 条收藏、${rules.length} 条范围规则、` +
    `${parserRules.length} 条解析规则、${Object.keys(avatars).length} 个头像。`;
  if (!els.importDialog.open) els.importDialog.showModal();
}

export async function applyImport(mode) {
  const pending = state.pendingImport;
  state.pendingImport = null;
  if (els.importDialog.open) els.importDialog.close();
  if (!pending) return;
  if (mode === 'replace') await replaceFromBackup(pending);
  else await mergeFromBackup(pending);
}

async function mergeFromBackup(pending) {
  const items = state.items.slice();
  const seenUrls = new Set(items.map((entry) => entry.url));
  const seenCodes = new Set(items.map(rawCode).filter(Boolean));
  let added = 0;
  let skipped = 0;

  for (const raw of pending.items) {
    const url = raw ? normalizeUrl(raw.url) : null;
    const code = rawCode(raw);
    if (!url || seenUrls.has(url) || (code && seenCodes.has(code))) {
      skipped += 1;
      continue;
    }
    items.push(itemFromRaw(raw, url));
    seenUrls.add(url);
    if (code) seenCodes.add(code);
    added += 1;
  }

  const whitelist = state.rules.slice();
  let whitelistAdded = 0;
  for (const raw of pending.rules) {
    if (typeof raw !== 'string') continue;
    const rule = normalizeRule(raw);
    if (!rule || whitelist.includes(rule)) continue;
    whitelist.push(rule);
    whitelistAdded += 1;
  }

  const parserRules = state.parserRules.slice();
  let parserAdded = 0;
  for (const raw of pending.parserRules) {
    const rule = normalizeParserRule(raw);
    if (!rule || parserRules.some((entry) => entry.id === rule.id)) continue;
    parserRules.push(rule);
    parserAdded += 1;
  }

  const avatars = normalizeAvatars({ ...state.actressAvatars, ...pending.avatars });
  const actressMeta = normalizeActressMeta({ ...state.actressMeta, ...pending.actressMeta });
  const finalItems = mergeByCode(normalizeItems(items)).items;

  try {
    const stored = await local.get('settings');
    await local.set({
      items: finalItems,
      settings: { ...(stored.settings || {}), whitelist },
      parserRules,
      actressAvatars: avatars,
      actressMeta,
    });
  } catch (error) {
    toast('导入失败：' + (error && error.message ? error.message : '写入存储失败'), { tone: 'error' });
    return;
  }

  state.items = finalItems;
  state.rules = whitelist;
  state.parserRules = parserRules;
  state.actressAvatars = avatars;
  state.actressMeta = actressMeta;
  render();

  const parts = [`${added} 条收藏`];
  if (skipped) parts.push(`跳过 ${skipped} 条重复/无效`);
  if (whitelistAdded) parts.push(`${whitelistAdded} 条范围规则`);
  if (parserAdded) parts.push(`${parserAdded} 条解析规则`);
  toast(`已导入 ${parts.join('、')}`);
}

async function replaceFromBackup(pending) {
  const items = mergeByCode(normalizeItems(pending.items)).items;
  const rules = pending.rules.map(normalizeRule).filter(Boolean);
  const parserRules = pending.parserRules.map(normalizeParserRule).filter(Boolean);
  const avatars = normalizeAvatars(pending.avatars);
  const actressMeta = normalizeActressMeta(pending.actressMeta);

  try {
    await local.set({
      items,
      settings: { whitelist: rules },
      parserRules,
      actressAvatars: avatars,
      actressMeta,
    });
  } catch (error) {
    toast('恢复失败：' + (error && error.message ? error.message : '写入存储失败'), { tone: 'error' });
    return;
  }

  state.items = items;
  state.rules = rules;
  state.parserRules = parserRules;
  state.actressAvatars = avatars;
  state.actressMeta = actressMeta;
  render();
  toast(`已用备份覆盖：${items.length} 条收藏、${rules.length} 条范围规则、${parserRules.length} 条解析规则`);
}
