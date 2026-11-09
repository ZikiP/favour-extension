// 同步重试 E2E：node tools/e2e-sync-retry.mjs
//
// 无头 Edge 加载真实扩展 + 临时同步服务：
// 1. 目标不可达 → 同步失败 → 建立 favour-sync-retry alarm（退避 1 分钟）
// 2. 目标恢复 → 变更触发同步成功 → alarm 清除、计数清零
// 3. 推空列表 → 服务端 409 拒绝 → 扩展如实记录失败并再次排重试

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(HERE, '..');
const SERVER = path.resolve(HERE, '..', '..', 'favour-sync', 'server.mjs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9331;
const TOKEN = 'e2e-token';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // 还没就绪
    }
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new Cdp(ws);
  }

  evaluate(expression) {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
    return promise.then((result) => {
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result.exceptionDetails));
      }
      return result.result.value;
    });
  }

  close() {
    this.ws.close();
  }
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'favour-e2e-data-'));
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'favour-e2e-profile-'));
const serverPort = await freePort();
const server = spawn(process.execPath, [SERVER], {
  env: {
    ...process.env,
    PORT: String(serverPort),
    HOST: '127.0.0.1',
    FAVOUR_SYNC_DIR: dataDir,
    FAVOUR_TOKEN: TOKEN,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });

const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  `--user-data-dir=${profileDir}`,
  `--load-extension=${PLUGIN_DIR}`,
  `--remote-debugging-port=${CDP_PORT}`,
  'about:blank',
], { stdio: 'ignore' });

let cdp;
try {
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${serverPort}/api/health`);
    return response.status === 200;
  }, 8000, 'sync server');

  // Edge 自带的组件扩展（如 Gemini in Chrome）也有 background.js 的 SW，只能按 manifest 名字认
  cdp = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const list = await response.json();
    const workers = list.filter((entry) => entry.type === 'service_worker' && entry.url.startsWith('chrome-extension://'));
    for (const entry of workers) {
      const probe = await Cdp.connect(entry.webSocketDebuggerUrl);
      const name = await probe.evaluate(`chrome.runtime.getManifest?.().name ?? ''`).catch(() => '');
      if (String(name).includes('Favour')) {
        console.log('extension target:', entry.url);
        return probe;
      }
      probe.close();
    }
    return null;
  }, 20000, 'Favour service worker');

  // ---- 1. 不可达目标：失败后要排重试 ----
  await cdp.evaluate(`chrome.storage.local.set({
    syncTargets: [{ id: 'dead', name: '不可达', url: 'http://127.0.0.1:1', token: 'x' }],
    items: [{ id: 'e2e-1', url: 'https://example.com/1', title: 'e2e', updatedAt: Date.now() }],
  })`);
  const failed = await waitFor(async () => {
    const state = await cdp.evaluate(`(async () => {
      const { syncStatus, syncRetryAttempts } = await chrome.storage.local.get(['syncStatus', 'syncRetryAttempts']);
      const alarms = await chrome.alarms.getAll();
      return { syncStatus, syncRetryAttempts, alarms };
    })()`);
    return state.syncStatus && state.syncStatus.ok === false && state.alarms.some((a) => a.name === 'favour-sync-retry')
      ? state
      : null;
  }, 15000, 'failed sync + retry alarm');
  console.log('PASS 1: 失败后建立重试 alarm, attempts =', failed.syncRetryAttempts,
    ', 下次触发约', Math.round((failed.alarms.find((a) => a.name === 'favour-sync-retry').scheduledTime - Date.now()) / 1000), '秒后');

  // ---- 2. 目标恢复：成功后清除重试 ----
  await cdp.evaluate(`chrome.storage.local.set({
    syncTargets: [{ id: 'live', name: '临时服务', url: 'http://127.0.0.1:${serverPort}', token: '${TOKEN}' }],
    items: [{ id: 'e2e-1', url: 'https://example.com/1', title: 'e2e v2', updatedAt: Date.now() }],
  })`);
  const succeeded = await waitFor(async () => {
    const state = await cdp.evaluate(`(async () => {
      const { syncStatus, syncRetryAttempts } = await chrome.storage.local.get(['syncStatus', 'syncRetryAttempts']);
      const alarms = await chrome.alarms.getAll();
      return { syncStatus, syncRetryAttempts, alarms };
    })()`);
    return state.syncStatus && state.syncStatus.ok === true && !state.alarms.some((a) => a.name === 'favour-sync-retry') ? state : null;
  }, 15000, 'successful sync + cleared alarm');
  console.log('PASS 2: 成功后 alarm 清除, attempts =', succeeded.syncRetryAttempts ?? '(已清零)');

  const stored = await fetch(`http://127.0.0.1:${serverPort}/api/items`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  }).then((response) => response.json());
  if (stored.items.length !== 1 || stored.items[0].title !== 'e2e v2') {
    throw new Error('服务端收到的数据不对: ' + JSON.stringify(stored));
  }
  console.log('PASS 2b: 服务端确实收到推送');

  // ---- 3. 空列表被服务端拒绝，扩展记录失败并重新排重试 ----
  await cdp.evaluate(`chrome.storage.local.set({ items: [] })`);
  const rejected = await waitFor(async () => {
    const state = await cdp.evaluate(`(async () => {
      const { syncStatus } = await chrome.storage.local.get('syncStatus');
      const alarms = await chrome.alarms.getAll();
      return { syncStatus, alarms };
    })()`);
    return state.syncStatus && state.syncStatus.ok === false && /拒绝用空列表覆盖/.test(state.syncStatus.error || '')
      ? state
      : null;
  }, 15000, 'empty push rejected');
  console.log('PASS 3: 空覆盖被 409 拒绝，错误已回传:', rejected.syncStatus.error);
  const kept = await fetch(`http://127.0.0.1:${serverPort}/api/items`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  }).then((response) => response.json());
  if (kept.items.length !== 1) throw new Error('空推送竟然覆盖了数据');
  console.log('PASS 3b: 服务端数据未被清空');

  console.log('e2e-sync-retry: all passed');
} catch (error) {
  console.error('E2E FAILED:', error.message || error);
  console.error('--- server log ---\n' + serverLog);
  process.exitCode = 1;
} finally {
  if (cdp) cdp.close();
  // Edge 会把自己挂到别的父进程下，taskkill /T 杀不干净；按本次唯一的 profile 路径匹配命令行
  const profileTag = path.basename(profileDir);
  spawnSync('powershell', [
    '-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profileTag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
  ]);
  server.kill();
  // 给进程一点退出时间再删目录（Windows 文件占用）；删不掉就留给系统清理
  await sleep(1500);
  for (const dir of [dataDir, profileDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    } catch {
      console.log('(临时目录未删净，可忽略:', dir, ')');
    }
  }
}