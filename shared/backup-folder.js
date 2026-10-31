const DB_NAME = 'favour-backup';
const DB_VERSION = 1;
const STORE = 'handles';
const KEY = 'folder';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const request = run(store);
      tx.oncomplete = () => resolve(request && 'result' in request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function saveFolderHandle(handle) {
  return withStore('readwrite', (store) => store.put(handle, KEY));
}

export function loadFolderHandle() {
  return withStore('readonly', (store) => store.get(KEY));
}

export function clearFolderHandle() {
  return withStore('readwrite', (store) => store.delete(KEY));
}

export async function folderPermission(handle) {
  if (!handle) return 'missing';
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'unknown';
  }
}

export async function writeBackupFile(handle, filename, text) {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
  return filename;
}
