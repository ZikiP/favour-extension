// Sync targets: one FavourPlayer receive endpoint per device.

export const SYNC_TARGET_LIMIT = 8;

export function syncTargetId() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // fall through to the timestamp id
  }
  return `target-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeSyncTarget(raw, index = 0) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const name = String(source.name || '').trim();
  return {
    id: String(source.id || '').trim() || `target-${index + 1}`,
    name: name || `目标 ${index + 1}`,
    url: String(source.url || '').trim().replace(/\/+$/, ''),
    token: String(source.token || '').trim(),
  };
}

export function normalizeSyncTargets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, SYNC_TARGET_LIMIT).map(normalizeSyncTarget);
}

export function isSyncTargetReady(target) {
  return Boolean(
    target &&
      target.url &&
      target.token &&
      /^https?:\/\//i.test(target.url),
  );
}

export function readSyncTargets(data = {}) {
  const raw = Array.isArray(data.syncTargets)
    ? data.syncTargets
    : data.syncSettings && (data.syncSettings.url || data.syncSettings.token)
      ? [{ ...data.syncSettings, name: '目标 1' }]
      : [];
  return normalizeSyncTargets(raw).filter(isSyncTargetReady);
}
