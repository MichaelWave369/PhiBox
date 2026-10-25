const DB_NAME = 'phibox-samples-v1';
const STORE = 'pads';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'index' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function transact(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const storeSample = (index, name, file) =>
  transact('readwrite', store => store.put({ index, name, file }));

export const getSamples = () => transact('readonly', store => store.getAll());

export const removeSample = index => transact('readwrite', store => store.delete(index));

export const clearSamples = () => transact('readwrite', store => store.clear());
