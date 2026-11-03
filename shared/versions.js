// 编号与版本。
//
// 同一条目常有多条收藏：默认版、带字幕版、其它版本。站点上的编号写法是
// 「基础编号 + 后缀」：
//   ABC-123          默认版
//   ABC-123-SUB      带字幕版
//   ABC-123-4K       其它版本
// 后缀里的词是字典词（见 CN_SUB / UNCENSORED / QUALITY），只有全部命中字典才拆成版本；
// 命中不了的（比如 ABC-123-2 的「-2」）当成完整编号，也就是独立的条目。
//
// 这个文件是纯文本规则，不碰 DOM 和存储。另外两端各有一份等价实现，改动请一起改：
//   favour-plugin/shared/versions.js     （扩展，权威版本）
//   favour-sync/public/versions.js       （同步网页端）
//   favour-player/…/Versions.kt          （Android 播放器）

const CODE_PATTERN = /^([A-Z][A-Z0-9]{1,9})-(\d{2,5})((?:-[A-Z0-9]+)*)$/;
const URL_SLUG_PATTERN = /^[a-z]{2,10}-\d{2,5}(?:-[a-z0-9]+)*$/;

const CN_SUB = new Set([
  'C',
  'CH',
  'CN',
  'CHS',
  'ZH',
  'CHI',
  'CHINESE',
  'CHINESESUB',
  'CHINESESUBTITLE',
  'CNSUB',
  'CHSUB',
  'SUBTITLE',
  'SUB',
  '中字',
]);

const UNCENSORED = new Set([
  'U',
  'UC',
  'UNC',
  'UNCENSORED',
  'LEAK',
  'DECENSOR',
  'DECENSORED',
  'REDUCED',
  'MOSAIC',
  '无码',
]);

const QUALITY = new Set([
  '4K',
  '8K',
  'FHD',
  'HD',
  'FULL',
  'VR',
  'AI',
  '60FPS',
  'FPS',
  'UPSCALE',
  'ENHANCED',
  'REMASTER',
  'REMASTERED',
]);

// 播放优先级：中文字幕 > 无码 > 原版 > 其他（4K 之类）
export const RANK_CN_SUB = 0;
export const RANK_UNCENSORED = 1;
export const RANK_PLAIN = 2;
export const RANK_OTHER = 3;

const PLAIN = Object.freeze({
  code: '',
  base: '',
  suffix: '',
  versioned: false,
  cnSub: false,
  uncensored: false,
  quality: [],
  label: '原版',
  rank: RANK_PLAIN,
});

function summarize(tokens) {
  let cnSub = false;
  let uncensored = false;
  const quality = [];

  for (const token of tokens) {
    if (CN_SUB.has(token)) cnSub = true;
    else if (UNCENSORED.has(token)) uncensored = true;
    else if (QUALITY.has(token)) quality.push(token);
    else return null;
  }

  const labels = [];
  if (cnSub) labels.push('中文字幕');
  if (uncensored) labels.push('无码');
  labels.push(...quality);

  return {
    cnSub,
    uncensored,
    quality,
    label: labels.join('·'),
    rank: cnSub ? RANK_CN_SUB : uncensored ? RANK_UNCENSORED : RANK_OTHER,
  };
}

function isVersionToken(token) {
  return CN_SUB.has(token) || UNCENSORED.has(token) || QUALITY.has(token);
}

export function parseCode(raw) {
  const code = String(raw == null ? '' : raw)
    .replace(/\s+/g, '')
    .toUpperCase();
  if (!code) return { ...PLAIN };

  // 从末尾往前剥版本词：「HMN-009-2-CHINESE-SUBTITLE」剥出中文字幕，剩下的
  // 「HMN-009-2」仍是基础编号；「HMN-009-2」末尾不是版本词，整串当一部作品。
  const match = CODE_PATTERN.exec(code);
  if (match) {
    const tokens = match[3] ? match[3].slice(1).split('-').filter(Boolean) : [];
    let cut = tokens.length;
    while (cut > 0 && isVersionToken(tokens[cut - 1])) cut -= 1;

    if (cut < tokens.length) {
      const versionTokens = tokens.slice(cut);
      const info = summarize(versionTokens);
      if (info) {
        return {
          code,
          base: [match[1], match[2], ...tokens.slice(0, cut)].join('-'),
          suffix: '-' + versionTokens.join('-'),
          versioned: true,
          ...info,
        };
      }
    }
  }

  return {
    ...PLAIN,
    code,
    base: code,
  };
}

export function slugOfUrl(url) {
  let pathname;
  try {
    pathname = new URL(String(url == null ? '' : url)).pathname;
  } catch {
    return '';
  }
  const segments = pathname.split('/').filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    let segment = segments[index];
    try {
      segment = decodeURIComponent(segment);
    } catch {
      // 保持原样
    }
    segment = segment.toLowerCase();
    if (URL_SLUG_PATTERN.test(segment)) return segment;
  }
  return '';
}

// 条目上存的编号字段；没有则退回 URL 末段的 slug（规则没抓到编号时不至于散成多条）
export function codeOfItem(item) {
  const extras = item && item.extras;
  if (Array.isArray(extras)) {
    const extra = extras.find(
      (entry) => entry && entry.key === 'code' && typeof entry.value === 'string' && entry.value.trim(),
    );
    if (extra) return extra.value.trim();
  }
  return slugOfUrl(item && item.url);
}

export function versionOf(item) {
  return parseCode(codeOfItem(item));
}

// 分组键：同一条目的所有版本共用；无编号的条目各成一组
export function workKeyOf(item) {
  return parseCode(codeOfItem(item)).base;
}

export function compareVersions(a, b) {
  const left = versionOf(a);
  const right = versionOf(b);
  if (left.rank !== right.rank) return left.rank - right.rank;
  return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
}

// 快捷播放选版：中文字幕优先，其次无码，再次原版；同档取最近更新的那条
export function pickPreferred(items) {
  const list = Array.isArray(items) ? items : [];
  let best = null;
  let bestInfo = null;
  for (const item of list) {
    const info = versionOf(item);
    if (!best) {
      best = item;
      bestInfo = info;
      continue;
    }
    if (info.rank < bestInfo.rank) {
      best = item;
      bestInfo = info;
      continue;
    }
    if (info.rank === bestInfo.rank && (Number(item.updatedAt) || 0) > (Number(best.updatedAt) || 0)) {
      best = item;
      bestInfo = info;
    }
  }
  return best;
}
