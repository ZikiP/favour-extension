// 弹窗守卫的行为自测：node tools/test-guard.mjs
//
// 守卫跑在页面主世界里，这里用一个最小的假页面把它跑起来，
// 检查各种「弹广告」的形态是不是真的被挡住了。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const guardSource = fs.readFileSync(path.join(here, '..', 'shared', 'popup-guard.js'), 'utf8');

function runGuard(config) {
  const listeners = [];
  class Element {}

  const ctx = {
    location: { origin: 'https://site.example', href: 'https://site.example/watch/1' },
    window: { open: () => 'opened' },
    document: { addEventListener: (_type, fn) => listeners.push(fn) },
    Element,
    URL,
    __favourGuardConfig: config,
  };
  ctx.globalThis = ctx;

  new Function(
    'globalThis',
    'location',
    'window',
    'document',
    'Element',
    'URL',
    guardSource,
  )(ctx, ctx.location, ctx.window, ctx.document, Element, URL);

  const click = (href, trusted) => {
    let prevented = false;
    const anchor = { getAttribute: () => href };
    const node = new Element();
    node.closest = () => anchor;
    for (const fn of listeners) {
      fn({
        isTrusted: trusted,
        target: node,
        preventDefault: () => {
          prevented = true;
        },
        stopImmediatePropagation: () => {},
      });
    }
    return prevented;
  };

  return { open: (url) => ctx.window.open(url), click, ctx };
}

const failures = [];

function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failures.push(`${name}（期望 ${expected}，实际 ${actual}）`);
}

console.log('— 配置了 popPath —');
{
  const g = runGuard({ popPath: '/pop', blockCrossOrigin: true, detectForeignUrlWrapper: true });
  check('同域广告跳板被拦', g.open('https://site.example/pop?url=https://ads.example/x') === null, true);
  check('跨域弹窗被拦', g.open('https://ads.example/x') === null, true);
  check('站内正常弹窗放行', g.open('https://site.example/player/2') === 'opened', true);
  check('脚本点跨域链接被拦', g.click('https://ads.example/deep', false) === true, true);
  check('用户点跨域链接放行', g.click('https://ads.example/deep', true) === false, true);
  check('用户点站内跳板被拦', g.click('/pop?url=https://ads.example/x', true) === true, true);
}

console.log('— 只有默认配置（没配 popPath）—');
{
  const g = runGuard({ popPath: '', blockCrossOrigin: true, detectForeignUrlWrapper: true });
  check(
    '同域广告跳板靠启发式拦掉',
    g.open('https://site.example/pop?url=https://ads.example/x') === null,
    true,
  );
  check('站内正常弹窗放行', g.open('https://site.example/player/2') === 'opened', true);
  check('同域正常带参数放行', g.open('https://site.example/watch?from=1') === 'opened', true);
  check('跨域弹窗被拦', g.open('https://ads.example/x') === null, true);
}

console.log('— 关掉启发式 —');
{
  const g = runGuard({ popPath: '', blockCrossOrigin: true, detectForeignUrlWrapper: false });
  check(
    '同域广告跳板不再拦',
    g.open('https://site.example/pop?url=https://ads.example/x') === 'opened',
    true,
  );
}

console.log('— 重复注入 —');
{
  const g = runGuard({ popPath: '/pop' });
  const before = g.ctx.window.open;
  new Function(
    'globalThis',
    'location',
    'window',
    'document',
    'Element',
    'URL',
    guardSource,
  )(g.ctx, g.ctx.location, g.ctx.window, g.ctx.document, class {}, URL);
  check('不会重复挂钩', g.ctx.window.open === before, true);
}

if (failures.length) {
  console.error(`\n${failures.length} 项未通过：`);
  for (const item of failures) console.error('  - ' + item);
  process.exit(1);
}
console.log('\n全部通过');
