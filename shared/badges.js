// 页面收藏角标的配置归一化与注入。
//
// 角标选择器是站点细节，写在解析规则的 badges 段里，代码不认任何站点：
//
//   "badges": {
//     "list":   { "card": ".thumbnail", "anchor": "a[href]", "overlay": ".relative" },
//     "detail": { "target": "h1" }
//   }
//
// list.card    列表里的每张卡片
// list.anchor  卡片里取播放地址的链接（编号从地址末段解析）
// list.overlay 角标挂到卡片里的哪个元素上，省略则挂到卡片本身
// detail.target 详情页把角标插到这个元素后面
//
// 角标脚本跑在隔离世界，需要该站点的主机权限；背景在页面加载、切回标签页、
// 扩展启动/更新后各注入一次，页面内脚本自己监听收藏变化刷新。

function selectorOf(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function normalizeBadgeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const listRaw = raw.list && typeof raw.list === 'object' ? raw.list : null;
  const listCard = listRaw ? selectorOf(listRaw.card) : '';
  const list = listCard
    ? {
        card: listCard,
        anchor: selectorOf(listRaw.anchor) || 'a[href]',
        overlay: selectorOf(listRaw.overlay),
      }
    : null;

  const detailRaw = raw.detail && typeof raw.detail === 'object' ? raw.detail : null;
  const detailTarget = detailRaw ? selectorOf(detailRaw.target) : '';
  const detail = detailTarget ? { target: detailTarget } : null;

  return list || detail ? { list, detail } : null;
}

export function badgeConfigOf(rule) {
  return normalizeBadgeConfig(rule && rule.badges);
}

export async function injectBadges(tabId, config) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (badgeConfig) => {
      globalThis.__favourBadgeConfig = badgeConfig;
    },
    args: [config],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['shared/page-badges.js'],
  });
}
