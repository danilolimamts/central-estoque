/* ============================================================
   Auditoria de Divergências de Inventário — Camada IndexedDB
   100% client-side. Nenhuma chamada de rede, nenhum servidor.
   ============================================================ */
const AUD_DB_NAME = 'auditoria_divergencias_v1';
const AUD_DB_VERSION = 1;

const AUD_STORES = {
  netConfig: 'net_config',          // regras da legenda -> considerar NET
  divergencias: 'divergencias',     // base tratada + diagnóstico (uma linha por divergência)
  indicadores: 'indicadores',       // snapshot de KPIs por importação/ano
  importMeta: 'import_meta'         // metadados de cada processamento (arquivos, datas, contagens)
};

function audOpenDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(AUD_DB_NAME, AUD_DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains(AUD_STORES.netConfig)){
        db.createObjectStore(AUD_STORES.netConfig, {keyPath:'cod'});
      }
      if(!db.objectStoreNames.contains(AUD_STORES.divergencias)){
        const s = db.createObjectStore(AUD_STORES.divergencias, {keyPath:'id'});
        s.createIndex('ano', 'ano', {unique:false});
        s.createIndex('necessitaValidacao', 'necessitaValidacao', {unique:false});
        s.createIndex('diagnostico', 'diagnostico', {unique:false});
        s.createIndex('inventario', 'inventario', {unique:false});
        s.createIndex('item', 'item', {unique:false});
        s.createIndex('usuario', 'usuario', {unique:false});
        s.createIndex('codLegenda', 'codLegenda', {unique:false});
        s.createIndex('considerarNet', 'considerarNet', {unique:false});
      }
      if(!db.objectStoreNames.contains(AUD_STORES.indicadores)){
        db.createObjectStore(AUD_STORES.indicadores, {keyPath:'ano'});
      }
      if(!db.objectStoreNames.contains(AUD_STORES.importMeta)){
        db.createObjectStore(AUD_STORES.importMeta, {keyPath:'ano'});
      }
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}

let _audDbPromise = null;
function audDB(){
  if(!_audDbPromise) _audDbPromise = audOpenDB();
  return _audDbPromise;
}

async function audTx(storeName, mode){
  const db = await audDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

/* ---------- NET config ---------- */
async function audGetNetConfig(){
  const db = await audDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(AUD_STORES.netConfig, 'readonly');
    const store = tx.objectStore(AUD_STORES.netConfig);
    const req = store.getAll();
    req.onsuccess = ()=>resolve(req.result || []);
    req.onerror = ()=>reject(req.error);
  });
}
async function audSaveNetConfig(rows){
  const db = await audDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(AUD_STORES.netConfig, 'readwrite');
    const store = tx.objectStore(AUD_STORES.netConfig);
    rows.forEach(r=>store.put(r));
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
async function audSeedNetConfigIfEmpty(){
  const existing = await audGetNetConfig();
  if(existing.length) return existing;
  await audSaveNetConfig(AUD_NET_SEED);
  return AUD_NET_SEED.slice();
}

const AUD_NET_SEED = [
  {cod:'AIR', descricao:'Ajuste Inventário Rotativo', net:true},
  {cod:'AEE', descricao:'Ajuste Estoque Encontrado', net:true},
  {cod:'AIN', descricao:'Ajuste Inventário Negativo / Não Localizado', net:true},
  {cod:'AIC', descricao:'Ajuste Inventário Curva de Estoque', net:true},
  {cod:'ADE', descricao:'Ajuste Auditoria de Estoque', net:true},
  {cod:'TID', descricao:'Troca de Identidade', net:true},
  {cod:'INV', descricao:'Ajuste Recebimento Invertido', net:true},
  {cod:'AII', descricao:'Ajuste Inventário Insumos', net:false},
  {cod:'AIT', descricao:'Ajuste Inventário (transitório)', net:false},
  {cod:'ALI', descricao:'(revisar)', net:false},
  {cod:'ANF', descricao:'Ajuste Nota Fiscal', net:false},
  {cod:'BAI', descricao:'Baixa Expedição', net:false},
  {cod:'BSL', descricao:'Ajuste Bseller', net:false},
  {cod:'EMB', descricao:'Embalagem', net:false},
  {cod:'ESC', descricao:'(revisar)', net:false},
  {cod:'IMP', descricao:'(revisar)', net:false},
  {cod:'INP', descricao:'Inventário Pallets', net:false},
  {cod:'INS', descricao:'Baixa Insumo', net:false},
  {cod:'LIT', descricao:'(revisar)', net:false},
  {cod:'LMP', descricao:'(revisar)', net:false},
  {cod:'NV', descricao:'(revisar)', net:false},
  {cod:'TES', descricao:'Teste', net:false}
].map(r=>({...r, origem:'semente', revisar:/revisar/i.test(r.descricao)}));

/* ---------- Divergências (bulk write, cursor read) ---------- */
async function audClearAno(ano){
  const db = await audDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(AUD_STORES.divergencias, 'readwrite');
    const store = tx.objectStore(AUD_STORES.divergencias);
    const idx = store.index('ano');
    const req = idx.openCursor(IDBKeyRange.only(ano));
    req.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(cursor){ cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
async function audBulkPutDivergencias(rows){
  const db = await audDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(AUD_STORES.divergencias, 'readwrite');
    const store = tx.objectStore(AUD_STORES.divergencias);
    rows.forEach(r=>store.put(r));
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
async function audCountDivergencias(){
  const store = await audTx(AUD_STORES.divergencias, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.count();
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
async function audGetAllDivergencias(limitN){
  const store = await audTx(AUD_STORES.divergencias, 'readonly');
  return new Promise((resolve, reject)=>{
    const out = [];
    const req = store.openCursor();
    req.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(cursor && (!limitN || out.length < limitN)){
        out.push(cursor.value);
        cursor.continue();
      } else resolve(out);
    };
    req.onerror = ()=>reject(req.error);
  });
}

async function audGetDivergenciasByAno(ano){
  const store = await audTx(AUD_STORES.divergencias, 'readonly');
  return new Promise((resolve, reject)=>{
    const idx = store.index('ano');
    const out = [];
    const req = idx.openCursor(IDBKeyRange.only(ano));
    req.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(cursor){ out.push(cursor.value); cursor.continue(); }
      else resolve(out);
    };
    req.onerror = ()=>reject(req.error);
  });
}

/* ---------- Indicadores ---------- */
async function audSaveIndicadores(ano, data){
  const store = await audTx(AUD_STORES.indicadores, 'readwrite');
  return new Promise((resolve, reject)=>{
    const req = store.put({ano, ...data});
    req.onsuccess = ()=>resolve();
    req.onerror = ()=>reject(req.error);
  });
}
async function audGetIndicadores(ano){
  const store = await audTx(AUD_STORES.indicadores, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.get(ano);
    req.onsuccess = ()=>resolve(req.result || null);
    req.onerror = ()=>reject(req.error);
  });
}

/* ---------- Import meta ---------- */
async function audSaveImportMeta(ano, meta){
  const store = await audTx(AUD_STORES.importMeta, 'readwrite');
  return new Promise((resolve, reject)=>{
    const req = store.put({ano, ...meta, processedAt: new Date().toISOString()});
    req.onsuccess = ()=>resolve();
    req.onerror = ()=>reject(req.error);
  });
}
async function audGetImportMeta(ano){
  const store = await audTx(AUD_STORES.importMeta, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.get(ano);
    req.onsuccess = ()=>resolve(req.result || null);
    req.onerror = ()=>reject(req.error);
  });
}
async function audGetAllImportMeta(){
  const store = await audTx(AUD_STORES.importMeta, 'readonly');
  return new Promise((resolve, reject)=>{
    const req = store.getAll();
    req.onsuccess = ()=>resolve(req.result || []);
    req.onerror = ()=>reject(req.error);
  });
}
