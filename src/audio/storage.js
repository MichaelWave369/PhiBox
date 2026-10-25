const DB_NAME = 'phibox-samples-v1';
const STORE = 'pads';
const CHOPS = 'chopSources';
const LOOPS = 'loopTakes';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'index' });
      if (!db.objectStoreNames.contains(CHOPS)) db.createObjectStore(CHOPS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(LOOPS)) db.createObjectStore(LOOPS, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function transact(mode, action, storeName = STORE) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = action(tx.objectStore(storeName));
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

// The original file is stored ONCE per SHA-256 rather than cloned into sixteen pad records.
export const saveChopSource = (id, name, file) =>
  transact('readwrite', store => store.put({ id, name, file }), CHOPS);
export const getChopSources = () => transact('readonly', store => store.getAll(), CHOPS);


// PCM loop takes remain in IndexedDB. Project JSON contains metadata only, never raw audio.
export const saveLoopTake = (id, bpm, bars, sampleRate, left, right) =>
  transact('readwrite', store => store.put({
    id, bpm, bars, sampleRate, left, right, savedAt:Date.now()
  }), LOOPS);
export const getLoopTakes = () => transact('readonly',store => store.getAll(),LOOPS);
export const deleteLoopTake = id => transact('readwrite',store => store.delete(id),LOOPS);
