// 页面弹窗守卫。由 background 在命中站点规则（规则里带 guard 字段）的页面上注入，
// 运行在页面主世界。这里不认任何站点，行为全靠注入前写入的 __favourGuardConfig：
//
//   { popPath: "/pop", blockCrossOrigin: true }
//
//   popPath            站点把广告包成同域跳板路径时填它，命中即拦截（'' 表示不判断）
//   blockCrossOrigin   拦截脚本触发的跨域弹窗，默认 true
//
// 目的：播放时站点常用 window.open 或脚本点链接的方式弹广告，
// 正常链接与站内弹窗保持可用。
(() => {
  if (globalThis.__favourGuardInstalled) return;

  const config = globalThis.__favourGuardConfig || {};
  delete globalThis.__favourGuardConfig;

  const popPath = typeof config.popPath === 'string' && config.popPath.startsWith('/')
    ? config.popPath.replace(/\/+$/, '')
    : '';
  const blockCrossOrigin = config.blockCrossOrigin !== false;

  const origin = location.origin;
  const isPopPath = (pathname) =>
    Boolean(popPath) && (pathname === popPath || pathname.startsWith(popPath + '/'));

  const resolve = (url) => {
    try {
      return new URL(String(url), location.href);
    } catch {
      return null;
    }
  };

  globalThis.__favourGuardInstalled = true;

  const originalOpen = window.open;
  window.open = function guardedOpen(url, ...rest) {
    if (url) {
      const target = resolve(url);
      if (!target) return null;
      const sameSite = target.origin === origin;
      if (sameSite ? isPopPath(target.pathname) : blockCrossOrigin) return null;
    }
    return originalOpen.apply(this, [url, ...rest]);
  };

  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor) return;
      const target = resolve(anchor.getAttribute('href'));
      if (!target) return;

      const sameSite = target.origin === origin;
      const popWrapper = sameSite && isPopPath(target.pathname);
      const programmaticCrossSite = blockCrossOrigin && !sameSite && !event.isTrusted;
      if (popWrapper || programmaticCrossSite) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
})();
