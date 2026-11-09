// 同步推送与重试策略自测：node tools/test-sync.mjs
//
// pushToTargets 用假 fetch 驱动，验证成功/失败/超时的结果聚合；
// retryDelayMinutes 验证退避序列与放弃边界。

import assert from 'node:assert/strict';
import { buildSyncBody, pushToTargets, retryDelayMinutes, SYNC_RETRY_DELAYS_MINUTES } from '../background/phone-sync.js';

const target = { id: 'phone', name: '手机', url: 'http://127.0.0.1:8789', token: 't' };

// ---- buildSyncBody ----
{
  const body = JSON.parse(buildSyncBody([{ id: '1', url: 'https://a.example/1' }], {
    actressAvatars: { name: 'https://img.example/a.jpg' },
    actressMeta: { name: { favorite: true, order: 1 } },
  }, 12345));
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.updatedAt, 12345);
  assert.equal(body.items.length, 1);
  assert.equal(body.actressAvatars.name, 'https://img.example/a.jpg');
  assert.equal(body.actressMeta.name.favorite, true);
  // 缺省/坏输入不炸
  assert.deepEqual(JSON.parse(buildSyncBody(null)).items, []);
  assert.deepEqual(JSON.parse(buildSyncBody([], null)).actressAvatars, {});
}

// ---- pushToTargets：全部成功 ----
{
  const fetchImpl = async (url, options) => {
    assert.equal(url, `${target.url}/api/items`);
    assert.equal(options.method, 'PUT');
    assert.equal(options.headers.Authorization, 'Bearer t');
    return { ok: true, status: 200, json: async () => ({ ok: true, count: 7 }) };
  };
  const status = await pushToTargets([target], '{}', { fetchImpl });
  assert.equal(status.ok, true);
  assert.equal(status.count, 7);
  assert.equal(status.results[0].ok, true);
}

// ---- pushToTargets：服务端拒绝（如 409 空覆盖保护） ----
{
  const fetchImpl = async () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: '拒绝用空列表覆盖现有 95 条收藏' }),
  });
  const status = await pushToTargets([target], '{}', { fetchImpl });
  assert.equal(status.ok, false);
  assert.match(status.error, /拒绝用空列表覆盖/);
  assert.equal(status.results[0].ok, false);
}

// ---- pushToTargets：网络异常 ----
{
  const fetchImpl = async () => { throw new Error('fetch failed'); };
  const status = await pushToTargets([target], '{}', { fetchImpl });
  assert.equal(status.ok, false);
  assert.match(status.results[0].error, /fetch failed/);
}

// ---- pushToTargets：超时 ----
{
  const fetchImpl = (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const status = await pushToTargets([target], '{}', { fetchImpl, timeoutMs: 30 });
  assert.equal(status.ok, false);
  assert.equal(status.results[0].error, '连接超时');
}

// ---- pushToTargets：多目标部分失败 ----
{
  const okTarget = { ...target, id: 'ok', name: '正常', url: 'http://ok.example' };
  const badTarget = { ...target, id: 'bad', name: '断线', url: 'http://bad.example' };
  const fetchByUrl = async (url) => {
    if (url.startsWith('http://bad')) throw new Error('offline');
    return { ok: true, status: 200, json: async () => ({ count: 1 }) };
  };
  const status = await pushToTargets([okTarget, badTarget], '{}', { fetchImpl: fetchByUrl });
  assert.equal(status.ok, false);
  assert.match(status.error, /断线：offline/);
  assert.equal(status.results.filter((r) => r.ok).length, 1);
}

// ---- retryDelayMinutes：退避序列 ----
{
  SYNC_RETRY_DELAYS_MINUTES.forEach((delay, index) => {
    assert.equal(retryDelayMinutes(index + 1), delay);
  });
  assert.equal(retryDelayMinutes(SYNC_RETRY_DELAYS_MINUTES.length + 1), null, '超出次数应放弃');
  assert.equal(retryDelayMinutes(99), null);
  assert.equal(retryDelayMinutes(0), null);
  assert.equal(retryDelayMinutes(-1), null);
  assert.equal(retryDelayMinutes(1.9), SYNC_RETRY_DELAYS_MINUTES[0], '非整数取整');
}

console.log('test-sync: all passed');