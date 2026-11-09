// 页面角标的匹配：当前页面的编号在收藏里是什么状态。
//
//   full     收藏里有同一个版本（编号连同版本后缀都一致）
//   partial  收藏里有同一编号的其他版本
//   ''       没收藏过这个编号
//
// 编号解析全部走 versions.js，页面地址换成镜像域名也能认出来。

import { codeOfItem, parseCode, slugOfUrl } from './versions.js';

export const BADGE_FULL = 'full';
export const BADGE_PARTIAL = 'partial';

function remember(index, info) {
  if (!info.code) return;
  index.exact.add(info.code);
  index.base.add(info.base);
}

// 一条收藏对应哪个版本：番号字段和播放地址都可能有版本后缀，取更具体的那个。
// 番号栏只写基础编号、后缀只在地址里时，按地址算，否则会把同一个收藏当成两个版本。
function itemVersion(item) {
  const byCode = parseCode(codeOfItem(item));
  if (byCode.versioned) return byCode;
  const byUrl = parseCode(slugOfUrl(item.url));
  if (byUrl.versioned) return byUrl;
  return byCode.code ? byCode : byUrl;
}

export function buildBadgeIndex(items) {
  const index = { exact: new Set(), base: new Set() };
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    remember(index, itemVersion(item));
  }
  return index;
}

export function badgeStatusFor(index, url) {
  const info = parseCode(slugOfUrl(url));
  if (!info.code) return '';
  if (index.exact.has(info.code)) return BADGE_FULL;
  if (index.base.has(info.base)) return BADGE_PARTIAL;
  return '';
}

export async function badgeStatuses(urls) {
  const result = {};
  if (!Array.isArray(urls) || !urls.length) return result;

  const unique = [
    ...new Set(urls.filter((url) => typeof url === 'string' && url.trim())),
  ];
  if (!unique.length) return result;

  const { items } = await chrome.storage.local.get('items');
  const index = buildBadgeIndex(items);
  for (const url of unique) result[url] = badgeStatusFor(index, url);
  return result;
}
