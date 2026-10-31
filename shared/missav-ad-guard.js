// Runs in the page's MAIN world on missav.live. The site opens ad tabs via
// window.open('/pop?url=<ad>') when playback starts; block that wrapper and
// cross-origin popups, plus programmatic ad-link clicks. Normal links and
// same-site popups keep working.
(() => {
  const origin = location.origin;
  const isPopPath = (pathname) => pathname === '/pop' || pathname.startsWith('/pop/');

  const resolve = (url) => {
    try {
      return new URL(String(url), location.href);
    } catch {
      return null;
    }
  };

  const originalOpen = window.open;
  window.open = function guardedOpen(url, ...rest) {
    if (url) {
      const target = resolve(url);
      if (!target) return null;
      const internal = target.origin === origin && !isPopPath(target.pathname);
      if (!internal) return null;
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

      const popWrapper = target.origin === origin && isPopPath(target.pathname);
      const programmaticCrossSite = !event.isTrusted && target.origin !== origin;
      if (popWrapper || programmaticCrossSite) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
})();
