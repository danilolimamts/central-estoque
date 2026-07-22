/* ============================================================
   Inventário Rotativo — Camada IndexedDB
   100% client-side. Nenhum servidor, nenhuma API.
   ============================================================ */
const IR_DB_NAME = 'inventario_rotativo_v1';
const IR_DB_VERSION = 1;

const IR_STORES = {
  ciclos: 'ciclos',
  locais: 'locais_congelados',
  contagens: 'contagens',
  divergencias: 'divergencias',
  indicadores: 'indicadores',
  prioridadeConfig: 'prioridade_config',
  importMeta: 'import_meta'
};

function irOpenDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(IR_DB_NAME, IR_DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains(IR_STORES.ciclos)){
        db.createObjectStore(IR_STORES.ciclos, {keyPath:'id'});
      }
      if(!db.objectStoreNames.contains(IR_STORES.locais)){
        const s = db.createObjectStore(IR_STORES.locais, {keyPath:'id'});
        s.createIndex('cicloId', 'cicloId', {unique:false});
      }
      if(!db.objectStoreNames.contains(IR_STORES.contagens)){
        const s = db.createObjectStore(IR_STORES.contagens, {keyPath:'id'});
        s.createIndex('cicloId', 'cicloId', {unique:false});
        s.createIndex('local', 'local', {unique:false});
        s.createIndex('item', 'item', {unique:false});
        s.createIndex('usuario', 'usuario', {unique:false});
      }
      if(!db.objectStoreNames.contains(IR_STORES.divergencias)){
        const s = db.createObjectStore(IR_STORES.divergencias, {keyPath:'id'});
        s.createIndex('cicloId', 'cicloId', {unique:false});
        s.createIndex('diagnostico', 'diagnostico', {unique:false});
        s.createIndex('item', 'item', {unique:false});
      }
      if(!db.objectStoreNames.contains(IR_STORES.indicadores)){
        db.createObjectStore(IR_STORES.indicadores, {keyPath:'cicloId'});
      }
      if(!db.objectStoreNames.contains(IR_STORES.prioridadeConfig)){
        db.createObjectStore(IR_STORES.prioridadeConfig, {keyPath:'key'});
      }
      if(!db.objectStoreNames.contains(IR_STORES.importMeta)){
        db.createObjectStore(IR_STORES.importMeta, {keyPath:'cicloId'});
      }
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}

let _irDbPromise = null;
function irDB(){
  if(!_irDbPromise) _irDbPromise = irOpenDB();
  return _irDbPromise;
}
async function irTx(storeName, mode){
  const db = await irDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

/* ---------- Ciclos ---------- */
async function irSaveCiclo(ciclo){
  const store = await irTx(IR_STORES.ciclos, 'readwrite');
  return new Promise((resolve, reject)=>{
    const req = store.put(ciclo);
    req.onsuccess = ()=>resolve();
    req.onerror = ()=>reject(req.error);
  });
}
async function irGetAllCiclos(){
  const store = await irTx(IR_STORES.ciclos, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.getAll();
    req.onsuccess = ()=>resolve((req.result||[]).sort((a,b)=>b.numero-a.numero));
    req.onerror = ()=>reject(req.error);
  });
}
async function irGetCiclo(id){
  const store = await irTx(IR_STORES.ciclos, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.get(id);
    req.onsuccess = ()=>resolve(req.result||null);
    req.onerror = ()=>reject(req.error);
  });
}

/* ---------- Locais congelados ---------- */
async function irClearCiclo(storeKey, cicloId){
  const store = await irTx(storeKey, 'readwrite');
  return new Promise((resolve, reject)=>{
    const idx = store.index('cicloId');
    const req = idx.openCursor(IDBKeyRange.only(cicloId));
    req.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(cursor){ cursor.delete(); cursor.continue(); }
    };
    const tx = store.transaction;
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
async function irBulkPut(storeKey, rows){
  const store = await irTx(storeKey, 'readwrite');
  return new Promise((resolve, reject)=>{
    rows.forEach(r=>store.put(r));
    const tx = store.transaction;
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
async function irGetByCiclo(storeKey, cicloId){
  const store = await irTx(storeKey, 'readonly');
  return new Promise((resolve, reject)=>{
    const idx = store.index('cicloId');
    const out = [];
    const req = idx.openCursor(IDBKeyRange.only(cicloId));
    req.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(cursor){ out.push(cursor.value); cursor.continue(); }
      else resolve(out);
    };
    req.onerror = ()=>reject(req.error);
  });
}
async function irGetAllByIndex(storeKey, indexName, value){
  const store = await irTx(storeKey, 'readonly');
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

/* ---------- Indicadores ---------- */
async function irSaveIndicadores(cicloId, data){
  const store = await irTx(IR_STORES.indicadores, 'readwrite');
  return new Promise((resolve, reject)=>{
    const req = store.put({cicloId, ...data});
    req.onsuccess = ()=>resolve();
    req.onerror = ()=>reject(req.error);
  });
}
async function irGetIndicadores(cicloId){
  const store = await irTx(IR_STORES.indicadores, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.get(cicloId);
    req.onsuccess = ()=>resolve(req.result||null);
    req.onerror = ()=>reject(req.error);
  });
}

/* ---------- Prioridade config ---------- */
async function irGetPrioridadeConfig(){
  const store = await irTx(IR_STORES.prioridadeConfig, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.get('pesos');
    req.onsuccess = ()=>resolve(req.result || null);
    req.onerror = ()=>reject(req.error);
  });
}
async function irSavePrioridadeConfig(pesos){
  const store = await irTx(IR_STORES.prioridadeConfig, 'readwrite');
  return new Promise((resolve, reject)=>{
    const req = store.put({key:'pesos', ...pesos});
    req.onsuccess = ()=>resolve();
    req.onerror = ()=>reject(req.error);
  });
}
async function irSeedPrioridadeConfigIfEmpty(){
  const existing = await irGetPrioridadeConfig();
  if(existing) return existing;
  const seed = {key:'pesos', valor:0.50, quantidade:0.20, recontagens:0.15, reincidencia:0.15};
  await irSavePrioridadeConfig(seed);
  return seed;
}

/* ---------- Import meta ---------- */
async function irSaveImportMeta(cicloId, meta){
  const store = await irTx(IR_STORES.importMeta, 'readwrite');
  return new Promise((resolve, reject)=>{
    const req = store.put({cicloId, ...meta, processedAt: new Date().toISOString()});
    req.onsuccess = ()=>resolve();
    req.onerror = ()=>reject(req.error);
  });
}
async function irGetImportMeta(cicloId){
  const store = await irTx(IR_STORES.importMeta, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.get(cicloId);
    req.onsuccess = ()=>resolve(req.result||null);
    req.onerror = ()=>reject(req.error);
  });
}
