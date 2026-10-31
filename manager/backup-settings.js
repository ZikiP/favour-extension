import { els, toast } from './dom.js';
import { local, state } from './store.js';
import {
  clearFolderHandle,
  folderPermission,
  loadFolderHandle,
  saveFolderHandle,
  writeBackupFile,
} from '../shared/backup-folder.js';

export async function openBackupDialog() {
  await renderBackupDialog();
  if (!els.backupDialog.open) els.backupDialog.showModal();
}

async function renderBackupDialog() {
  clearError();
  const handle = await loadFolderHandle();
  const permission = await folderPermission(handle);
  const { backupMeta } = await local.get('backupMeta');
  const meta = backupMeta && typeof backupMeta === 'object' ? backupMeta : null;

  if (handle) {
    els.backupFolderName.textContent =
      permission === 'granted' ? handle.name : `${handle.name}（需要重新授权）`;
    els.backupFolderName.title = handle.name;
  } else {
    els.backupFolderName.textContent = '未选择（保存到 下载/Favour）';
    els.backupFolderName.title = '';
  }
  els.clearFolderBtn.hidden = !handle;

  if (!meta || !meta.at) {
    els.backupStatus.textContent = '还没有自动备份记录';
    return;
  }
  const place = meta.where === 'folder'
    ? `文件夹「${meta.folder || (handle && handle.name) || ''}」`
    : '下载/Favour';
  const fallback = meta.fallback === 'permission' ? '（文件夹不可用，已退回下载）' : '';
  els.backupStatus.textContent = `上次备份：${formatTime(meta.at)} · ${place}${fallback}`;
}

export async function chooseBackupFolder() {
  clearError();
  if (typeof window.showDirectoryPicker !== 'function') {
    showError('当前浏览器不支持选择文件夹');
    return;
  }

  let handle;
  try {
    handle = await window.showDirectoryPicker({ id: 'favour-backup', mode: 'readwrite' });
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    showError('无法选择文件夹：' + (error && error.message ? error.message : '未知错误'));
    return;
  }

  let permission;
  try {
    permission = await handle.requestPermission({ mode: 'readwrite' });
  } catch {
    permission = await folderPermission(handle);
  }
  if (permission !== 'granted') {
    showError('没有获得文件夹读写权限，定时备份会退回下载目录');
    return;
  }

  await saveFolderHandle(handle);
  await renderBackupDialog();
  toast(`自动备份将保存到「${handle.name}」`);
}

export async function clearBackupFolder() {
  await clearFolderHandle();
  await renderBackupDialog();
  toast('已清除备份文件夹，将保存到下载目录');
}

export async function backupNow() {
  clearError();
  const handle = await loadFolderHandle();
  if (!handle) {
    toast('还没有选择文件夹；可用「导出备份」保存到下载目录', { tone: 'error' });
    return;
  }

  let permission = await folderPermission(handle);
  if (permission !== 'granted') {
    try {
      permission = await handle.requestPermission({ mode: 'readwrite' });
    } catch {
      permission = 'denied';
    }
  }
  if (permission !== 'granted') {
    showError('文件夹权限已失效，请重新选择文件夹');
    return;
  }

  const json = JSON.stringify(backupPayload(), null, 2);
  const filename = `favour-backup-${dateStamp(new Date())}.json`;

  try {
    await writeBackupFile(handle, filename, json);
    await local.set({
      backupMeta: {
        at: Date.now(),
        file: filename,
        folder: handle.name,
        where: 'folder',
        bytes: json.length,
      },
    });
    await renderBackupDialog();
    toast(`已备份到「${handle.name}」`);
  } catch (error) {
    showError('备份失败：' + (error && error.message ? error.message : '未知错误'));
  }
}

function backupPayload() {
  return {
    app: 'favour',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    items: state.items,
    settings: { whitelist: state.rules },
    parserRules: state.parserRules,
    actressAvatars: state.actressAvatars,
    actressMeta: state.actressMeta,
  };
}

function dateStamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(at) {
  const date = new Date(at);
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function showError(message) {
  els.backupFolderError.textContent = message;
  els.backupFolderError.hidden = false;
}

function clearError() {
  els.backupFolderError.hidden = true;
}
