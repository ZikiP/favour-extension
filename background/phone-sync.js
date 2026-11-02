const SYNC_TIMEOUT_MS = 15000;

export function buildSyncBody(items, now = Date.now()) {
  return JSON.stringify({
    schemaVersion: 1,
    updatedAt: now,
    items: Array.isArray(items) ? items : [],
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
