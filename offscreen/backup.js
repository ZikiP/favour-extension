import { folderPermission, loadFolderHandle, writeBackupFile } from '../shared/backup-folder.js';

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (!message || message.type !== 'favour.backup-write') return undefined;

  (async () => {
    try {
      const handle = await loadFolderHandle();
      if (!handle) {
        respond({ ok: false, reason: 'none' });
        return;
      }
      const permission = await folderPermission(handle);
      if (permission !== 'granted') {
        respond({ ok: false, reason: 'permission', folder: handle.name });
        return;
      }
      await writeBackupFile(handle, message.filename, message.text);
      respond({ ok: true, folder: handle.name });
    } catch (error) {
      respond({
        ok: false,
        reason: 'write',
        error: error && error.message ? error.message : String(error),
      });
    }
  })();

  return true;
});
