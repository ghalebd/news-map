/* ============================================================
   ASSETS3D — binary store for 3D GLB models (IndexedDB).
   GLB files are far too large for localStorage, so the binary
   lives here keyed by model id; only lightweight metadata
   (name, lat/lng, scale, rotation…) goes in the synced Store.
   IndexedDB is per-origin, so BOTH windows (control + presenter)
   read the same blobs — no extra transfer needed.
   API (window.Assets3D):
     put(id, blob|arrayBuffer) -> Promise
     get(id)  -> Promise<Blob|null>
     url(id)  -> Promise<objectURL|null>   (cached per window)
     del(id)  -> Promise
     keys()   -> Promise<string[]>
   ============================================================ */
(() => {
  const DB = 'newsmap.assets3d', STORE = 'glb', VER = 1;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode) { return open().then(db => db.transaction(STORE, mode).objectStore(STORE)); }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const urlCache = new Map();   // id -> objectURL (per window)

  async function put(id, data) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'model/gltf-binary' });
    const store = await tx('readwrite'); await req(store.put(blob, id));
    if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
    return id;
  }
  async function get(id) { const store = await tx('readonly'); return (await req(store.get(id))) || null; }
  async function url(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const blob = await get(id); if (!blob) return null;
    const u = URL.createObjectURL(blob); urlCache.set(id, u); return u;
  }
  async function del(id) {
    const store = await tx('readwrite'); await req(store.delete(id));
    if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
  }
  async function keys() { const store = await tx('readonly'); return (await req(store.getAllKeys())).map(String); }
  // drop this window's cached object URL without deleting the blob (used when the
  // OTHER window deleted a model — frees the URL locally; the blob is already gone)
  function revoke(id) { if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); } }

  window.Assets3D = { put, get, url, del, keys, revoke };
})();
