// 页面弹窗守卫。由 background 或管理页注入到页面主世界，
// 行为全靠注入前写入的 __favourGuardConfig：
//
//   { popPath: "/pop", blockCrossOrigin: true, detectForeignUrlWrapper: true }
//
//   popPath                    站点把广告包成同域跳板路径时填它，命中即拦截
//   blockCrossOrigin           拦截跨域弹窗，默认 true
//   detectForeignUrlWrapper    同域跳转、但参数里塞了外站绝对地址 → 当广告跳板拦掉
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
  const detectForeignUrlWrapper = config.detectForeignUrlWrapper !== false;

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

  /**
   * 同域跳转，但查询参数里塞着外站的绝对地址 —— 广告跳板的典型形态，
   * 比如 /pop?url=https://ads.example/xxx。不知道站点用哪个路径时靠它兜底。
   */
  const carriesForeignUrl = (target) => {
    if (!detectForeignUrlWrapper) return false;
    for (const value of target.searchParams.values()) {
      if (!/^https?:\/\//i.test(value)) continue;
      try {
        if (new URL(value).origin !== origin) return true;
      } catch {
        // 不是合法地址，忽略
      }
    }
    return false;
  };

  globalThis.__favourGuardInstalled = true;

  const originalOpen = window.open;
  window.open = function guardedOpen(url, ...rest) {
    if (url) {
      const target = resolve(url);
      if (!target) return null;
      const sameSite = target.origin === origin;
      const adWrapper = sameSite && (isPopPath(target.pathname) || carriesForeignUrl(target));
      const crossSite = !sameSite && blockCrossOrigin;
      if (adWrapper || crossSite) return null;
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
      const adWrapper = sameSite && (isPopPath(target.pathname) || carriesForeignUrl(target));
      const programmaticCrossSite = blockCrossOrigin && !sameSite && !event.isTrusted;
      if (adWrapper || programmaticCrossSite) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
})();
