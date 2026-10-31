import { toast } from './dom.js';
import { local, normalizeActressMeta, state } from './store.js';
import { render } from './views.js';

async function saveActressMeta(meta) {
  state.actressMeta = normalizeActressMeta(meta);
  try {
    await local.set({ actressMeta: state.actressMeta });
  } catch (error) {
    toast('保存演员信息失败：' + (error && error.message ? error.message : '未知错误'), { tone: 'error' });
  }
  render();
}

export async function toggleActressFavorite(key) {
  const current = state.actressMeta[key] || { favorite: false, order: 0 };
  await saveActressMeta({
    ...state.actressMeta,
    [key]: { ...current, favorite: !current.favorite },
  });
  toast(current.favorite ? '已取消喜爱演员' : '已设为喜爱演员');
}

export async function setActressOrder(key, raw) {
  const parsed = Math.trunc(Number(raw));
  const order = Number.isFinite(parsed) ? Math.max(0, Math.min(9999, parsed)) : 0;
  const current = state.actressMeta[key] || { favorite: false, order: 0 };
  if (current.order === order) return;
  await saveActressMeta({
    ...state.actressMeta,
    [key]: { ...current, order },
  });
  toast('排序值已更新');
}
