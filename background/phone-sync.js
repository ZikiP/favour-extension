const SYNC_TIMEOUT_MS = 15000;

/**
 * 同步失败后的重试间隔（分钟）：1 → 3 → 10 → 30，之后放弃，
 * 等下一次收藏变更或浏览器启动再试。用 alarms 而不是 setTimeout，
 * MV3 的 service worker 随时会被杀，定时器活不过休眠。
 */
export const SYNC_RETRY_DELAYS_MINUTES = [1, 3, 10, 30];

/** 第 attempt 次失败后该等多久；返回 null 表示不再重试。 */
export function retryDelayMinutes(attempt) {
  const index = Math.trunc(attempt) - 1;
  if (index < 0) return null;
  return SYNC_RETRY_DELAYS_MINUTES[index] ?? null;
}

export function buildSyncBody(items, meta = {}, now = Date.now()) {
  const avatars = meta && typeof meta.actressAvatars === 'object' && meta.actressAvatars
    ? meta.actressAvatars
    : {};
  const actressMeta = meta && typeof meta.actressMeta === 'object' && meta.actressMeta
    ? meta.actressMeta
    : {};
  return JSON.stringify({
    schemaVersion: 1,
    updatedAt: now,
    items: Array.isArray(items) ? items : [],
    actressAvatars: avatars,
    actressMeta,
  });
}

async function pushToTarget(target, body, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${target.url}/api/items`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${target.token}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    return {
      id: target.id,
      name: target.name,
      url: target.url,
      ok: true,
      count: Number(payload.count) || 0,
    };
  } catch (error) {
    return {
      id: target.id,
      name: target.name,
      url: target.url,
      ok: false,
      error: controller.signal.aborted
        ? '连接超时'
        : error && error.message
          ? error.message
          : '同步失败',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function pushToTargets(
  targets,
  body,
  { fetchImpl = fetch, timeoutMs = SYNC_TIMEOUT_MS } = {},
) {
  const results = await Promise.all(
    targets.map((target) => pushToTarget(target, body, fetchImpl, timeoutMs)),
  );
  const failed = results.filter((result) => !result.ok);
  return {
    ok: failed.length === 0,
    at: Date.now(),
    count: results.reduce((max, result) => Math.max(max, result.count || 0), 0),
    results,
    error: failed.map((result) => `${result.name}：${result.error}`).join('；'),
  };
}

async function probeTarget(target, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${target.url}/api/items`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${target.token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (response.status === 401) throw new Error('令牌无效');
    if (response.status === 404) throw new Error('地址不对');
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    const count = Array.isArray(payload.items)
      ? payload.items.length
      : Number(payload.count) || 0;
    return { id: target.id, name: target.name, url: target.url, ok: true, count };
  } catch (error) {
    return {
      id: target.id,
      name: target.name,
      url: target.url,
      ok: false,
      error: controller.signal.aborted
        ? '连接超时'
        : error && error.message
          ? error.message
          : '连接失败',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeTargets(
  targets,
  { fetchImpl = fetch, timeoutMs = 8000 } = {},
) {
  const results = await Promise.all(
    targets.map((target) => probeTarget(target, fetchImpl, timeoutMs)),
  );
  const failed = results.filter((result) => !result.ok);
  return {
    ok: failed.length === 0,
    at: Date.now(),
    results,
    error: failed.map((result) => `${result.name}：${result.error}`).join('；'),
  };
}
