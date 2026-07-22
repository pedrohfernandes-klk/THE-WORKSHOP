const DB_NAME = 'the-workshop-garden-studies';
const STORE_NAME = 'studies';

const roomLabels = {
  maze: 'Experiment Garden',
  hall: 'Hall',
  studio: 'The Studio',
  thinking: 'Thinking Room',
  maps: 'Many Maps',
  outdoor: 'The Grove'
};

function finiteVector(vector) {
  const value = vector || {};
  return {
    x: Number.isFinite(value.x) ? value.x : 0,
    y: Number.isFinite(value.y) ? value.y : 0,
    z: Number.isFinite(value.z) ? value.z : 0
  };
}

export function normalizeGardenStudy(input = {}, now = () => new Date().toISOString(), createId = () => `garden-study-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
  if (!String(input.imageDataUrl || '').startsWith('data:image/')) {
    throw new TypeError('Garden Study requires a captured image');
  }
  const camera = input.camera || {};
  return {
    id: String(input.id || createId()),
    imageDataUrl: String(input.imageDataUrl),
    room: String(input.room || 'unknown'),
    capturedAt: String(input.capturedAt || now()),
    camera: {
      position: finiteVector(camera.position),
      direction: finiteVector(camera.direction)
    },
    title: String(input.title || ''),
    notes: String(input.notes || ''),
    showCaption: input.showCaption !== false
  };
}

export function formatGardenStudyCaption(study = {}) {
  const room = roomLabels[study.room] || String(study.room || 'Workshop');
  const captured = new Date(study.capturedAt);
  if (Number.isNaN(captured.valueOf())) return room;
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(captured).replace(',', '');
  return `${room} · ${date}`;
}

export function createGardenStudyStore(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) throw new Error('Garden Study storage is unavailable');
  let database;
  const open = () => database ? Promise.resolve(database) : new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => { database = request.result; resolve(database); };
    request.onerror = () => reject(request.error);
  });
  const request = (mode, run) => open().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const result = run(transaction.objectStore(STORE_NAME));
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error);
  }));
  return {
    put: study => request('readwrite', store => store.put(normalizeGardenStudy(study))),
    get: id => request('readonly', store => store.get(id)),
    list: () => request('readonly', store => store.getAll()).then(studies => studies.sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))),
    remove: id => request('readwrite', store => store.delete(id))
  };
}
