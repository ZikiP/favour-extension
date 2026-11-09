// 页面收藏角标：列表卡片左上角和详情页标题下显示「已收藏 / 已收藏部分」。
//
//   full     收藏里有这个版本           → 已收藏
//   partial  收藏里有同编号的其他版本   → 已收藏部分
//
// 选择器来自解析规则的 badges 段（见 shared/badges.js），代码里不认任何站点。
// 角标状态由 background 统一计算，这里只负责收集地址、请求状态、画角标。
(() => {
  const CONFIG_KEY = '__favourBadgeConfig';
  const STYLE_ID = 'favour-badge-style';
  const BADGE_FULL = 'full';
  const BADGE_PARTIAL = 'partial';

  if (globalThis.__favourBadgeInstalled) {
    scheduleScan();
    return;
  }
  globalThis.__favourBadgeInstalled = true;

  const statusCache = new Map();
  const unknownUrls = new Set();
  let flushTimer = 0;
  let scanTimer = 0;

  const config = () => globalThis[CONFIG_KEY] || {};

  const LABELS = {
    [BADGE_FULL]: '已收藏',
    [BADGE_PARTIAL]: '已收藏部分',
  };

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .favour-badge {
        position: absolute;
        top: 8px;
        left: 8px;
        right: auto;
        bottom: auto;
        width: auto;
        height: auto;
        margin: 0;
        z-index: 20;
        display: inline-flex;
        align-items: center;
        box-sizing: border-box;
        padding: 3px 8px;
        border-radius: 6px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        font-size: 12px;
        font-weight: 600;
        line-height: 16px;
        letter-spacing: 0.02em;
        white-space: nowrap;
        color: #fff;
        pointer-events: none;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
        -webkit-font-smoothing: antialiased;
      }
      .favour-badge--full {
        background: #4f6bf5;
      }
      .favour-badge--partial {
        background: rgba(17, 20, 26, 0.82);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45), 0 2px 6px rgba(0, 0, 0, 0.28);
      }
      .favour-badge--detail {
        position: static;
        margin: 6px 0 2px;
        box-shadow: none;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function paint(badge, status, modifier) {
    const label = LABELS[status];
    if (!label) {
      badge.remove();
      return;
    }
    const className = [
      'favour-badge',
      modifier,
      status === BADGE_FULL ? 'favour-badge--full' : 'favour-badge--partial',
    ]
      .filter(Boolean)
      .join(' ');
    if (badge.className !== className) badge.className = className;
    if (badge.textContent !== label) badge.textContent = label;
    badge.title =
      status === BADGE_FULL ? 'Favour：已收藏这个版本' : 'Favour：已收藏同一编号的其他版本';
  }

  function cacheOf(url) {
    if (statusCache.has(url)) return statusCache.get(url);
    unknownUrls.add(url);
    if (!flushTimer) flushTimer = setTimeout(flushStatuses, 60);
    return undefined;
  }

  function flushStatuses() {
    flushTimer = 0;
    const urls = [...unknownUrls];
    unknownUrls.clear();
    if (!urls.length) return;

    const fail = () => {
      for (const url of urls) statusCache.set(url, '');
      scheduleScan();
    };

    let pending;
    try {
      pending = chrome.runtime.sendMessage({ type: 'favour.badge-status', urls });
    } catch {
      pending = null;
    }
    if (!pending || typeof pending.then !== 'function') {
      fail();
      return;
    }
    pending
      .then((result) => {
        for (const url of urls) statusCache.set(url, (result && result[url]) || '');
        scheduleScan();
      })
      .catch(fail);
  }

  function listBadgeOf(host) {
    for (const child of host.children) {
      if (child.dataset && child.dataset.favourBadge === 'list') return child;
    }
    return null;
  }

  function applyList() {
    const list = config().list;
    if (!list || !list.card) return;

    let cards;
    try {
      cards = document.querySelectorAll(list.card);
    } catch {
      return;
    }

    for (const card of cards) {
      let anchor;
      try {
        anchor = card.querySelector(list.anchor || 'a[href]');
      } catch {
        continue;
      }
      if (!anchor || !anchor.href) continue;

      let host = null;
      if (list.overlay) {
        try {
          host = card.querySelector(list.overlay);
        } catch {
          host = null;
        }
      }
      host = host || card;

      const status = cacheOf(anchor.href);
      if (status === undefined) continue;
      const badge = listBadgeOf(host);
      if (!status) {
        if (badge) badge.remove();
        continue;
      }
      if (badge) {
        paint(badge, status);
        continue;
      }
      const created = document.createElement('span');
      created.dataset.favourBadge = 'list';
      paint(created, status);
      host.appendChild(created);
    }
  }

  function applyDetail() {
    const detail = config().detail;
    if (!detail || !detail.target) return;

    let target;
    try {
      target = document.querySelector(detail.target);
    } catch {
      return;
    }
    if (!target || !target.parentElement) return;

    const status = cacheOf(location.href);
    if (status === undefined) return;

    let badge = document.querySelector('[data-favour-badge="detail"]');
    if (!status) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.dataset.favourBadge = 'detail';
      badge.className = 'favour-badge favour-badge--detail';
      badge.textContent = LABELS[status];
      target.insertAdjacentElement('afterend', badge);
      paint(badge, status, 'favour-badge--detail');
      return;
    }
    if (badge.previousElementSibling !== target) target.insertAdjacentElement('afterend', badge);
    paint(badge, status, 'favour-badge--detail');
  }

  function scan() {
    applyList();
    applyDetail();
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      scan();
    }, 120);
  }
  globalThis.__favourBadgeRescan = scheduleScan;

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.items) return;
      statusCache.clear();
      unknownUrls.clear();
      scheduleScan();
    });
  } catch {
    // 扩展刚被重载时上下文已失效，忽略
  }

  addStyle();
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    // 有些站点的卡片链接由前端框架后填 href，晚到的地址也要补一次
    attributeFilter: ['href'],
  });
  scheduleScan();
})();
