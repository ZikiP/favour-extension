const ALARM_NAME = 'favour-backup';
const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;

export function setupBackupSchedule() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) runBackupIfDue().catch(() => {});
  });
  ensureAlarm().catch(() => {});
  runBackupIfDue().catch(() => {});
}

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, { delayInMinutes: 5, periodInMinutes: 24 * 60 });
  }
}

async function runBackupIfDue() {
  const { backupMeta } = await chrome.storage.local.get('backupMeta');
  const meta = backupMeta && typeof backupMeta === 'object' ? backupMeta : {};
  const lastSuccess = Number(meta.at) || 0;
  const lastFailure = Number(meta.failedAt) || 0;
  if (Date.now() - lastSuccess < 20 * 60 * 60 * 1000) return;
  if (Date.now() - lastFailure < RETRY_MS) return;
  await runBackup(meta);
}

async function runBackup(previous) {
  const data = await chrome.storage.local.get(['items', 'settings', 'parserRules', 'actressAvatars', 'actressMeta']);
  const payload = {
    app: 'favour',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    items: Array.isArray(data.items) ? data.items : [],
    settings: {
      whitelist: data.settings && Array.isArray(data.settings.whitelist) ? data.settings.whitelist : [],
    },
    parserRules: Array.isArray(data.parserRules) ? data.parserRules : [],
    actressAvatars: data.actressAvatars && typeof data.actressAvatars === 'object' ? data.actressAvatars : {},
    actressMeta: data.actressMeta && typeof data.actressMeta === 'object' ? data.actressMeta : {},
  };

  const json = JSON.stringify(payload, null, 2);
  const filename = `favour-backup-${dateStamp(new Date())}.json`;

  const folderResult = await writeToFolder(filename, json);
  if (folderResult && folderResult.ok) {
    await chrome.storage.local.set({
      backupMeta: {
        at: Date.now(),
        file: filename,
        folder: folderResult.folder || '',
        where: 'folder',
        bytes: json.length,
      },
    });
    return;
  }

  const downloadName = `Favour/${filename}`;
  const url = 'data:application/json;base64,' + toBase64(json);

  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename: downloadName,
      conflictAction: 'overwrite',
      saveAs: false,
    });
    await chrome.storage.local.set({
      backupMeta: {
        at: Date.now(),
        file: downloadName,
        where: 'downloads',
        downloadId,
        folder: folderResult && folderResult.folder ? folderResult.folder : '',
        fallback: folderResult && folderResult.reason ? folderResult.reason : '',
        bytes: json.length,
      },
    });
  } catch (error) {
    await chrome.storage.local.set({
      backupMeta: {
        at: Number(previous.at) || 0,
        file: downloadName,
        failedAt: Date.now(),
        error: error && error.message ? error.message : '自动备份失败',
      },
    });
  }
}

async function writeToFolder(filename, text) {
  if (!chrome.offscreen) return null;
  try {
    const hasDocument = typeof chrome.offscreen.hasDocument === 'function'
      ? await chrome.offscreen.hasDocument()
      : false;
    if (!hasDocument) {
      await chrome.offscreen.createDocument({
        url: 'offscreen/backup.html',
        reasons: ['BLOBS'],
        justification: '将定时备份写入用户选择的文件夹',
      });
    }
    return await chrome.runtime.sendMessage({ type: 'favour.backup-write', filename, text });
  } catch {
    return null;
  }
}

function dateStamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x4000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
