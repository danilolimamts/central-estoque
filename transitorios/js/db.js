/* ============================================================
   Gestão de Transitórios — Camada IndexedDB
   100% client-side. Nenhum servidor, nenhuma API.

   Camada genérica (abrir/ler/gravar/limpar) + o store de
   preferências, que já é usado pelo shell do app. Os stores de
   domínio (registros de transitório, tratativas, metadados de
   importação) entram junto com a regra de negócio — ao adicionar
   um store novo, suba TR_DB_VERSION e crie-o em onupgradeneeded.
   ============================================================ */
const TR_DB_NAME = 'transitorios_v1';
const TR_DB_VERSION = 1;

const TR_STORES = {
  config: 'config' // preferências do app (tema, zoom, filtros salvos)
};

function trOpenDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(TR_DB_NAME, TR_DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains(TR_STORES.config)){
        db.createObjectStore(TR_STORES.config, {keyPath:'key'});
      }
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}

let _trDbPromise = null;
function trDB(){
  if(!_trDbPromise) _trDbPromise = trOpenDB();
  return _trDbPromise;
}
async function trTx(storeName, mode){
  const db = await trDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

/* ---------- Operações genéricas ---------- */
async function trPut(storeKey, row){
  const store = await trTx(storeKey, 'readwrite');
  return new Promise((resolve, reject)=>{
    const req = store.put(row);
    req.onsuccess = ()=>resolve();
    req.onerror = ()=>reject(req.error);
  });
}
async function trBulkPut(storeKey, rows){
  const store = await trTx(storeKey, 'readwrite');
  return new Promise((resolve, reject)=>{
    rows.forEach(r=>store.put(r));
    const tx = store.transaction;
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
async function trGet(storeKey, key){
  const store = await trTx(storeKey, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.get(key);
    req.onsuccess = ()=>resolve(req.result||null);
    req.onerror = ()=>reject(req.error);
  });
}
async function trGetAll(storeKey){
  const store = await trTx(storeKey, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.getAll();
    req.onsuccess = ()=>resolve(req.result||[]);
    req.onerror = ()=>reject(req.error);
  });
}
async function trDelete(storeKey, key){
  const store = await trTx(storeKey, 'readwrite');
  return new Promise((resolve, reject)=>{
    const req = store.delete(key);
    req.onsuccess = ()=>resolve();
    req.onerror = ()=>reject(req.error);
  });
}
async function trClearStore(storeKey){
  const store = await trTx(storeKey, 'readwrite');
  return new Promise((resolve, reject)=>{
    const req = store.clear();
    req.onsuccess = ()=>resolve();
    req.onerror = ()=>reject(req.error);
  });
}
/* Percorre um índice e devolve todas as linhas com aquele valor —
   usado pelas telas que filtram por base importada, local ou status. */
async function trGetAllByIndex(storeKey, indexName, value){
  const store = await trTx(storeKey, 'readonly');
  return new Promise((resolve, reject)=>{
    const idx = store.index(indexName);
    const out = [];
    const req = idx.openCursor(IDBKeyRange.only(value));
    req.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(cursor){ out.push(cursor.value); cursor.continue(); }
      else resolve(out);
    };
    req.onerror = ()=>reject(req.error);
  });
}

/* ---------- Preferências ---------- */
async function trGetConfig(key){
  const row = await trGet(TR_STORES.config, key);
  return row ? row.value : null;
}
async function trSaveConfig(key, value){
  return trPut(TR_STORES.config, {key, value});
}
