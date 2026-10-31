// Whitelist rules: "example.com" (domain + all subdomains), "example.com/docs"
// (path prefix), "localhost:3000" (port), "*.example.com" (same as bare domain), "*" (all).

function parseRule(raw) {
  let value = String(raw || '').trim();
  if (!value) return null;
  if (value === '*') return { all: true };

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  value = value.split(/[?#]/)[0];

  let hostPart = value;
  let path = '';
  const slash = value.indexOf('/');
  if (slash >= 0) {
    hostPart = value.slice(0, slash);
    path = value.slice(slash);
  }

  if (!hostPart || /[\s%]/.test(hostPart)) return null;
  hostPart = hostPart.toLowerCase();
  if (hostPart.startsWith('*.')) hostPart = hostPart.slice(2);
  if (!hostPart || hostPart.includes('*')) return null;

  let host = hostPart;
  let port = '';
  if (hostPart.startsWith('[')) {
    const close = hostPart.indexOf(']');
    if (close < 0) return null;
    host = hostPart.slice(0, close + 1);
    const rest = hostPart.slice(close + 1);
    if (rest) {
      if (!/^:\d{1,5}$/.test(rest)) return null;
      port = rest.slice(1);
    }
  } else {
    const match = hostPart.match(/^([^:]+):(\d{1,5})$/);
    if (match) {
      host = match[1];
      port = match[2];
    }
    if (host.includes(':')) return null;
  }

  try {
    const probe = new URL(`http://${host}${port ? ':' + port : ''}/`);
    if (!probe.hostname) return null;
  } catch {
    return null;
  }

  if (path) {
    try {
      path = new URL('http://rule.local' + (path.startsWith('/') ? path : '/' + path)).pathname;
    } catch {
      return null;
    }
    path = path.replace(/\/+$/, '');
  }

  return { host, port, path };
}

export function normalizeRule(raw) {
  const parsed = parseRule(raw);
  if (!parsed) return null;
  if (parsed.all) return '*';
  return parsed.host + (parsed.port ? ':' + parsed.port : '') + parsed.path;
}

const isIpHost = (host) =>
  host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

function matches(target, rule) {
  const parsed = parseRule(rule);
  if (!parsed) return false;
  if (parsed.all) return true;

  const host = target.hostname.toLowerCase();
  const hostOk =
    host === parsed.host ||
    (!isIpHost(parsed.host) && host.endsWith('.' + parsed.host));
  if (!hostOk) return false;

  if (parsed.port) {
    const port = target.port || (target.protocol === 'https:' ? '443' : '80');
    if (port !== parsed.port) return false;
  }

  if (parsed.path) {
    const pathname = target.pathname.replace(/\/+$/, '') || '/';
    if (!(pathname === parsed.path || pathname.startsWith(parsed.path + '/'))) return false;
  }

  return true;
}

export function isAllowed(url, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return false;

  let target;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;

  return rules.some((rule) => matches(target, rule));
}
