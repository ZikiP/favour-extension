import { originPattern, toast } from './dom.js';
import { session, state } from './store.js';
import { isAllowed } from '../shared/url-rules.js';
import { openEditor } from './editor.js';
import { openSettings } from './dialogs.js';

export async function maybeShowBlocked() {
  let data;
  try {
    data = await session.get('pendingBlocked');
  } catch {
    return;
  }
  if (!data.pendingBlocked) return;
  await session.remove('pendingBlocked');
  handleBlocked(data.pendingBlocked);
}

export function handleBlocked(blocked) {
  if (!blocked) return;
  if (blocked.reason === 'unsupported-page') {
    toast('当前页面不支持收藏（仅支持 http / https 网页）');
  } else {
    showRangeToast(!state.rules.length);
  }
}

export function showRangeToast(empty) {
  toast(empty ? '尚未配置收藏范围，先添加允许收藏的网站' : '此页面不在收藏范围内', {
    label: '去配置',
    onAction: openSettings,
    duration: 7000,
  });
}

export function onAddCurrent() {
  if (!state.rules.length) {
    showRangeToast(true);
    return;
  }

  const lastTab = state.lastTab;
  if (!lastTab || !/^https?:\/\//i.test(lastTab.url)) {
    openEditor();
    return;
  }

  if (!isAllowed(lastTab.url, state.rules)) {
    showRangeToast(false);
    return;
  }

  const rule = state.parserRules.find((entry) => isAllowed(lastTab.url, entry.matches));
  const origin = rule ? originPattern(lastTab.url) : '';

  if (!origin || !chrome.permissions) {
    openEditor({ prefill: lastTab });
    return;
  }

  chrome.permissions
    .request({ origins: [origin] })
    .then(async (granted) => {
      if (!granted) {
        openEditor({ prefill: lastTab });
        return;
      }
      let parsed = null;
      try {
        parsed = await chrome.runtime.sendMessage({ type: 'favour.parse-url', url: lastTab.url });
      } catch {
        parsed = null;
      }
      openEditor({ prefill: lastTab, parsed });
    })
    .catch(() => openEditor({ prefill: lastTab }));
}
