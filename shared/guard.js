// 页面弹窗守卫的公共部分：配置归一化 + 注入。
//
// background（页面加载时）和管理页（手动授权后立刻生效）都用这里，
// 两边行为一致，站点域名只写在规则 JSON 里，代码不认任何站点。

import { isAllowed } from './url-rules.js';

/** 守卫配置：
 * - popPath                   站点把广告包成同域跳板路径时填它（如 /pop），命中即拦
 * - blockCrossOrigin          拦截脚本触发的跨域弹窗，默认开
 * - detectForeignUrlWrapper   启发式：同域跳转但参数里塞了外站绝对地址 → 当广告跳板拦掉
 */
export const DEFAULT_GUARD = Object.freeze({
  popPath: '',
  blockCrossOrigin: true,
  detectForeignUrlWrapper: true,
});

export function normalizeGuardConfig(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_GUARD };
  const popPath =
    typeof raw.popPath === 'string' && raw.popPath.trim().startsWith('/')
      ? raw.popPath.trim().replace(/\/+$/, '')
      : '';
  return {
    popPath,
    blockCrossOrigin: raw.blockCrossOrigin !== false,
    detectForeignUrlWrapper: raw.detectForeignUrlWrapper !== false,
  };
}

/** 规则里有 guard 就用它，没有就用默认配置（默认也能拦掉常见的广告跳板）。 */
export function guardConfigOf(rule) {
  return normalizeGuardConfig(rule && rule.guard);
}

/** 规则是否覆盖这个网址 */
export function ruleMatchesUrl(rule, url) {
  const matches = rule && Array.isArray(rule.matches) ? rule.matches : [];
  return matches.length > 0 && isAllowed(url, matches);
}

/** 该站点的主机权限（守卫靠它注入） */
export function originPatternOf(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return '';
  }
}

/**
 * 往页面主世界注入守卫。
 * 先塞配置再灌脚本，两步都在 MAIN world，页面脚本看不到我们的变量名。
 */
export async function injectGuard(tabId, config) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (guard) => {
      globalThis.__favourGuardConfig = guard;
    },
    args: [config],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['shared/popup-guard.js'],
  });
}
