/* ============================================================
   Inventário Rotativo — UI principal
   App independente: importação, ciclos, contagens, divergências,
   produtividade, auditoria inteligente, histórico, comparativo.
   100% client-side (SheetJS + Web Worker + IndexedDB).
   ============================================================ */
const IR = {
  currentTab:'dashboard',
  ciclos:[], cicloAtivo:null,
  indicadores:null, importMeta:null,
  prioridadeConfig:null,
  files:{f390:null, f843:[null,null,null,null], fCong:[null,null,null,null], f278:[null,null,null,null], f051:[null,null,null,null]},
  processing:false, progress:{stage:'', pct:0},
  divergencias:[], locais:[], contagens:[],
  divFilters:{search:'', local:''},
  auditFilters:{minPrioridade:0},
  prodFilters:{de:'', ate:''},
  dashFilters:{applyProdDate:true},
  compararA:null, compararB:null,
  novoCiclo:false,
  _porDiaRua:{},
  // Perdas e Ganhos (QRY410) — independente do ciclo, por ano.
  net410Anos:[], net410AnoSel:null, net410MesSel:null, net410Data:null, net410File:null,
  net410Processing:false, net410Progress:{stage:'', pct:0}
};

function irEsc(v){ if(v===undefined||v===null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function irFmtInt(n){ return Math.round(n||0).toLocaleString('pt-BR'); }
function irFmtNum(n, dec){ return (n||0).toLocaleString('pt-BR', {minimumFractionDigits:dec||0, maximumFractionDigits:dec===undefined?2:dec}); }
function irFmtMoney(n){ return (n||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
function irFmtPct(n){ return ((n||0)*100).toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1})+'%'; }
function irFmtDate(s){ if(!s) return '—'; const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR'); }
/* Ano do ciclo, derivado da data de abertura — usado pra não confundir
   "Ciclo 1" de anos diferentes (mesmo número, ciclos distintos). */
function irCicloAno(c){ const d = new Date(c.dataAbertura); return isNaN(d.getTime()) ? null : d.getFullYear(); }
function irCicloLabel(c){ const ano = irCicloAno(c); return `Ciclo ${c.numero}${ano?'/'+ano:''}`; }
function irShowToast(msg, isError){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast'+(isError?' error':'');
  clearTimeout(window.__irToastTimer);
  window.__irToastTimer = setTimeout(()=>{ t.className='toast hidden'; }, 2600);
}
function irEmptyState(title, desc, onclickFn, btnLabel){
  return `<div class="empty-state panel"><div class="eicon">📦</div><h3>${irEsc(title)}</h3><p>${irEsc(desc)}</p>
    ${onclickFn ? `<button class="btn btn-primary" onclick="${onclickFn}">${irEsc(btnLabel)}</button>` : ''}</div>`;
}

/* ============================================================
   INIT / TEMA / NAVEGAÇÃO
   ============================================================ */
async function irInit(){
  const savedTheme = localStorage.getItem('ir-theme');
  if(savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  const savedAppTheme = localStorage.getItem('ir-app-theme');
  if(savedAppTheme && savedAppTheme!=='padrao') document.documentElement.setAttribute('data-app-theme', savedAppTheme);
  irUpdateThemeLabel();
  irApplyZoom(parseInt(localStorage.getItem('ir-zoom'), 10) || 100);

  try{
    IR.prioridadeConfig = await irSeedPrioridadeConfigIfEmpty();
    IR.ciclos = await irGetAllCiclos();
    if(IR.ciclos.length){
      IR.cicloAtivo = IR.ciclos.find(c=>c.status==='aberto') || IR.ciclos[0];
      await irLoadCicloData(IR.cicloAtivo.id);
    }
    IR.net410Anos = await irGetAllNet410Anos();
    if(IR.net410Anos.length){
      IR.net410AnoSel = IR.net410Anos[0];
      IR.net410Data = await irGetNet410(IR.net410AnoSel);
      irSetNet410MesDefault();
    }
  }catch(e){ console.error('Falha ao iniciar', e); }
  irSwitchTab('dashboard');
}
async function irLoadCicloData(cicloId){
  IR.indicadores = await irGetIndicadores(cicloId);
  IR.importMeta = await irGetImportMeta(cicloId);
  IR.divergencias = await irGetByCiclo(IR_STORES.divergencias, cicloId);
  IR.locais = await irGetByCiclo(IR_STORES.locais, cicloId);
  IR.contagens = await irGetByCiclo(IR_STORES.contagens, cicloId);
}
const IR_MOBILE_QUERY = '(max-width:640px)'; // precisa bater com o breakpoint do CSS (theme.css)
// No mobile o menu é um overlay (aberto/fechado); no desktop é o modo compacto de 56px.
// Cada um usa sua própria classe pra não haver estado intermediário entre os dois.
function irToggleSidebar(){
  const el = document.getElementById('sidebar');
  if(matchMedia(IR_MOBILE_QUERY).matches) el.classList.toggle('mobile-open');
  else el.classList.toggle('collapsed');
}
function irCloseSidebarMobile(){
  if(matchMedia(IR_MOBILE_QUERY).matches) document.getElementById('sidebar').classList.remove('mobile-open');
}
function irToggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
  const next = cur==='dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ir-theme', next);
  irUpdateThemeLabel();
}
const IR_APP_THEMES = [
  {key:'padrao', label:'Padrão (Loja do Mecânico)', swatch:'linear-gradient(90deg,#001A72,#FA4616)'},
  {key:'aurora', label:'Aurora Glass', swatch:'linear-gradient(90deg,#4B3F9E,#12B4D6)'},
  {key:'ember', label:'Ember Flow', swatch:'linear-gradient(90deg,#241209,#FF6A00)'},
  {key:'carbon', label:'Carbon Red', swatch:'linear-gradient(90deg,#1A1A1C,#E0142C)'}
];
function irSetAppTheme(theme){
  if(theme==='padrao') document.documentElement.removeAttribute('data-app-theme');
  else document.documentElement.setAttribute('data-app-theme', theme);
  localStorage.setItem('ir-app-theme', theme);
  irRenderView();
}
function irUpdateThemeLabel(){
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
  const label = document.getElementById('themeToggleLabel');
  if(label) label.textContent = cur==='dark' ? 'Modo escuro' : 'Modo claro';
}
const IR_ZOOM_MIN = 70, IR_ZOOM_MAX = 150, IR_ZOOM_STEP = 10;
function irApplyZoom(pct){
  pct = Math.max(IR_ZOOM_MIN, Math.min(IR_ZOOM_MAX, pct));
  document.body.style.zoom = (pct/100);
  const label = document.getElementById('zoomLabel');
  if(label) label.textContent = pct+'%';
  localStorage.setItem('ir-zoom', pct);
}
function irZoomIn(){ irApplyZoom((parseInt(localStorage.getItem('ir-zoom'),10)||100) + IR_ZOOM_STEP); }
function irZoomOut(){ irApplyZoom((parseInt(localStorage.getItem('ir-zoom'),10)||100) - IR_ZOOM_STEP); }

const IR_TAB_LABELS = {
  dashboard:['Dashboard Executivo','Visão geral do ciclo ativo.'],
  ciclo:['NET','Meta x realizado do ciclo e detalhe de NET por Log/Rua/Tipo.'],
  produtividade:['Produtividade','Ranking e desempenho dos colaboradores.'],
  setores:['Setores','Resumo por setor (rua) e ruas mais divergentes.'],
  divergencias:['Divergências','Itens com saldo final diferente do sistêmico.'],
  auditoria:['Auditoria Inteligente','Fila priorizada automaticamente para conferência.'],
  historico:['Histórico','Linha do tempo de todos os ciclos.'],
  comparativo:['Comparativo entre Ciclos','Compare acurácia, produtividade e tendências.'],
  indicadores:['Indicadores','Todos os KPIs, com a fórmula de cada um.'],
  importacao:['Importação','Importe as planilhas e abra ou atualize um ciclo.'],
  configuracoes:['Configurações','Pesos do Índice de Prioridade de Auditoria.']
};
function irSwitchTab(tab){
  IR.currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  const [title, sub] = IR_TAB_LABELS[tab] || [tab, ''];
  document.getElementById('tabTitle').textContent = title;
  document.getElementById('tabSubtitle').textContent = sub;
  irRenderCycleBadge();
  irRenderView();
  irCloseSidebarMobile();
}
function irRenderCycleBadge(){
  const badge = document.getElementById('cycleBadge');
  if(!badge) return;
  if(!IR.ciclos.length){ badge.innerHTML = 'Nenhum ciclo ativo'; return; }
  if(IR.ciclos.length===1){
    const c = IR.ciclos[0];
    badge.innerHTML = `${irCicloLabel(c)} — ${c.status==='aberto'?'Aberto':'Encerrado'}`;
    return;
  }
  const ordenados = IR.ciclos.slice().sort((a,b)=>b.numero-a.numero);
  badge.innerHTML = `<select id="cycleFilterSelect" onchange="irFiltrarCiclo(this.value)" title="Filtrar por ciclo">
    ${ordenados.map(c=>`<option value="${c.id}" ${IR.cicloAtivo && c.id===IR.cicloAtivo.id ? 'selected' : ''}>${irCicloLabel(c)} — ${c.status==='aberto'?'Aberto':'Encerrado'}</option>`).join('')}
  </select>`;
}
async function irFiltrarCiclo(cicloId){
  IR.cicloAtivo = IR.ciclos.find(c=>c.id===cicloId);
  IR.calMesIdx = null;
  await irLoadCicloData(cicloId);
  irRenderCycleBadge();
  irRenderView();
}
function irRenderView(){
  const root = document.getElementById('viewRoot');
  const needsCiclo = IR.currentTab!=='importacao' && IR.currentTab!=='configuracoes' && IR.currentTab!=='historico';
  if(needsCiclo && !IR.cicloAtivo){
    root.innerHTML = irEmptyState('Nenhum ciclo importado ainda', 'Importe as planilhas na aba Importação para abrir o primeiro ciclo.', "irSwitchTab('importacao')", 'Ir para Importação');
    return;
  }
  const renderers = {
    dashboard: irRenderDashboard, ciclo: irRenderGestaoCiclo, produtividade: irRenderProdutividade,
    setores: irRenderSetores,
    divergencias: irRenderDivergencias, auditoria: irRenderAuditoria, historico: irRenderHistorico,
    comparativo: irRenderComparativo, indicadores: irRenderIndicadores,
    importacao: irRenderImportacao, configuracoes: irRenderConfiguracoes
  };
  root.innerHTML = (renderers[IR.currentTab] || (()=>''))();
  if(IR.currentTab==='divergencias') irMountDivergenciasScroll();
  if(IR.currentTab==='auditoria') irMountAuditoriaScroll();
}

/* ============================================================
   IMPORTAÇÃO
   ============================================================ */
const IR_FILE_TYPES = [
  // QRY0390 é opcional: o estoque é rotativo (vivo) e hoje não entra em nenhum cálculo
  // de indicador — não faz sentido travar o processamento do ciclo esperando por ela.
  {key:'f390', label:'QRY0390', desc:'Estoque por Local (opcional)', pattern:/0390/i, optional:true},
  {key:'f843', label:'QRY0843', desc:'Produtividade (peças, locais, itens e divergências)', pattern:/0843/i},
  {key:'fCong', label:'Base Congelada', desc:'Locais congelados do ciclo (planilha manual)', pattern:/congelad|espelho/i},
  {key:'f278', label:'SIGEQ278', desc:'Preço de custo/compra por item', pattern:/278/i},
  {key:'f051', label:'ZBIQ0051', desc:'Item pai x componente (kits/múltiplos), S/N de valoração', pattern:/0051|zbiq/i}
];
// Slots que aceitam vários arquivos dentro do MESMO ciclo (concatenados e deduplicados
// no worker) — úteis quando a extração de origem tem limite de linhas/tempo e precisa
// ser feita em pedaços. Cada arquivo ocupa uma "parte" numerada; reimportar na mesma
// parte troca o arquivo daquela parte. Isso NÃO tem relação com ciclo/ano — ciclos
// diferentes (ex: 2026 e 2027) são sempre importados um de cada vez, trocando os campos
// "Número do ciclo" e "Data de abertura" mais abaixo.
const IR_MULTI_KEYS = new Set(['f843', 'fCong', 'f278', 'f051']);
const IR_MULTI_DEFAULT_SLOTS = 4;
function irRenderImportacao(){
  const f = IR.files;
  const filled = (k)=> IR_MULTI_KEYS.has(k) ? (f[k]||[]).some(Boolean) : !!f[k];
  const allSelected = IR_FILE_TYPES.every(t=>t.optional || filled(t.key));
  const dz = (t)=>{
    if(IR_MULTI_KEYS.has(t.key)){
      const slots = f[t.key]||[];
      return `<div class="dropzone dz-multi ${slots.some(Boolean)?'has-file':''}" ondragover="event.preventDefault()" ondrop="irOnDropMultiKey(event,'${t.key}')">
        <div class="dz-icon">📄</div>
        <div class="dz-title">${t.label}</div>
        <div class="dz-desc">${t.desc}</div>
        <p class="field-hint" style="margin:2px 0 8px;">Se a extração não sai tudo de uma vez, divida em partes aqui — todas pertencem a este mesmo ciclo. Se um relatório mudar, reimporte na mesma parte pra substituir.</p>
        <div class="dz-period-list">
          ${slots.map((file,i)=>`<div class="dz-period-row ${file?'has-file':''}">
            <span class="dz-period-label">Parte ${i+1}</span>
            <input type="file" id="ir-file-${t.key}-${i}" accept=".xlsx,.xls" style="display:none" onchange="irSetSlotFile('${t.key}', ${i}, this.files[0])">
            ${file
              ? `<span class="dz-file mono">${irEsc(file.name)}</span>
                 <button class="btn-link" onclick="document.getElementById('ir-file-${t.key}-${i}').click()">Trocar</button>
                 <button class="btn-link" onclick="irRemoveSlot('${t.key}', ${i})">Remover</button>`
              : `<button class="btn-link" onclick="document.getElementById('ir-file-${t.key}-${i}').click()">Selecionar</button>`}
          </div>`).join('')}
        </div>
        <button class="btn-link" onclick="irAddSlot('${t.key}')">+ Adicionar parte</button>
      </div>`;
    }
    const file = f[t.key];
    return `<div class="dropzone ${file?'has-file':''}" ondragover="event.preventDefault()" ondrop="irOnDropSingle(event,'${t.key}')">
      <input type="file" id="ir-file-${t.key}" accept=".xlsx,.xls" style="display:none" onchange="irOnFile('${t.key}', this.files[0])">
      <div class="dz-icon">📄</div>
      <div class="dz-title">${t.label}</div>
      <div class="dz-desc">${t.desc}</div>
      ${file ? `<div class="dz-file mono">${irEsc(file.name)}</div><button class="btn-link" onclick="irRemoveFile('${t.key}')">Remover</button>`
             : `<button class="btn btn-secondary" onclick="document.getElementById('ir-file-${t.key}').click()">Selecionar</button>`}
    </div>`;
  };
  return `
    <div class="panel" ondragover="event.preventDefault()" ondrop="irOnDropMulti(event)">
      <h3>Importar planilhas</h3>
      <p class="field-hint" style="margin-bottom:10px;">Arraste as planilhas de uma vez aqui em cima (o sistema identifica cada uma pelo nome do arquivo), ou selecione individualmente abaixo. QRY0843, Base Congelada, SIGEQ278 e ZBIQ0051 aceitam várias partes (para quando os dados de um mesmo ciclo vêm em pedaços).</p>
      <input type="file" id="ir-file-all" accept=".xlsx,.xls" multiple style="display:none" onchange="irOnPickMultiAll(this.files)">
      <div class="form-actions" style="margin:0 0 14px;">
        <button class="btn btn-secondary" onclick="document.getElementById('ir-file-all').click()">📂 Selecionar todos de uma vez</button>
      </div>
      <div class="dz-grid">${IR_FILE_TYPES.map(dz).join('')}</div>
      <p class="field-hint" style="margin-top:16px;"><strong>Ciclo e ano deste processamento</strong> — pra importar outro ciclo/ano (ex: 2027), volte aqui depois e processe de novo com os campos abaixo trocados; cada combinação número + data de abertura vira um ciclo separado no Histórico.</p>
      <div class="two-col" style="margin-top:4px;">
        <div><label>Número do ciclo</label><input type="number" id="ir-inp-ciclo" min="1" value="${(()=>{
          if(IR.cicloAtivo) return IR.cicloAtivo.numero;
          const anoAtual = new Date().getFullYear();
          const doAno = IR.ciclos.filter(c=>irCicloAno(c)===anoAtual);
          return doAno.length ? Math.max(...doAno.map(c=>c.numero))+1 : 1;
        })()}"></div>
        <div><label>Data de abertura</label><input type="date" id="ir-inp-abertura" value="${IR.cicloAtivo ? IR.cicloAtivo.dataAbertura : new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="two-col">
        <div><label>Data prevista de término</label><input type="date" id="ir-inp-termino" value="${IR.cicloAtivo ? (IR.cicloAtivo.dataPrevistaTermino||'') : ''}"></div>
        <div></div>
      </div>
      ${IR.processing ? `
        <div class="progress-wrap">
          <div class="progress-stage">${irEsc(IR.progress.stage)}</div>
          <div class="progress-track"><div class="progress-fill orange" style="width:${IR.progress.pct}%"></div></div>
        </div>` : allSelected
          ? `<div class="form-actions"><button class="btn btn-primary" style="font-size:14px;padding:11px 28px;" onclick="irProcessar()">PROCESSAR CICLO</button></div>`
          : `<p class="field-hint" style="margin-top:14px;">Selecione as planilhas obrigatórias (QRY0843, Base Congelada, SIGEQ278, ZBIQ0051) para habilitar o processamento — a QRY0390 é opcional.</p>`
      }
    </div>
    ${IR.importMeta ? irRenderUltimoProcessamento() : ''}
    ${irRenderNet410ImportPanel()}
  `;
}
function irRenderUltimoProcessamento(){
  const m = IR.importMeta;
  return `<div class="panel"><h3>Último processamento — ${irCicloLabel(IR.cicloAtivo)}</h3>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="num mono">${irFmtInt(m.totalLocaisCongelados)}</div><div class="label">Locais congelados</div></div>
      <div class="kpi-card orange"><div class="num mono">${irFmtInt(m.totalDivergencias)}</div><div class="label">Itens divergentes</div></div>
      <div class="kpi-card"><div class="num mono">${irFmtInt(m.totalContagens)}</div><div class="label">Contagens processadas</div></div>
    </div>
    <p class="field-hint">Processado em ${new Date(m.processedAt).toLocaleString('pt-BR')}</p>
  </div>`;
}
function irClassifyFile(file){
  const t = IR_FILE_TYPES.find(t=>t.pattern.test(file.name));
  return t ? t.key : null;
}
function irOnFile(key, file){ if(!file) return; IR.files[key] = file; irRenderView(); }
function irRemoveFile(key){ IR.files[key] = null; irRenderView(); }
// Slots multi-arquivo: cada posição do array é uma "parte" do mesmo ciclo — pode estar
// vazia (null) até o usuário selecionar um arquivo pra ela. Reimportar na mesma posição substitui.
function irSetSlotFile(key, index, file){
  if(!file) return;
  if(!IR.files[key]) IR.files[key] = [];
  IR.files[key][index] = file;
  irRenderView();
}
function irRemoveSlot(key, index){
  IR.files[key].splice(index, 1);
  if(!IR.files[key].length) IR.files[key].push(null);
  irRenderView();
}
function irAddSlot(key){
  IR.files[key].push(null);
  irRenderView();
}
// Encaixa arquivos soltos nas primeiras partes vazias; cria partes novas se faltar espaço.
function irAssignFilesToSlots(key, files){
  if(!files.length) return;
  if(!IR.files[key]) IR.files[key] = [];
  const arr = IR.files[key];
  let fi = 0;
  for(let i=0; i<arr.length && fi<files.length; i++){
    if(!arr[i]) arr[i] = files[fi++];
  }
  while(fi<files.length) arr.push(files[fi++]);
  irRenderView();
}
function irOnDropMultiKey(e, key){
  e.preventDefault();
  irAssignFilesToSlots(key, Array.from(e.dataTransfer.files||[]));
}
function irOnDropSingle(e, key){
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if(file) irOnFile(key, file);
}
// Identifica cada arquivo pelo nome e joga no slot certo — usado tanto ao arrastar
// quanto ao escolher vários arquivos de uma vez pelo seletor nativo do sistema.
function irClassifyAndAssignFiles(files){
  if(!files.length) return;
  let matched = 0, unmatched = [];
  const porChave = {};
  for(const file of files){
    const key = irClassifyFile(file);
    if(key && IR_MULTI_KEYS.has(key)){ (porChave[key]=porChave[key]||[]).push(file); matched++; }
    else if(key){ IR.files[key] = file; matched++; }
    else unmatched.push(file.name);
  }
  for(const key in porChave) irAssignFilesToSlots(key, porChave[key]);
  irRenderView();
  if(matched) irShowToast(matched+' arquivo(s) reconhecido(s) automaticamente.');
  if(unmatched.length) irShowToast('Não consegui identificar: '+unmatched.join(', ')+'. Selecione manualmente.', true);
}
function irOnDropMulti(e){
  e.preventDefault();
  irClassifyAndAssignFiles(Array.from(e.dataTransfer.files || []));
}
function irOnPickMultiAll(fileList){
  irClassifyAndAssignFiles(Array.from(fileList || []));
}
async function irProcessar(){
  if(IR.processing) return;
  const f = IR.files;
  const files843 = f.f843.filter(Boolean), filesCong = f.fCong.filter(Boolean),
        files278 = f.f278.filter(Boolean), files051 = f.f051.filter(Boolean);
  if(!(files843.length && filesCong.length && files278.length && files051.length)) return;
  const numero = parseInt(document.getElementById('ir-inp-ciclo').value, 10);
  const dataAbertura = document.getElementById('ir-inp-abertura').value;
  const dataPrevistaTermino = document.getElementById('ir-inp-termino').value;
  if(!numero || !dataAbertura){ irShowToast('Informe o número do ciclo e a data de abertura.', true); return; }

  // Ciclo é identificado por número + ano (não só o número) — evita que
  // "Ciclo 1" de um ano novo sobrescreva o "Ciclo 1" de um ano anterior.
  const anoNovo = new Date(dataAbertura).getFullYear();
  const existente = IR.ciclos.find(c=>c.numero===numero && irCicloAno(c)===anoNovo);
  const cicloId = existente ? existente.id : 'ciclo-'+numero+'-'+anoNovo+'-'+Date.now().toString(36);
  const ciclo = {
    id: cicloId, numero, dataAbertura, dataPrevistaTermino: dataPrevistaTermino||null,
    dataEncerramento: existente ? existente.dataEncerramento : null,
    status: existente ? existente.status : 'aberto'
  };

  IR.processing = true; IR.progress = {stage:'Lendo arquivos...', pct:0};
  irRenderView();
  try{
    const [buf390, bufs843, bufsCongelada, bufs278, bufs051] = await Promise.all([
      f.f390 ? f.f390.arrayBuffer() : Promise.resolve(null),
      Promise.all(files843.map(file=>file.arrayBuffer())),
      Promise.all(filesCong.map(file=>file.arrayBuffer())),
      Promise.all(files278.map(file=>file.arrayBuffer())),
      Promise.all(files051.map(file=>file.arrayBuffer()))
    ]);
    const worker = new Worker('js/worker.js');
    worker.onmessage = async (e)=>{
      const msg = e.data;
      if(msg.type==='progress'){ IR.progress = {stage:msg.stage, pct:msg.pct}; irUpdateProgressUI(); }
      else if(msg.type==='error'){
        IR.processing=false; worker.terminate();
        irShowToast('Erro no processamento: '+msg.message, true); irRenderView();
      } else if(msg.type==='done'){
        IR.processing = false; worker.terminate();
        await irSaveCiclo(ciclo);
        IR.files = {f390:null, f843:[null,null,null,null], fCong:[null,null,null,null], f278:[null,null,null,null], f051:[null,null,null,null]};
        IR.ciclos = await irGetAllCiclos();
        IR.cicloAtivo = IR.ciclos.find(c=>c.id===cicloId);
        await irLoadCicloData(cicloId);
        irShowToast('✓ Ciclo '+numero+' processado: '+irFmtInt(msg.totalLocais)+' locais, '+irFmtInt(msg.totalDivergencias)+' itens divergentes.');
        irSwitchTab('dashboard');
      }
    };
    worker.onerror = (err)=>{ IR.processing=false; irShowToast('Erro no worker: '+err.message, true); irRenderView(); };
    worker.postMessage({
      type:'process', buf390, bufs843, bufsCongelada, bufs278, bufs051,
      cicloId, cicloNumero:numero, dataAbertura, dataPrevistaTermino,
      prioridadeConfig: IR.prioridadeConfig
    }, [...(buf390 ? [buf390] : []), ...bufs843, ...bufsCongelada, ...bufs278, ...bufs051]);
  }catch(err){
    IR.processing=false; irShowToast('Erro ao ler arquivos: '+err.message, true); irRenderView();
  }
}
function irUpdateProgressUI(){
  const stageEl = document.querySelector('.progress-stage');
  const fillEl = document.querySelector('.progress-fill');
  if(stageEl && fillEl){ stageEl.textContent = IR.progress.stage; fillEl.style.width = IR.progress.pct+'%'; }
  else irRenderView();
}
function irUpdateProgressUI410(){
  const stageEl = document.querySelector('.progress-stage');
  const fillEl = document.querySelector('.progress-fill');
  if(stageEl && fillEl){ stageEl.textContent = IR.net410Progress.stage; fillEl.style.width = IR.net410Progress.pct+'%'; }
  else irRenderView();
}

/* ============================================================
   DASHBOARD EXECUTIVO
   ============================================================ */
function irKpiTile(icon, val, label, cls, hint){
  return `<div class="kpi-tile"><div class="kt-icon">${icon}</div><div class="num mono ${cls||''}">${val}</div><div class="label">${label}</div>${hint?`<div class="meta-hint">${hint}</div>`:''}</div>`;
}
function irKpiBlock(theme, icon, title, tilesHtml){
  return `<div class="kpi-block theme-${theme}">
    <div class="kpi-block-header"><span class="bh-icon">${icon}</span>${title}</div>
    <div class="kpi-block-body">${tilesHtml}</div>
  </div>`;
}
const IR_INDICADORES_VERSION = 7; // mantido em sincronia com worker.js
/* Barra de filtros do Dashboard, no estilo Power BI: ciclo + período de data num só
   lugar, com um chip pra escolher em quais painéis o filtro de data se aplica (hoje só
   a Produtividade responde a data — os demais KPIs/gráficos são do ciclo inteiro). */
function irRenderDashFilterBar(){
  const ordenados = IR.ciclos.slice().sort((a,b)=>b.numero-a.numero);
  // Sempre em dropdown, mesmo com um único ciclo — facilita quando novos ciclos forem
  // processados (não precisa a lista "aparecer" de repente, já fica pronta).
  const cicloSelect = `<select id="dashCicloSelect" onchange="irFiltrarCiclo(this.value)">
    ${ordenados.map(c=>`<option value="${c.id}" ${IR.cicloAtivo && c.id===IR.cicloAtivo.id?'selected':''}>${irEsc(irCicloLabel(c))} — ${c.status==='aberto'?'Aberto':'Encerrado'}</option>`).join('')}
  </select>`;
  return `<div class="panel dash-filter-bar">
    <div class="dash-filter-group">
      <label>Ciclo</label>
      ${cicloSelect}
    </div>
    <div class="dash-filter-group">
      <label>Período</label>
      <input type="date" value="${irEsc(IR.prodFilters.de)}" onchange="irProdSetFilter('de', this.value)">
      <span class="dash-filter-sep">–</span>
      <input type="date" value="${irEsc(IR.prodFilters.ate)}" onchange="irProdSetFilter('ate', this.value)">
      ${(IR.prodFilters.de||IR.prodFilters.ate) ? `<button class="btn-link" onclick="irProdSetFilter('de','');IR.prodFilters.ate='';irRenderView();">Limpar</button>` : ''}
    </div>
    <div class="dash-filter-group dash-filter-scope">
      <label>Aplicar período em</label>
      <button type="button" class="dash-filter-chip ${IR.dashFilters.applyProdDate?'active':''}" onclick="irToggleDashDateScope('applyProdDate')">Produtividade</button>
    </div>
  </div>`;
}
function irRenderDashboard(){
  const ind = IR.indicadores;
  if(!ind) return irEmptyState('Sem indicadores', 'Processe o ciclo na Importação.', "irSwitchTab('importacao')", 'Ir para Importação');
  const itemSaldo = irCalcItemSaldo(IR.divergencias);
  // Cada bloco tem sempre 3 bullets, no mesmo formato: ícone + acurácia (com meta),
  // + volume principal, + divergência/pendência. Os demais indicadores (itens
  // divergentes, recontagens, tempo médio etc.) continuam na aba Indicadores.
  const metaHint = `Meta: ${irFmtPct(ind.meta)}`;
  const blocoPecas = irKpiBlock('orange','📦','Peças',
    irKpiTile('🎯', irFmtPct(ind.acuraciaPecas), 'Acurácia Peças', ind.acuraciaPecas>=ind.meta?'good':'bad', metaHint) +
    irKpiTile('📦', irFmtInt(ind.pecasContadas), 'Peças Contadas', '', 'total físico') +
    irKpiTile('⚠️', irFmtInt(ind.pecasDivergentes), 'Peças Divergentes', 'bad', irFmtInt(ind.itensDivergentes)+' itens')
  );
  const blocoLocais = irKpiBlock('blue','📍','Locais',
    irKpiTile('🎯', irFmtPct(ind.acuraciaLocal), 'Acurácia Local', ind.acuraciaLocal>=ind.meta?'good':'bad', metaHint) +
    irKpiTile('✅', irFmtInt(ind.locaisConcluidos), 'Concluídos', '', 'de '+irFmtInt(ind.locaisContadosTotal)+' contados') +
    irKpiTile('⏳', irFmtInt(ind.locaisPendentes), 'Pendentes', 'bad', irFmtInt(ind.qtdRecontagens)+' recontagens')
  );
  const blocoValor = irKpiBlock('black','💰','Valor',
    irKpiTile('🎯', irFmtPct(ind.acuraciaValor), 'Acurácia Valor', ind.acuraciaValor>=ind.meta?'good':'bad', metaHint) +
    irKpiTile('💸', irFmtMoney(ind.valorDivergenteAbsoluto), 'Divergente (abs.)', 'bad', 'soma absoluta') +
    irKpiTile('🧮', irFmtMoney(ind.valorDivergenteLiquido), 'Divergente (líquido)', '', 'ganho − perda')
  );
  const blocoCiclo = irKpiBlock('neutral','🔄','Ciclo',
    irKpiTile('📊', irFmtPct(ind.andamentoCiclo), 'Andamento', '', irFmtInt(ind.locaisConcluidos)+' de '+irFmtInt(ind.locaisCongelados)) +
    irKpiTile('📅', ind.diasRestantes===null?'—':irFmtInt(ind.diasRestantes), 'Dias Restantes', '', 'dias úteis · exclui feriados') +
    irKpiTile('⚡', irFmtPct(ind.eficiencia), 'Eficiência', ind.eficiencia>=0.8?'good':(ind.eficiencia<0.5?'bad':''), 'qualidade x velocidade')
  );
  return `
    ${irRenderDashFilterBar()}
    <div class="form-actions" style="margin:0 0 12px;">
      <button class="btn btn-secondary" onclick="irGerarRelatorioEmail()">📧 Preparar boletim para enviar por e-mail</button>
    </div>
    <div class="kpi-blocks">
      ${blocoPecas}${blocoLocais}${blocoValor}${blocoCiclo}
    </div>
    <div class="bi-grid-2">
      ${irRenderSaudeEstoquePanel(ind)}
      ${irRenderStatusInventarioPanel(ind)}
    </div>
    ${irRenderDashProdutividade()}
    ${irRenderPorLogPanel(ind)}
    ${irRenderContadosPorDiaPanel(ind)}
    <div class="bi-grid-2">
      ${irRenderTopItensPanel(itemSaldo, 'pecas')}
      ${irRenderTopItensPanel(itemSaldo, 'valor')}
    </div>
    ${irRenderLogTablePanel(ind)}
    ${irRenderCalendarioPanel(ind)}
  `;
}
const IR_META_DIARIA = 962;
function irRenderCalendarioPanel(ind){
  const rows = ind.contadosPorDia||[];
  if(!rows.length) return '';
  const porDia = new Map(rows.map(r=>[r.dia, r.total]));
  const meses = Array.from(new Set(rows.map(r=>r.dia.slice(0,7)))).sort();
  if(IR.calMesIdx===undefined || IR.calMesIdx===null) IR.calMesIdx = meses.length-1;
  IR.calMesIdx = Math.max(0, Math.min(meses.length-1, IR.calMesIdx));
  const mes = meses[IR.calMesIdx];
  const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const [ano, mesNum] = mes.split('-').map(Number);
  const primeiroDia = new Date(ano, mesNum-1, 1);
  const ultimoDia = new Date(ano, mesNum, 0).getDate();
  const offset = primeiroDia.getDay();
  const cells = [];
  for(let i=0;i<offset;i++) cells.push('<div class="ir-cal-cell filler"></div>');
  for(let d=1; d<=ultimoDia; d++){
    const diaStr = mes+'-'+String(d).padStart(2,'0');
    const total = porDia.get(diaStr);
    if(total===undefined){
      cells.push(`<div class="ir-cal-cell neutral"><div class="cal-day">${d}</div></div>`);
    } else {
      const bateu = total>=IR_META_DIARIA;
      cells.push(`<div class="ir-cal-cell ${bateu?'good':'bad'}" title="${irFmtInt(total)} de ${irFmtInt(IR_META_DIARIA)}">
        <div class="cal-day">${d}</div>
        <div class="cal-icon">${bateu?'✅':'⚠️'}</div>
        <div class="cal-total mono">${irFmtInt(total)}</div>
      </div>`);
    }
  }
  const nomeMesRaw = primeiroDia.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
  const nomeMes = nomeMesRaw.charAt(0).toUpperCase()+nomeMesRaw.slice(1);
  const mesHtml = `<div class="ir-cal-month">
    <div class="ir-cal-month-nav">
      <button class="btn-cal-nav" onclick="irCalNavMonth(-1)" ${IR.calMesIdx<=0?'disabled':''} aria-label="Mês anterior">‹</button>
      <div class="ir-cal-month-title">${irEsc(nomeMes)}</div>
      <button class="btn-cal-nav" onclick="irCalNavMonth(1)" ${IR.calMesIdx>=meses.length-1?'disabled':''} aria-label="Próximo mês">›</button>
    </div>
    <div class="ir-cal-grid ir-cal-head">${diasSemana.map(d=>`<div class="ir-cal-dow">${d}</div>`).join('')}</div>
    <div class="ir-cal-grid">${cells.join('')}</div>
  </div>`;
  return `<div class="panel">
    <h3>Calendário de Metas</h3>
    <p class="panel-sub">Meta diária: ${irFmtInt(IR_META_DIARIA)} posições contadas · verde = bateu a meta, vermelho = abaixo da meta, cinza = sem contagem.</p>
    ${mesHtml}
  </div>`;
}
function irCalNavMonth(delta){
  IR.calMesIdx = (IR.calMesIdx||0) + delta;
  irRenderView();
}
function irRenderLogTablePanel(ind){
  const rows = irFiltrarLogsValidos(ind.porLog);
  if(!rows.length) return '';
  const rowsComTotal = [...rows, irCalcLogTotal(rows)];
  const meta = ind.meta;
  return `<div class="panel">
    <h3>Acurácia por Log</h3>
    <p class="panel-sub">Locais orçados x contados (Grupo Classe da base congelada), peças e acurácias por log. Só LOG 1, 2, 3 e 6 — os demais ainda têm base congelada pra corrigir.</p>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Log</th><th>Locais Orçados</th><th>Locais Contados</th><th>Locais Divergentes</th>
        <th>Peças Contadas</th><th>Peças Divergentes</th>
        <th>Acurácia Peças</th><th>Acurácia Posições</th><th>Acurácia Valor</th>
      </tr></thead>
      <tbody>${rowsComTotal.map(r=>`<tr${r.isTotal?' style="font-weight:700;border-top:2px solid var(--line);"':''}>
        <td class="mono">${irEsc(r.chave)}</td>
        <td class="mono">${irFmtInt(r.locaisOrcados)}</td>
        <td class="mono">${irFmtInt(r.locaisContados)}</td>
        <td class="mono">${irFmtInt(r.locaisDivergentes)}</td>
        <td class="mono">${irFmtInt(r.pecasContadas)}</td>
        <td class="mono">${irFmtInt(r.pecasDivergentes)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaPecas, meta)}">${irFmtPct(r.acuraciaPecas)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaPosicoes, meta)}">${irFmtPct(r.acuraciaPosicoes)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaValor, meta)}">${irFmtPct(r.acuraciaValor)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
function irHeatStyle(val, meta){
  const t = Math.max(0, Math.min(1, meta>0 ? val/meta : val));
  const r = Math.round(200 + (31-200)*t), g = Math.round(56 + (138-56)*t), b = Math.round(18 + (82-18)*t);
  return `background:rgba(${r},${g},${b},.14); color:rgb(${r},${g},${b});`;
}
/* ============================================================
   SETORES (Resumo por Setor + Ruas mais divergentes)
   ============================================================ */
function irRenderSetores(){
  const ind = IR.indicadores;
  if(!ind) return irEmptyState('Sem indicadores', 'Processe o ciclo na Importação.', "irSwitchTab('importacao')", 'Ir para Importação');
  return `
    ${irRenderPorRuaPanel(ind)}
    ${irRenderRuasMaisDivergentesPanel(ind)}
  `;
}
function irRenderPorRuaPanel(ind){
  const rows = (ind.porRua||[]).filter(r=>r.chave!=='(sem rua)').slice().sort((a,b)=>a.chave.localeCompare(b.chave));
  if(!rows.length) return '';
  const meta = ind.meta;
  return `<div class="panel">
    <h3>Resumo por Setor</h3>
    <p class="panel-sub">Locais orçados x contados (coluna X1 da base congelada), peças e acurácias por rua.</p>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Rua</th><th>Locais Orçados</th><th>Locais Contados</th><th>Locais Divergentes</th>
        <th>Peças Contadas</th><th>Peças Divergentes</th>
        <th>Acurácia Peças</th><th>Posições</th><th>Valores</th>
      </tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td class="mono">${irEsc(r.chave)}</td>
        <td class="mono">${irFmtInt(r.locaisOrcados)}</td>
        <td class="mono">${irFmtInt(r.locaisContados)}</td>
        <td class="mono">${irFmtInt(r.locaisDivergentes)}</td>
        <td class="mono">${irFmtInt(r.pecasContadas)}</td>
        <td class="mono">${irFmtInt(r.pecasDivergentes)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaPecas, meta)}">${irFmtPct(r.acuraciaPecas)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaPosicoes, meta)}">${irFmtPct(r.acuraciaPosicoes)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaValor, meta)}">${irFmtPct(r.acuraciaValor)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
// Só esses 4 logs têm base congelada confiável hoje (os demais — LOG 4, COFRE, ESC,
// MOVI, INV etc. — ficam de fora até o usuário corrigir a base congelada deles).
const IR_LOGS_VALIDOS = ['LOG 1','LOG 2','LOG 3','LOG 6'];
function irFiltrarLogsValidos(porLog){
  return (porLog||[]).filter(r=>IR_LOGS_VALIDOS.includes(r.chave) && r.locaisContados>0)
    .slice().sort((a,b)=>IR_LOGS_VALIDOS.indexOf(a.chave)-IR_LOGS_VALIDOS.indexOf(b.chave));
}
// Total agregado dos logs válidos — recalculado a partir dos totais brutos (peças/
// locais/valor), não é média das porcentagens, pra manter a mesma metodologia
// ponderada por volume usada em cada acurácia individual.
function irCalcLogTotal(rows){
  const sum = k => rows.reduce((s,r)=>s+(r[k]||0), 0);
  const pecasContadas = sum('pecasContadas'), pecasDivergentes = sum('pecasDivergentes');
  const vlFisicoTotal = sum('vlFisicoTotal'), valorDivergenteAbsoluto = sum('valorDivergenteAbsoluto');
  const locaisContados = sum('locaisContados'), locaisDivergentes = sum('locaisDivergentes');
  return {
    chave: 'TOTAL', isTotal: true,
    acuraciaPecas: pecasContadas>0 ? Math.max(0,1-pecasDivergentes/pecasContadas) : 1,
    acuraciaValor: vlFisicoTotal>0 ? Math.max(0,1-valorDivergenteAbsoluto/vlFisicoTotal) : 1,
    acuraciaPosicoes: locaisContados>0 ? Math.max(0,1-locaisDivergentes/locaisContados) : 1,
    pecasContadas, pecasDivergentes, vlFisicoTotal, valorDivergenteAbsoluto,
    locaisContados, locaisDivergentes, locaisOrcados: sum('locaisOrcados')
  };
}
function irRenderPorLogPanel(ind){
  const rows = irFiltrarLogsValidos(ind.porLog);
  if(!rows.length) return `<div class="panel"><h3>Acurácias e NET por Log</h3><p class="field-hint">Nenhum log com locais contados ainda.</p></div>`;
  const rowsComTotal = [...rows, irCalcLogTotal(rows)];
  IR._porLogMap = new Map(rowsComTotal.map(r=>[r.chave, r]));
  return `<div class="panel">
    <h3>Acurácias por Log</h3>
    <p class="panel-sub">Só LOG 1, 2, 3 e 6 — os demais logs ainda têm base congelada pra corrigir.</p>
    <div class="bi-vbars bi-vbars-grouped">
      ${rowsComTotal.map(r=>`<div class="bi-vbar-col${r.isTotal?' bi-vbar-col-total':''}" onmouseenter="irShowLogTooltip(event,'${irEsc(r.chave)}')" onmousemove="irMoveDiaTooltip(event)" onmouseleave="irHideDiaTooltip()">
        <div class="bi-cluster" style="height:100px;">
          <div class="bi-cluster-bar">
            <div class="bi-cluster-val mono" style="color:var(--orange);">${irFmtPct(r.acuraciaPecas)}</div>
            <div class="bi-vbar orange" style="height:${Math.round(r.acuraciaPecas*100)}px;"></div>
          </div>
          <div class="bi-cluster-bar">
            <div class="bi-cluster-val mono" style="color:var(--blue);">${irFmtPct(r.acuraciaPosicoes)}</div>
            <div class="bi-vbar" style="height:${Math.round(r.acuraciaPosicoes*100)}px;"></div>
          </div>
          <div class="bi-cluster-bar">
            <div class="bi-cluster-val mono" style="color:var(--ink);">${irFmtPct(r.acuraciaValor)}</div>
            <div class="bi-vbar" style="height:${Math.round(r.acuraciaValor*100)}px;background:var(--ink);"></div>
          </div>
        </div>
        <div class="bi-vbar-label">${r.isTotal?'TOTAL':irEsc(r.chave)}</div>
      </div>`).join('')}
    </div>
    <p class="field-hint" style="margin-top:8px;">
      <span class="mono" style="color:var(--orange);">■</span> Peças &nbsp;
      <span class="mono" style="color:var(--blue);">■</span> Posições &nbsp;
      <span class="mono" style="color:#1D1F2A;">■</span> Valores
    </p>
  </div>`;
}
/* Gráfico de barras (Acurácias por Log) pro boletim — SVG estático com o
   rótulo da % acima de cada barra, cores fixas (vira imagem). */
function irBuildLogBarChartSvg(rows, opts){
  opts = opts||{};
  const colors = opts.colors || {pecas:'#FA4616', posicoes:'#001A72', valor:'#1D1F2A', grid:'#E4E7EE', axis:'#6B7280'};
  // W fixo = largura real do conteúdo dentro de .rp-panel-pad no boletim (920 de
  // .rp-page − 2×40 de padding do .rp-body − 2×20 de padding do .rp-panel-pad).
  // Usando esse valor exato (em vez de escalar por aspect-ratio) o SVG desenha 1:1
  // com o espaço disponível — sem sobrar espaço em branco e sem depender do
  // navegador calcular "height:auto" corretamente antes da captura do html2canvas.
  const W = 800, H = 280;
  const padL = 14, padR = 14, padT = 46, padB = 34;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const n = rows.length, groupW = plotW/n;
  const barW = Math.min(46, groupW/3*0.8), gap = 5;
  const series = [
    {key:'acuraciaPecas', color:colors.pecas},
    {key:'acuraciaPosicoes', color:colors.posicoes},
    {key:'acuraciaValor', color:colors.valor}
  ];
  let bars = '', labels = '', xLabels = '';
  rows.forEach((r,i)=>{
    const groupX = padL + i*groupW + (groupW-(barW*3+gap*2))/2;
    series.forEach((s,si)=>{
      const val = Math.max(0,Math.min(1,r[s.key]));
      const bh = val*plotH;
      const bx = groupX + si*(barW+gap);
      const by = padT+plotH-bh;
      bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${s.color}" rx="2"/>`;
      labels += `<text x="${(bx+barW/2).toFixed(1)}" y="${(by-6).toFixed(1)}" font-size="12" text-anchor="middle" fill="${s.color}" font-weight="700">${Math.round(val*100)}%</text>`;
    });
    xLabels += `<text x="${(padL+i*groupW+groupW/2).toFixed(1)}" y="${H-12}" font-size="13" text-anchor="middle" fill="${colors.axis}" font-weight="600">${irEsc(r.chave)}</text>`;
  });
  const gridLines = [0,0.25,0.5,0.75,1].map(t=>{
    const y = padT+plotH-t*plotH;
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="${colors.grid}" stroke-width="1"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;">${gridLines}${bars}${labels}${xLabels}</svg>`;
}
/* Gráfico de barras (Contados por Dia) pro boletim, com a mesma linha de
   meta tracejada do painel do Dashboard — SVG estático, cores fixas. */
function irBuildContadosPorDiaSvg(rows, meta, opts){
  opts = opts||{};
  const colors = opts.colors || {bar:'#FA4616', grid:'#E4E7EE', axis:'#6B7280', label:'#1D1F2A', meta:'#001A72'};
  // W fixo = mesma largura útil do painel do boletim (ver comentário em irBuildLogBarChartSvg).
  const W = 800, H = 260;
  const padL = 14, padR = 14, padT = 36, padB = 32;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  // Slot mínimo por dia (data "dd/mm" + valor acima, sem colar no vizinho) — é uma
  // imagem estática (sem como rolar como no Dashboard ao vivo), então em vez de
  // espremer todo mundo até ficar ilegível, mostra só os últimos N dias, que são os
  // mais relevantes pro acompanhamento do ciclo.
  const MIN_SLOT = 34;
  const maxDias = Math.max(1, Math.floor(plotW/MIN_SLOT));
  const rowsVisiveis = rows.length > maxDias ? rows.slice(rows.length-maxDias) : rows;
  const omitidos = rows.length - rowsVisiveis.length;
  const n = rowsVisiveis.length;
  const max = Math.max(1, meta, ...rowsVisiveis.map(r=>r.total));
  const barW = Math.min(50, plotW/n*0.7);
  let bars = '', labels = '', xLabels = '';
  rowsVisiveis.forEach((r,i)=>{
    const cx = padL + (i+0.5)*(plotW/n);
    const bh = (r.total/max)*plotH;
    const bx = cx-barW/2, by = padT+plotH-bh;
    bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${colors.bar}" rx="2"/>`;
    labels += `<text x="${cx.toFixed(1)}" y="${(by-6).toFixed(1)}" font-size="11" text-anchor="middle" fill="${colors.label}" font-weight="700">${irFmtInt(r.total)}</text>`;
    const dia = new Date(r.dia+'T00:00:00');
    xLabels += `<text x="${cx.toFixed(1)}" y="${H-12}" font-size="11.5" text-anchor="middle" fill="${colors.axis}" font-weight="600">${String(dia.getDate()).padStart(2,'0')}/${String(dia.getMonth()+1).padStart(2,'0')}</text>`;
  });
  const metaY = padT+plotH-(meta/max)*plotH;
  const metaLine = `<line x1="${padL}" y1="${metaY.toFixed(1)}" x2="${W-padR}" y2="${metaY.toFixed(1)}" stroke="${colors.meta}" stroke-width="1.5" stroke-dasharray="5 4"/>
    <text x="${W-padR}" y="${(metaY-6).toFixed(1)}" font-size="11.5" text-anchor="end" fill="${colors.meta}" font-weight="700">Meta ${irFmtInt(meta)}</text>`;
  const notaOmitidos = omitidos>0 ? `<text x="${padL}" y="14" font-size="11" fill="${colors.axis}">Mostrando os últimos ${n} de ${rows.length} dias</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;">${notaOmitidos}${bars}${labels}${xLabels}${metaLine}</svg>`;
}
/* Gráfico de rosca (donut) genérico — usado no "Status do Inventário" do
   Dashboard e no boletim. Cores em hex/var explícitos por parâmetro (não
   depende do tema) pra funcionar igual em qualquer contexto. */
/* Velocímetro (meio-círculo) — usado no painel "Saúde do Estoque" do Dashboard. */
function irGaugeSvg(pct, opts){
  opts = opts||{};
  const size = opts.size||220, stroke = opts.stroke||22;
  const p = Math.max(0, Math.min(1, pct));
  const cx = size/2, cy = size*0.56, r = (size-stroke)/2 - 4;
  const color = opts.color||'var(--orange)', track = opts.track||'var(--surface2)', textColor = opts.textColor||'var(--ink)';
  const angle = Math.PI - p*Math.PI;
  const polar = ang=>({x:cx+r*Math.cos(ang), y:cy-r*Math.sin(ang)});
  const startPt = polar(Math.PI), endPt = polar(0), valPt = polar(angle);
  const bgArc = `M${startPt.x.toFixed(1)},${startPt.y.toFixed(1)} A${r},${r} 0 0 1 ${endPt.x.toFixed(1)},${endPt.y.toFixed(1)}`;
  // O arco do velocímetro nunca passa de 180°, então o large-arc-flag é sempre 0
  // (só seria 1 se o trecho desenhado pudesse ultrapassar meia volta).
  const valArc = `M${startPt.x.toFixed(1)},${startPt.y.toFixed(1)} A${r},${r} 0 0 1 ${valPt.x.toFixed(1)},${valPt.y.toFixed(1)}`;
  return `<svg viewBox="0 0 ${size} ${(size*0.62).toFixed(0)}" width="${size}" height="${(size*0.62).toFixed(0)}">
    <path d="${bgArc}" fill="none" stroke="${track}" stroke-width="${stroke}" stroke-linecap="round"/>
    ${p>0 ? `<path d="${valArc}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>` : ''}
    <text x="${cx}" y="${cy-16}" text-anchor="middle" font-size="${Math.round(size*0.16)}" font-weight="800" fill="${textColor}">${irFmtPct(p)}</text>
    ${opts.label ? `<text x="${cx}" y="${cy+6}" text-anchor="middle" font-size="${Math.round(size*0.058)}" font-weight="700" fill="${color}">${irEsc(opts.label)}</text>` : ''}
  </svg>`;
}
// Saúde do Estoque = média das 3 acurácias já mostradas nos blocos (Peças/Local/Valor) —
// visão rápida de 1 número só pra saber se o ciclo está indo bem.
function irCalcSaudeEstoque(ind){ return (ind.acuraciaPecas + ind.acuraciaLocal + ind.acuraciaValor) / 3; }
function irRenderSaudeEstoquePanel(ind){
  const saude = irCalcSaudeEstoque(ind);
  const critico = ind.meta - 0.10;
  const cor = saude>=ind.meta ? 'var(--success)' : (saude>=critico ? 'var(--orange)' : 'var(--danger)');
  const statusTxt = saude>=ind.meta ? 'Saudável' : (saude>=critico ? 'Atenção' : 'Crítico');
  return `<div class="panel">
    <h3>Saúde do Estoque</h3>
    <p class="panel-sub">Média entre Acurácia Peças, Local e Valor — visão rápida da saúde geral do ciclo. Meta: ${irFmtPct(ind.meta)}.</p>
    <div class="gauge-row gauge-row-solo">
      ${irGaugeSvg(saude, {color:cor, label:statusTxt, size:300})}
    </div>
  </div>`;
}
function irDonutSvg(pct, opts){
  opts = opts||{};
  const size = opts.size||190, stroke = opts.stroke||28;
  const color = opts.color||'var(--orange)', track = opts.track||'var(--surface2)', textColor = opts.textColor||'var(--ink)';
  const r = (size-stroke)/2, c = size/2, circ = 2*Math.PI*r;
  const dash = Math.max(0,Math.min(1,pct))*circ;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>
    <text x="${c}" y="${c+size*0.065}" text-anchor="middle" font-size="${Math.round(size*0.19)}" font-weight="800" fill="${textColor}">${irFmtPct(pct)}</text>
  </svg>`;
}
/* Agrupa contadosPorDia por mês (YYYY-MM) — usado pra preencher o espaço
   vazio do painel "Status do Inventário" com o total contado por mês. */
function irAgruparContadosPorMes(rows, dataAbertura){
  // Só considera meses a partir da abertura do ciclo — evita citar meses
  // fora do ciclo por causa de algum registro perdido/fora do período.
  const mesMin = dataAbertura ? String(dataAbertura).slice(0,7) : null;
  const map = new Map();
  for(const r of rows||[]){
    const mes = r.dia.slice(0,7);
    if(mesMin && mes<mesMin) continue;
    map.set(mes, (map.get(mes)||0)+r.total);
  }
  return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([mes,total])=>{
    const nomeRaw = new Date(mes+'-01T00:00:00').toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
    return {mes, label: nomeRaw.charAt(0).toUpperCase()+nomeRaw.slice(1), total};
  });
}
function irRenderStatusInventarioPanel(ind){
  const total = ind.locaisCongelados||0, contados = ind.locaisContadosTotal||0;
  const pct = total>0 ? contados/total : 0;
  const porMes = irAgruparContadosPorMes(ind.contadosPorDia, IR.cicloAtivo && IR.cicloAtivo.dataAbertura);
  const maxMes = Math.max(1, ...porMes.map(m=>m.total));
  return `<div class="panel">
    <h3>Status do Inventário</h3>
    <p class="panel-sub">Percentual de locais já contados em relação ao total orçado do ciclo.</p>
    <div class="status-donut-row">
      ${irDonutSvg(pct)}
      <div class="status-donut-stats">
        <div class="status-donut-stat"><div class="n mono">${irFmtInt(total)}</div><div class="l">Locais totais (orçados)</div></div>
        <div class="status-donut-stat"><div class="n mono good">${irFmtInt(contados)}</div><div class="l">Locais contados</div></div>
        <div class="status-donut-stat"><div class="n mono bad">${irFmtInt(total-contados)}</div><div class="l">Ainda não contados</div></div>
      </div>
      ${porMes.length ? `<div class="status-month-list">
        <div class="status-month-title">Locais contados por mês</div>
        ${porMes.map(m=>`<div class="status-month-row">
          <div class="status-month-label">${irEsc(m.label)}</div>
          <div class="status-month-track"><div class="status-month-fill" style="width:${Math.round(m.total/maxMes*100)}%;"></div></div>
          <div class="status-month-val mono">${irFmtInt(m.total)}</div>
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}
function irShowLogTooltip(ev, chave){
  const r = (IR._porLogMap||new Map()).get(chave);
  const tt = document.getElementById('irChartTooltip');
  if(!tt || !r) return;
  tt.innerHTML = `<div class="ct-title">${irEsc(chave)}</div>
    <table>
      <tbody>
        <tr><td>Peças</td><td class="mono">${irFmtPct(r.acuraciaPecas)}</td></tr>
        <tr><td>Posições</td><td class="mono">${irFmtPct(r.acuraciaPosicoes)}</td></tr>
        <tr><td>Valores</td><td class="mono">${irFmtPct(r.acuraciaValor)}</td></tr>
        <tr><td>Locais contados</td><td class="mono">${irFmtInt(r.locaisContados)} de ${irFmtInt(r.locaisOrcados)}</td></tr>
        <tr><td>NET</td><td class="mono">${irFmtMoney(r.valorDivergenteLiquido)}</td></tr>
      </tbody>
    </table>`;
  tt.classList.remove('hidden');
  irMoveDiaTooltip(ev);
}
function irRenderContadosPorDiaPanel(ind){
  const rows = ind.contadosPorDia||[];
  if(!rows.length) return `<div class="panel"><h3>Contados por Dia</h3><p class="field-hint">Nenhuma contagem registrada ainda.</p></div>`;
  const max = Math.max(1, IR_META_DIARIA, ...rows.map(r=>r.total));
  const metaPct = Math.min(100, Math.round(IR_META_DIARIA/max*100));
  IR._porDiaRua = ind.porDiaRua||{};
  return `<div class="panel">
    <h3>Contados por Dia</h3>
    <div class="bi-vbars bi-vbars-meta bi-vbars-scroll">
      <div class="bi-vbar-meta-line" style="bottom:${metaPct}%;"><span>Meta ${irFmtInt(IR_META_DIARIA)}</span></div>
      ${rows.map(r=>`<div class="bi-vbar-col" onmouseenter="irShowDiaTooltip(event,'${r.dia}')" onmousemove="irMoveDiaTooltip(event)" onmouseleave="irHideDiaTooltip()">
        <div class="bi-vbar-val">${irFmtInt(r.total)}</div>
        <div class="bi-vbar orange" style="height:${Math.round(r.total/max*100)}%;"></div>
        <div class="bi-vbar-label">${new Date(r.dia+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</div>
      </div>`).join('')}
    </div>
  </div>`;
}
function irShowDiaTooltip(ev, dia){
  const rows = (IR._porDiaRua||{})[dia]||[];
  const tt = document.getElementById('irChartTooltip');
  if(!tt) return;
  const totalLocais = rows.reduce((s,r)=>s+r.locais,0);
  const totalPecas = rows.reduce((s,r)=>s+r.pecasContadas,0);
  const totalDiv = rows.reduce((s,r)=>s+r.pecasDivergentes,0);
  const dataLabel = new Date(dia+'T00:00:00').toLocaleDateString('pt-BR');
  tt.innerHTML = `<div class="ct-title">${dataLabel}</div>
    <table><thead><tr><th>Rua</th><th>Locais</th><th>Peças</th><th>Peças Div.</th></tr></thead>
    <tbody>${rows.length ? rows.map(r=>`<tr><td>${irEsc(r.rua)}</td><td class="mono">${irFmtInt(r.locais)}</td><td class="mono">${irFmtInt(r.pecasContadas)}</td><td class="mono">${irFmtInt(r.pecasDivergentes)}</td></tr>`).join('') : '<tr><td colspan="4">Sem detalhe</td></tr>'}</tbody>
    <tfoot><tr><td>Total</td><td class="mono">${irFmtInt(totalLocais)}</td><td class="mono">${irFmtInt(totalPecas)}</td><td class="mono">${irFmtInt(totalDiv)}</td></tr></tfoot>
    </table>`;
  tt.classList.remove('hidden');
  irMoveDiaTooltip(ev);
}
function irMoveDiaTooltip(ev){
  const tt = document.getElementById('irChartTooltip');
  if(!tt || tt.classList.contains('hidden')) return;
  const pad = 14;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  const rect = tt.getBoundingClientRect();
  if(x + rect.width > window.innerWidth) x = ev.clientX - rect.width - pad;
  if(y + rect.height > window.innerHeight) y = ev.clientY - rect.height - pad;
  tt.style.left = x+'px';
  tt.style.top = y+'px';
}
function irHideDiaTooltip(){
  const tt = document.getElementById('irChartTooltip');
  if(tt) tt.classList.add('hidden');
}
function irRenderRuasMaisDivergentesPanel(ind){
  const rows = (ind.porRua||[]).filter(r=>r.chave!=='(sem rua)').slice().sort((a,b)=>b.pecasDivergentes-a.pecasDivergentes);
  if(!rows.length) return `<div class="panel"><h3>Ruas mais divergentes</h3><p class="field-hint">Nenhuma divergência registrada ainda.</p></div>`;
  return `<div class="panel">
    <h3>Ruas mais divergentes</h3>
    <p class="panel-sub">Todas as ruas, ordenadas por peças divergentes absolutas (da maior para a menor).</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Rua</th><th>Peças Divergentes</th><th>Locais Divergentes</th><th>Valor Divergente</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td class="mono">${irEsc(r.chave)}</td>
        <td class="mono">${irFmtInt(r.pecasDivergentes)}</td>
        <td class="mono">${irFmtInt(r.locaisDivergentes)}</td>
        <td class="mono">${irFmtMoney(r.valorDivergenteAbsoluto)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
// Calcula o saldo líquido por item (peças e valor) direto das divergências carregadas
// do ciclo ativo — não depende de campos cacheados nos indicadores, então funciona
// mesmo em ciclos processados antes desses campos existirem (sem precisar reprocessar).
function irCalcItemSaldo(divergencias){
  const map = new Map();
  for(const d of divergencias||[]){
    if(d.diferenca===0) continue;
    let g = map.get(d.item);
    if(!g){ g = {item:d.item, descricao:d.itemNome, saldoQtd:0, saldoValor:0}; map.set(d.item, g); }
    g.saldoQtd += d.diferenca;
    g.saldoValor += d.vlDivergencia;
  }
  const itens = Array.from(map.values());
  return {
    topItensPositivos: itens.filter(i=>i.saldoQtd>0).sort((a,b)=>b.saldoQtd-a.saldoQtd).slice(0,20),
    topItensNegativos: itens.filter(i=>i.saldoQtd<0).sort((a,b)=>a.saldoQtd-b.saldoQtd).slice(0,20),
    topItensPositivosValor: itens.filter(i=>i.saldoValor>0).sort((a,b)=>b.saldoValor-a.saldoValor).slice(0,20),
    topItensNegativosValor: itens.filter(i=>i.saldoValor<0).sort((a,b)=>a.saldoValor-b.saldoValor).slice(0,20)
  };
}
// Alterna a lista "extra" (itens além dos primeiros visíveis) de um painel de itens
// mais divergentes — usado pra não deixar o Dashboard gigante por padrão.
function irToggleCollapse(id, btn){
  const el = document.getElementById(id);
  if(!btn.dataset.moreLabel) btn.dataset.moreLabel = btn.textContent;
  const abrir = el.style.display === 'none';
  el.style.display = abrir ? 'block' : 'none';
  btn.textContent = abrir ? 'Ver menos' : btn.dataset.moreLabel;
}
function irRenderTopItensPanel(saldo, kind){
  const isValor = kind==='valor';
  const pos = (isValor ? saldo.topItensPositivosValor : saldo.topItensPositivos) || [];
  const neg = (isValor ? saldo.topItensNegativosValor : saldo.topItensNegativos) || [];
  const titulo = isValor ? 'Itens mais Divergentes (Valor)' : 'Itens mais Divergentes (Peças)';
  const fmt = isValor ? irFmtMoney : irFmtInt;
  const getVal = i => isValor ? i.saldoValor : i.saldoQtd;
  if(!pos.length && !neg.length) return `<div class="panel"><h3>${titulo}</h3><p class="field-hint">Nenhuma divergência registrada ainda.</p></div>`;
  const maxAbs = Math.max(1, ...pos.map(getVal), ...neg.map(i=>Math.abs(getVal(i))));
  const VISIVEL = 8;
  const row = (i, cls)=>`<div class="bi-hbar-row${isValor?' bi-hbar-row-money':''}">
      <div class="bi-hbar-label" title="${irEsc(i.item)} — ${irEsc(i.descricao)}"><span class="mono">${irEsc(i.item)}</span> — ${irEsc(i.descricao||i.item)}</div>
      <div class="bi-hbar-track"><div class="bi-hbar-fill ${cls}" style="width:${Math.round(Math.abs(getVal(i))/maxAbs*100)}%;"></div></div>
      <div class="bi-hbar-val">${getVal(i)>0?'+':''}${fmt(getVal(i))}</div>
    </div>`;
  const list = (items, cls)=>{
    if(!items.length) return '<p class="field-hint">Nenhum.</p>';
    const visiveis = items.slice(0, VISIVEL).map(i=>row(i,cls)).join('');
    const resto = items.slice(VISIVEL);
    if(!resto.length) return visiveis;
    const uid = 'ir-col-'+Math.random().toString(36).slice(2,9);
    return `${visiveis}<div id="${uid}" style="display:none;">${resto.map(i=>row(i,cls)).join('')}</div>
      <button class="btn-link" style="margin-top:4px;" onclick="irToggleCollapse('${uid}', this)">Ver mais (+${resto.length})</button>`;
  };
  return `<div class="panel">
    <h3>${titulo}</h3>
    <p class="panel-sub">${isValor ? 'Soma líquida do valor divergente por item, no ciclo.' : 'Soma líquida da diferença de quantidade por item, no ciclo.'}</p>
    <div class="bi-grid-2">
      <div><p class="field-hint" style="margin-bottom:6px;font-weight:700;color:var(--success);">MAIS SOBRA (saldo positivo)</p>${list(pos,'pos')}</div>
      <div><p class="field-hint" style="margin-bottom:6px;font-weight:700;color:var(--danger);">MAIS FALTA (saldo negativo)</p>${list(neg,'neg')}</div>
    </div>
  </div>`;
}
/* ============================================================
   RELATÓRIO PARA E-MAIL (impressão / salvar como PDF)
   ============================================================ */
// Helpers de markup do boletim (imagem gerada por html2canvas) — compartilhados entre
// o boletim geral (irGerarRelatorioEmail) e outros exports de imagem (ex.: produtividade).
const rpTile = (icon, val, label, cls, hint)=>`<div class="rp-tile">
  <div class="rp-tile-num ${cls||''}">${val}</div>
  <div class="rp-tile-label">${label}</div>
  ${hint?`<div class="rp-tile-hint">${hint}</div>`:''}
</div>`;
const rpBlock = (theme, icon, title, tilesHtml)=>`<div class="rp-block theme-${theme}">
  <div class="rp-block-header"><span class="rp-bh-icon">${icon}</span><span class="rp-bh-title">${title}</span></div>
  <div class="rp-block-body">${tilesHtml}</div>
</div>`;
const rpSectionTitle = (icon, texto, nota)=>`<div class="rp-section-title"><span class="rp-st-icon">${icon}</span><span class="rp-st-text">${texto}</span>${nota?`<span class="rp-st-note">${nota}</span>`:''}</div>`;
function irGerarRelatorioEmail(){
  const ind = IR.indicadores, c = IR.cicloAtivo;
  if(!ind || !c){ irShowToast('Sem dados de ciclo pra gerar relatório.', true); return; }
  const agora = new Date().toLocaleString('pt-BR');
  const metaHint = `Meta: ${irFmtPct(ind.meta)}`;
  const sectionTitle = rpSectionTitle;
  // Cor da célula de acurácia: amarelo bem em cima da meta, vermelho abaixo,
  // verde acima — pedido explícito do usuário (ex.: meta 97% → 97% = amarelo).
  const rpAcColor = (val, meta)=>{
    const diff = val - meta;
    if(Math.abs(diff) < 0.0015) return '#C9A227';
    return diff > 0 ? '#1F8A52' : '#C0392B';
  };
  const rpAcTd = (val, meta)=>`<td style="color:${rpAcColor(val, meta)};font-weight:700;">${irFmtPct(val)}</td>`;

  const blocoPecas = rpBlock('orange','📦','Peças',
    rpTile('🎯', irFmtPct(ind.acuraciaPecas), 'Acurácia Peças', ind.acuraciaPecas>=ind.meta?'good':'bad', metaHint) +
    rpTile('📦', irFmtInt(ind.pecasContadas), 'Peças Contadas', '', 'total físico') +
    rpTile('⚠️', irFmtInt(ind.pecasDivergentes), 'Peças Divergentes', 'bad', irFmtInt(ind.itensDivergentes)+' itens')
  );
  const blocoLocais = rpBlock('blue','📍','Locais',
    rpTile('🎯', irFmtPct(ind.acuraciaLocal), 'Acurácia Local', ind.acuraciaLocal>=ind.meta?'good':'bad', metaHint) +
    rpTile('✅', irFmtInt(ind.locaisConcluidos), 'Concluídos', '', 'de '+irFmtInt(ind.locaisContadosTotal)+' contados') +
    rpTile('⏳', irFmtInt(ind.locaisPendentes), 'Pendentes', 'bad', irFmtInt(ind.qtdRecontagens)+' recontagens')
  );
  const blocoValor = rpBlock('black','💰','Valor',
    rpTile('🎯', irFmtPct(ind.acuraciaValor), 'Acurácia Valor', ind.acuraciaValor>=ind.meta?'good':'bad', metaHint) +
    rpTile('💸', irFmtMoney(ind.valorDivergenteAbsoluto), 'Divergente (abs.)', 'bad', 'soma absoluta') +
    rpTile('🧮', irFmtMoney(ind.valorDivergenteLiquido), 'Divergente (líq.)', '', 'ganho − perda')
  );
  const blocoCiclo = rpBlock('neutral','🔄','Ciclo',
    rpTile('📊', irFmtPct(ind.andamentoCiclo), 'Andamento', '', irFmtInt(ind.locaisConcluidos)+' de '+irFmtInt(ind.locaisCongelados)) +
    rpTile('📅', ind.diasRestantes===null?'—':irFmtInt(ind.diasRestantes), 'Dias Restantes', '', 'dias úteis · exclui feriados') +
    rpTile('⚡', irFmtPct(ind.eficiencia), 'Eficiência', ind.eficiencia>=0.8?'good':(ind.eficiencia<0.5?'bad':''), 'qualidade x velocidade')
  );

  const rua = (ind.porRua||[]).filter(r=>r.chave!=='(sem rua)').slice().sort((a,b)=>b.pecasDivergentes-a.pecasDivergentes);
  const rowsLog = irFiltrarLogsValidos(ind.porLog);
  const rowsLogComTotal = rowsLog.length ? [...rowsLog, irCalcLogTotal(rowsLog)] : [];
  const pctContagem = ind.locaisCongelados>0 ? ind.locaisContadosTotal/ind.locaisCongelados : 0;
  const rpDonutColors = {color:'#FA4616', track:'#EEF0F4', textColor:'#1D1F2A'};
  const rpLogColors = {pecas:'#FA4616', posicoes:'#001A72', valor:'#1D1F2A', grid:'#E4E7EE', axis:'#6B7280'};
  const porMes = irAgruparContadosPorMes(ind.contadosPorDia, c.dataAbertura);
  const maxMes = Math.max(1, ...porMes.map(m=>m.total));
  const html = `<div class="rp-page">
    <div class="rp-hero">
      <div class="rp-hero-top">
        <img src="brand/Logo_LDM_hor_2.png" alt="Loja do Mecânico" class="rp-hero-logo">
        <div class="rp-hero-status">${c.status==='aberto'?'Ciclo em andamento':'Ciclo encerrado'}</div>
      </div>
      <div class="rp-hero-badge">Boletim de Inventário Rotativo</div>
      <h1>Andamento do ${irCicloLabel(c)}</h1>
      <p>Loja do Mecânico · Centro de Distribuição Cajamar</p>
      <div class="rp-hero-meta">
        <span>Gerado em ${agora}</span>
        <span>Abertura ${irFmtDate(c.dataAbertura)}</span>
        <span>Término previsto ${irFmtDate(c.dataPrevistaTermino)}</span>
      </div>
    </div>
    <div class="rp-body">

    <div class="rp-blocks">
      ${blocoPecas}${blocoLocais}${blocoValor}${blocoCiclo}
    </div>

    ${sectionTitle('🟡','Status do Inventário','percentual de locais contados')}
    <div class="rp-panel rp-panel-pad">
      <div class="rp-donut-row">
        ${irDonutSvg(pctContagem, rpDonutColors)}
        <div class="rp-donut-stats">
          <div class="rp-donut-stat"><div class="n">${irFmtInt(ind.locaisCongelados)}</div><div class="l">Locais totais (orçados)</div></div>
          <div class="rp-donut-stat"><div class="n good">${irFmtInt(ind.locaisContadosTotal)}</div><div class="l">Locais contados</div></div>
          <div class="rp-donut-stat"><div class="n bad">${irFmtInt(ind.locaisCongelados-ind.locaisContadosTotal)}</div><div class="l">Ainda não contados</div></div>
        </div>
        ${porMes.length ? `<div class="rp-month-list">
          <div class="rp-month-title">Locais contados por mês</div>
          ${porMes.map(m=>`<div class="rp-month-row">
            <div class="rp-month-label">${irEsc(m.label)}</div>
            <div class="rp-month-track"><div class="rp-month-fill" style="width:${Math.round(m.total/maxMes*100)}%;"></div></div>
            <div class="rp-month-val">${irFmtInt(m.total)}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>

    ${rowsLog.length ? `${sectionTitle('📊','Acurácias por Log','peças, posições e valores — rótulo mostra a % de cada barra')}
    <div class="rp-panel rp-panel-pad">
      ${irBuildLogBarChartSvg(rowsLogComTotal, {colors:rpLogColors})}
      <p class="rp-chart-legend">
        <span style="color:${rpLogColors.pecas};">■</span> Peças &nbsp;
        <span style="color:${rpLogColors.posicoes};">■</span> Posições &nbsp;
        <span style="color:${rpLogColors.valor};">■</span> Valores
      </p>
    </div>

    ${sectionTitle('📶','Contagem por Log','% de locais contados sobre o orçado, por log')}
    <div class="rp-panel rp-panel-pad">
      ${rowsLog.map(r=>`<div class="rp-hbar-row">
        <div class="rp-hbar-label">${irEsc(r.chave)}</div>
        <div class="rp-hbar-track"><div class="rp-hbar-fill" style="width:${Math.round(Math.min(1,r.pctContado)*100)}%;"></div></div>
        <div class="rp-hbar-val">${irFmtPct(r.pctContado)}</div>
      </div>`).join('')}
    </div>` : ''}

    ${ind.contadosPorDia && ind.contadosPorDia.length ? `${sectionTitle('📅','Contados por Dia','locais contados por dia · linha tracejada = meta diária')}
    <div class="rp-panel rp-panel-pad">
      ${irBuildContadosPorDiaSvg(ind.contadosPorDia, IR_META_DIARIA)}
    </div>` : ''}

    ${sectionTitle('🛣️','Ruas mais divergentes','todas as ruas, por peças divergentes')}
    <div class="rp-panel"><table class="rp-table">
      <thead><tr><th>Rua</th><th>Peças divergentes</th><th>Locais divergentes</th><th>Valor divergente</th><th>Acurácia Peças</th><th>Acurácia Locais</th><th>Acurácia Valor</th></tr></thead>
      <tbody>${rua.map(r=>`<tr>
        <td>${irEsc(r.chave)}</td>
        <td>${irFmtInt(r.pecasDivergentes)}</td>
        <td>${irFmtInt(r.locaisDivergentes)}</td>
        <td>${irFmtMoney(r.valorDivergenteAbsoluto)}</td>
        ${rpAcTd(r.acuraciaPecas, ind.meta)}
        ${rpAcTd(r.acuraciaPosicoes, ind.meta)}
        ${rpAcTd(r.acuraciaValor, ind.meta)}
      </tr>`).join('') || '<tr><td colspan="7">Sem divergências registradas.</td></tr>'}</tbody>
    </table></div>

    </div>
  </div>`;
  irBaixarBoletimImagem(html, `Boletim_Ciclo_${c.numero}_${new Date().toISOString().slice(0,10)}.png`);
}
async function irBaixarBoletimImagem(html, nomeArquivo){
  if(typeof html2canvas==='undefined'){ irShowToast('Não consegui carregar o gerador de imagem (sem internet?).', true); return; }
  const area = document.getElementById('irPrintArea');
  area.innerHTML = html;
  // Cobre a tela inteira (em vez de posicionar fora da viewport, que causava o
  // html2canvas "vazar" pedaços do menu/sidebar na imagem capturada) — assim a
  // captura fica isolada, só com o conteúdo do boletim.
  // align-items:flex-start é essencial aqui: sem isso, o align-items:stretch padrão do
  // flex esticava (e limitava) a altura do .rp-page à viewport, cortando o boletim pela
  // metade na imagem capturada pelo html2canvas.
  area.style.cssText = 'display:flex; justify-content:center; align-items:flex-start; position:fixed; inset:0; z-index:9999; overflow:auto; background:#F6F7FA;';
  irShowToast('Gerando boletim...');
  // O zoom da tela (document.body.style.zoom, o controle no canto inferior) é uma
  // propriedade CSS não padrão que o html2canvas não sabe medir — com ele diferente
  // de 100% a métrica de texto do canvas saía errada e as palavras vinham coladas,
  // sem espaço, na imagem capturada. Zera o zoom só durante a captura e restaura
  // (mesmo em caso de erro) logo depois.
  const zoomOriginal = document.body.style.zoom;
  document.body.style.zoom = 1;
  try{
    await new Promise(r=>setTimeout(r, 60)); // deixa o layout assentar antes de capturar
    const alvo = area.querySelector('.rp-page');
    const canvas = await html2canvas(alvo, {
      backgroundColor:'#F6F7FA', scale:3, useCORS:true,
      width: alvo.scrollWidth, height: alvo.scrollHeight,
      windowWidth: alvo.scrollWidth, windowHeight: alvo.scrollHeight
    });
    const blob = await new Promise(resolve=>canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeArquivo;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);

    const numero = IR.cicloAtivo ? IR.cicloAtivo.numero : '';
    const assunto = `Boletim Inventário Rotativo — Ciclo ${numero}`;
    let compartilhou = false;
    // Se o navegador suportar compartilhar arquivo (Web Share API), abre direto
    // a folha de compartilhamento nativa — o usuário escolhe o e-mail e já
    // manda com a imagem anexada, só falta escolher os destinatários.
    if(navigator.canShare){
      try{
        const file = new File([blob], nomeArquivo, {type:'image/png'});
        if(navigator.canShare({files:[file]})){
          await navigator.share({files:[file], title:assunto, text:assunto});
          compartilhou = true;
        }
      }catch(shareErr){
        if(shareErr && shareErr.name==='AbortError') compartilhou = true; // usuário cancelou, não é erro
      }
    }
    if(!compartilhou){
      // Sem suporte a compartilhar arquivo: abre um rascunho de e-mail vazio
      // (sem destinatário) pra o usuário só preencher quem recebe e anexar a
      // imagem que já foi baixada — o mailto não permite anexar automaticamente.
      const corpo = `Segue o boletim do Ciclo ${numero}.\n\nAnexe o arquivo "${nomeArquivo}" (baixado agora na pasta de downloads) antes de enviar.`;
      window.open(`mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`, '_blank');
      irShowToast('✓ Boletim baixado e rascunho de e-mail aberto — anexe a imagem e adicione os destinatários.');
    } else {
      irShowToast('✓ Boletim pronto — escolha os destinatários na tela de compartilhamento.');
    }
  }catch(err){
    irShowToast('Erro ao gerar o boletim: '+err.message, true);
  }finally{
    document.body.style.zoom = zoomOriginal;
    area.style.cssText = '';
    area.innerHTML = '';
  }
}
/* ============================================================
   QRY410 — PERDAS E GANHOS NO CD
   Independente do ciclo rotativo (por ano, não por cicloId) — ver worker.js
   runPipeline410() pras regras de negócio (Id Depósito 21 fora, Saída = negativo,
   legenda de motivos que entram ou não no NET).
   ============================================================ */
function irOnFile410(file){ if(!file) return; IR.net410File = file; irRenderView(); }
function irOnDropFile410(e){ e.preventDefault(); const file = e.dataTransfer.files[0]; if(file) irOnFile410(file); }
function irRemoveFile410(){ IR.net410File = null; irRenderView(); }
async function irSetNet410Ano(ano){
  ano = parseInt(ano, 10);
  IR.net410AnoSel = ano;
  IR.net410Data = await irGetNet410(ano);
  irSetNet410MesDefault();
  irRenderView();
}
// Mês "atual" = o mês mais recente com movimento nos dados importados (não a data de
// hoje — a QRY410 pode não ter sido atualizada até o mês corrente).
function irSetNet410MesDefault(){
  const rows = (IR.net410Data && IR.net410Data.porMes) || [];
  IR.net410MesSel = rows.length ? rows[rows.length-1].mes : null;
}
function irSetNet410Mes(mes){ IR.net410MesSel = mes; irRenderView(); }
function irProcessar410(){
  if(IR.net410Processing || !IR.net410File) return;
  IR.net410Processing = true; IR.net410Progress = {stage:'Lendo arquivo...', pct:0};
  irRenderView();
  const file = IR.net410File;
  file.arrayBuffer().then(buf410=>{
    const worker = new Worker('js/worker.js');
    worker.onmessage = async (e)=>{
      const msg = e.data;
      if(msg.type==='progress'){ IR.net410Progress = {stage:msg.stage, pct:msg.pct}; irUpdateProgressUI410(); }
      else if(msg.type==='error410'){
        IR.net410Processing=false; worker.terminate();
        irShowToast('Erro no processamento da QRY410: '+msg.message, true); irRenderView();
      } else if(msg.type==='done410'){
        IR.net410Processing = false; worker.terminate();
        for(const ano of msg.anos) await irSaveNet410(ano, msg.resumos[ano]);
        IR.net410Anos = await irGetAllNet410Anos();
        IR.net410File = null;
        IR.net410AnoSel = msg.anos[0];
        IR.net410Data = await irGetNet410(IR.net410AnoSel);
        irSetNet410MesDefault();
        irShowToast('✓ QRY410 processada: '+msg.anos.map(a=>a+'').join(', ')+'.');
        irRenderView();
      }
    };
    worker.onerror = (err)=>{ IR.net410Processing=false; irShowToast('Erro no worker (QRY410): '+err.message, true); irRenderView(); };
    worker.postMessage({type:'process410', buf410}, [buf410]);
  }).catch(err=>{
    IR.net410Processing=false; irShowToast('Erro ao ler arquivo: '+err.message, true); irRenderView();
  });
}
/* Painel de importação da QRY410 — fica na aba Importação (não na NET) pra não mexer
   no layout do Dashboard/NET com mais um dropzone. Processamento independente do
   'PROCESSAR CICLO' (ver irProcessar410). */
function irRenderNet410ImportPanel(){
  const dz = `<div class="dropzone ${IR.net410File?'has-file':''}" ondragover="event.preventDefault()" ondrop="irOnDropFile410(event)">
    <input type="file" id="ir-file-410" accept=".xlsx,.xls" style="display:none" onchange="irOnFile410(this.files[0])">
    <div class="dz-icon">📄</div>
    <div class="dz-title">QRY410</div>
    <div class="dz-desc">Perdas e ganhos no CD</div>
    ${IR.net410File
      ? `<div class="dz-file mono">${irEsc(IR.net410File.name)}</div><button class="btn-link" onclick="irRemoveFile410()">Remover</button>`
      : `<button class="btn btn-secondary" onclick="document.getElementById('ir-file-410').click()">Selecionar</button>`}
  </div>`;
  return `<div class="panel">
    <h3>Perdas e Ganhos no CD (QRY410)</h3>
    <p class="field-hint" style="margin-bottom:14px;">Independente do ciclo rotativo — organizado por ano, a partir da Data do Movimento. Não precisa esperar processar um ciclo: importe aqui quando quiser atualizar. O resultado aparece na aba NET.</p>
    <div class="dz-grid" style="grid-template-columns:1fr;max-width:340px;">${dz}</div>
    ${IR.net410Processing ? `
      <div class="progress-wrap">
        <div class="progress-stage">${irEsc(IR.net410Progress.stage)}</div>
        <div class="progress-track"><div class="progress-fill orange" style="width:${IR.net410Progress.pct}%"></div></div>
      </div>` : IR.net410File ? `<div class="form-actions"><button class="btn btn-primary" onclick="irProcessar410()">PROCESSAR QRY410</button></div>` : ''
    }
    ${IR.net410Anos.length ? `<p class="field-hint" style="margin-top:12px;">Anos já processados: ${IR.net410Anos.join(', ')} — <a href="#" onclick="irSwitchTab('ciclo');return false;">ver na aba NET</a>.</p>` : ''}
  </div>`;
}
function irRenderNet410Panel(){
  const d = IR.net410Data;
  const anos = IR.net410Anos;
  return `<div class="panel">
    <h3>Perdas e Ganhos no CD (QRY410)</h3>
    <p class="panel-sub">Independente do ciclo rotativo — organizado por ano. Inventário Rotativo (AIR) é só mais um dos motivos que compõem o NET, junto com auditorias, curvas etc. Importe/atualize a QRY410 na aba Importação.</p>
    ${anos.length ? `<div class="two-col" style="max-width:340px;">
      <div><label>Ano</label><select onchange="irSetNet410Ano(this.value)">
        ${anos.map(a=>`<option value="${a}" ${a===IR.net410AnoSel?'selected':''}>${a}</option>`).join('')}
      </select></div>
      <div></div>
    </div>` : `<p class="field-hint">Nenhuma QRY410 processada ainda — importe na aba <a href="#" onclick="irSwitchTab('importacao');return false;">Importação</a>.</p>`}
  </div>
  ${d ? irRenderNet410Resultado(d) : ''}`;
}
const IR_MES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const IR_MES_NOMES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
// Gráfico de colunas do NET mês a mês — barra pra cima (verde) quando positivo, pra
// baixo (vermelho) quando negativo, em volta de uma linha de base no zero.
function irBuildNetMensalBarSvg(rows, opts){
  opts = opts||{};
  // Positivo não é sinônimo de "bom" aqui (é só o sentido do saldo) — por isso não
  // usa verde. Azul (mesmo tom de "Locais/Posições" no resto do app) pra positivo,
  // vermelho pra negativo.
  const colors = opts.colors || {pos:'#001A72', neg:'#C0392B', grid:'#E4E7EE', axis:'#6B7280', label:'#1D1F2A'};
  const W = 800, H = 320;
  const padL = 14, padR = 14, padT = 26, padB = 46;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const n = rows.length;
  const maxAbs = Math.max(1, ...rows.map(r=>Math.abs(r.net)));
  const baseY = padT + plotH/2;
  // Fator 0.86 (em vez de ir até a metade inteira do plotH) garante uma folga fixa
  // entre a ponta da maior barra e o rótulo do mês no eixo X — sem isso, o rótulo de
  // valor de uma barra grande (ex.: NET de março bem negativo) ficava colado ou
  // em cima do nome do mês.
  const barMaxH = (plotH/2)*0.86;
  const barW = Math.min(56, plotW/n*0.6);
  let bars = '', labels = '', xLabels = '';
  rows.forEach((r,i)=>{
    const cx = padL + (i+0.5)*(plotW/n);
    const h = Math.abs(r.net)/maxAbs*barMaxH;
    const pos = r.net>=0;
    const by = pos ? baseY-h : baseY;
    const color = pos ? colors.pos : colors.neg;
    bars += `<rect x="${(cx-barW/2).toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="2"/>`;
    const labelY = pos ? by-6 : by+h+16;
    labels += `<text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="11" text-anchor="middle" fill="${colors.label}" font-weight="700">${irFmtMoney(r.net)}</text>`;
    xLabels += `<text x="${cx.toFixed(1)}" y="${H-14}" font-size="12" text-anchor="middle" fill="${colors.axis}" font-weight="600">${IR_MES_NOMES_ABREV[parseInt(r.mes.slice(5,7),10)-1]}</text>`;
  });
  const zeroLine = `<line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W-padR}" y2="${baseY.toFixed(1)}" stroke="${colors.grid}" stroke-width="1.5"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;">${zeroLine}${bars}${labels}${xLabels}</svg>`;
}
// Tabela do NET com um mês por coluna (visão compacta, lado a lado) — usada na aba NET
// e reaproveitada no boletim, pra bater o ano do ciclo em uma linha só, mês a mês.
function irBuildNetMensalColunasTable(d, tableCls){
  const rows = d.porMes||[];
  if(!rows.length) return '';
  return `<div class="table-wrap"><table class="${tableCls||''}">
    <thead><tr><th>Indicador</th>${rows.map(m=>`<th>${IR_MES_NOMES_ABREV[parseInt(m.mes.slice(5,7),10)-1]}</th>`).join('')}<th>Total ${d.ano}</th></tr></thead>
    <tbody><tr>
      <td style="font-weight:700;">NET</td>
      ${rows.map(m=>`<td class="mono" style="color:${m.net>=0?'var(--blue)':'var(--danger)'};font-weight:700;">${irFmtMoney(m.net)}</td>`).join('')}
      <td class="mono" style="color:${d.totalNet>=0?'var(--blue)':'var(--danger)'};font-weight:700;">${irFmtMoney(d.totalNet)}</td>
    </tr></tbody>
  </table></div>`;
}
function irRenderNet410Resultado(d){
  const rows = d.porMes||[];
  return `
    <div class="panel">
      <h3>NET mensal em colunas — ${d.ano}</h3>
      <p class="panel-sub">Mesmo valor de NET da tabela abaixo, só que com um mês por coluna pra facilitar a leitura lado a lado.</p>
      ${irBuildNetMensalBarSvg(rows)}
      ${irBuildNetMensalColunasTable(d, 'table-wide')}
    </div>
    <div class="panel">
      <h3>Net mensal — ${d.ano}</h3>
      <p class="panel-sub">Só considera motivos válidos pro NET (ver tabela por Obs abaixo). ${irFmtInt(d.linhasExcluidasDeposito21)} linha(s) do Id Depósito 21 ficaram de fora. Total de linhas do ano: ${irFmtInt(d.totalLinhas)}.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Mês</th><th>Net</th><th>Net Absoluto</th><th>Ganhos</th><th>Perdas</th></tr></thead>
        <tbody>${rows.map(m=>`<tr>
          <td>${irEsc(IR_MES_NOMES[parseInt(m.mes.slice(5,7),10)-1]||m.mes)}</td>
          <td class="mono" style="color:${m.net>=0?'var(--blue)':'var(--danger)'};font-weight:700;">${irFmtMoney(m.net)}</td>
          <td class="mono">${irFmtMoney(m.netAbs)}</td>
          <td class="mono" style="color:var(--success);">${irFmtMoney(m.ganhos)}</td>
          <td class="mono" style="color:var(--danger);">${irFmtMoney(m.perdas)}</td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);">Sem movimentos no ano</td></tr>'}</tbody>
        <tfoot><tr style="font-weight:700;">
          <td>Acumulado</td>
          <td class="mono" style="color:${d.totalNet>=0?'var(--blue)':'var(--danger)'};">${irFmtMoney(d.totalNet)}</td>
          <td class="mono">${irFmtMoney(d.totalNetAbs)}</td>
          <td class="mono" style="color:var(--success);">${irFmtMoney(d.totalGanhos)}</td>
          <td class="mono" style="color:var(--danger);">${irFmtMoney(d.totalPerdas)}</td>
        </tr></tfoot>
      </table></div>
    </div>
    <div class="panel">
      <h3>Por motivo (Obs) — ${d.ano}</h3>
      <p class="panel-sub">Todos os motivos que apareceram no ano, considerados ou não pro NET (regra: sem legenda cadastrada conta como considerado).</p>
      <div class="table-wrap"><table class="table-wide">
        <thead><tr><th>Obs</th><th>Legenda</th><th>Considerar NET?</th><th>Saída</th><th>Entrada</th><th>Total Geral</th></tr></thead>
        <tbody>${(d.porObs||[]).map(o=>`<tr>
          <td class="mono">${irEsc(o.id)}</td>
          <td>${irEsc(o.legenda)||'—'}</td>
          <td><span class="tag ${o.considerarNet?'tag-good':'tag-muted'}">${o.considerarNet?'SIM':'NÃO'}</span></td>
          <td class="mono" style="color:var(--danger);">${o.saida?irFmtMoney(o.saida):'—'}</td>
          <td class="mono" style="color:var(--success);">${o.entrada?irFmtMoney(o.entrada):'—'}</td>
          <td class="mono" style="font-weight:700;">${irFmtMoney(o.totalGeral)}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--ink-soft);">Sem movimentos no ano</td></tr>'}</tbody>
      </table></div>
    </div>
    <h3 style="margin:20px 0 -6px;">Itens que mais impactam no ano — ${d.ano}</h3>
    <div class="bi-grid-2">
      ${irRenderNet410ItensPanel(d.topItensPositivos, false, 'Soma do valor no ano ('+d.ano+'), só motivos considerados pro NET.')}
      ${irRenderNet410ItensPanel(d.topItensNegativos, true, 'Soma do valor no ano ('+d.ano+'), só motivos considerados pro NET.')}
    </div>
    ${irRenderNet410ItensMesSection(d)}
  `;
}
function irRenderNet410ItensPanel(items, negativos, subtitulo){
  items = items||[];
  const titulo = negativos ? 'Itens que mais impactam negativamente' : 'Itens que mais impactam positivamente';
  const cls = negativos ? 'neg' : 'pos';
  if(!items.length) return `<div class="panel"><h3>${titulo}</h3><p class="field-hint">Nenhum.</p></div>`;
  const maxAbs = Math.max(1, ...items.map(i=>Math.abs(i.saldoValor)));
  return `<div class="panel">
    <h3>${titulo}</h3>
    <p class="panel-sub">${irEsc(subtitulo)}</p>
    ${items.map(i=>`<div class="bi-hbar-row bi-hbar-row-money">
      <div class="bi-hbar-label" title="${irEsc(i.nome)}">${irEsc(i.nome||i.item)}</div>
      <div class="bi-hbar-track"><div class="bi-hbar-fill ${cls}" style="width:${Math.round(Math.abs(i.saldoValor)/maxAbs*100)}%;"></div></div>
      <div class="bi-hbar-val">${i.saldoValor>0?'+':''}${irFmtMoney(i.saldoValor)}</div>
    </div>`).join('')}
  </div>`;
}
/* "Por que o NET do mês está tão negativo?" — mesmo ranking de itens, mas só do mês
   selecionado (padrão: o mês mais recente com movimento nos dados importados). */
function irRenderNet410ItensMesSection(d){
  const meses = d.porMes||[];
  if(!meses.length) return '';
  const mesSel = IR.net410MesSel && meses.some(m=>m.mes===IR.net410MesSel) ? IR.net410MesSel : meses[meses.length-1].mes;
  const m = meses.find(x=>x.mes===mesSel);
  const mesLabel = IR_MES_NOMES[parseInt(mesSel.slice(5,7),10)-1]||mesSel;
  return `
    <div class="two-col" style="max-width:340px;margin:20px 0 4px;">
      <div><label>Itens que mais impactam no mês</label><select onchange="irSetNet410Mes(this.value)">
        ${meses.map(x=>`<option value="${x.mes}" ${x.mes===mesSel?'selected':''}>${irEsc(IR_MES_NOMES[parseInt(x.mes.slice(5,7),10)-1]||x.mes)} (Net: ${irFmtMoney(x.net)})</option>`).join('')}
      </select></div>
      <div></div>
    </div>
    <div class="bi-grid-2">
      ${irRenderNet410ItensPanel(m.topItensPositivos, false, 'Soma do valor em '+mesLabel+', só motivos considerados pro NET.')}
      ${irRenderNet410ItensPanel(m.topItensNegativos, true, 'Soma do valor em '+mesLabel+', só motivos considerados pro NET.')}
    </div>
  `;
}
/* ============================================================
   GESTÃO DO CICLO
   ============================================================ */
/* Aba "NET" (ex-"Gestão do Ciclo") — comparação meta x realizado do ciclo e tabela
   detalhada de NET por combinação Log/Rua/Tipo. Primeiro rascunho: layout e colunas
   ainda serão ajustados conforme o usuário revisar. */
function irRenderGestaoCiclo(){
  const c = IR.cicloAtivo, ind = IR.indicadores;
  const metaRows = ind ? [
    {label:'Acurácia Peças', meta: ind.meta, real: ind.acuraciaPecas},
    {label:'Acurácia Locais', meta: ind.meta, real: ind.acuraciaLocal},
    {label:'Acurácia Valor', meta: ind.meta, real: ind.acuraciaValor},
    {label:'Andamento do ciclo', meta: 1, real: ind.andamentoCiclo}
  ] : [];
  return `
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <h3 style="margin-bottom:4px;">${irCicloLabel(c)} — ${c.status==='aberto'?'Aberto':'Encerrado'}</h3>
          <p class="field-hint">Abertura: ${irFmtDate(c.dataAbertura)} · Término previsto: ${irFmtDate(c.dataPrevistaTermino)}${c.dataEncerramento?' · Encerrado em: '+irFmtDate(c.dataEncerramento):''}</p>
        </div>
        <div class="form-actions" style="margin:0;">
          ${c.status==='aberto' ? `<button class="btn btn-secondary" onclick="irEncerrarCiclo()">Encerrar ciclo</button>` : ''}
          <button class="btn btn-primary" onclick="irSwitchTab('importacao')">Atualizar dados do ciclo</button>
        </div>
      </div>
      ${ind ? `<div class="progress-track" style="margin-top:14px;"><div class="progress-fill" style="width:${Math.min(100,ind.andamentoCiclo*100)}%;"></div></div>
      <p class="field-hint" style="margin-top:6px;">${irFmtInt(ind.locaisConcluidos)} de ${irFmtInt(ind.locaisCongelados)} locais concluídos (${irFmtPct(ind.andamentoCiclo)})</p>` : ''}
    </div>
    ${ind ? `<div class="panel">
      <h3>Como deveria estar x Como estamos</h3>
      <p class="panel-sub">Meta do ciclo comparada ao realizado até agora.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Indicador</th><th>Deveria estar (meta)</th><th>Estamos (realizado)</th><th>Diferença</th></tr></thead>
        <tbody>
          ${metaRows.map(r=>{
            const diff = r.real - r.meta, ok = diff>=0;
            return `<tr>
              <td>${r.label}</td>
              <td class="mono">${irFmtPct(r.meta)}</td>
              <td class="mono" style="${irHeatStyle(r.real, r.meta)}">${irFmtPct(r.real)}</td>
              <td class="mono" style="color:${ok?'var(--success)':'var(--danger)'};font-weight:700;">${ok?'+':''}${irFmtPct(diff)}</td>
            </tr>`;
          }).join('')}
          <tr>
            <td>NET (divergência líquida)</td>
            <td class="mono">${irFmtMoney(0)}</td>
            <td class="mono" style="color:${Math.abs(ind.valorDivergenteLiquido)<1?'var(--success)':'var(--danger)'};font-weight:700;">${irFmtMoney(ind.valorDivergenteLiquido)}</td>
            <td class="mono">${irFmtMoney(-ind.valorDivergenteLiquido)}</td>
          </tr>
        </tbody>
      </table></div>
    </div>` : ''}
    ${irRenderNet410Panel()}
  `;
}
async function irEncerrarCiclo(){
  if(!confirm('Encerrar o ciclo '+IR.cicloAtivo.numero+'? Ele ficará registrado no histórico.')) return;
  IR.cicloAtivo.status = 'encerrado';
  IR.cicloAtivo.dataEncerramento = new Date().toISOString().slice(0,10);
  await irSaveCiclo(IR.cicloAtivo);
  IR.ciclos = await irGetAllCiclos();
  irShowToast('Ciclo encerrado.');
  irRenderView();
}

/* Versão condensada da Produtividade pro Dashboard: mesmo filtro de data (compartilha
   IR.prodFilters com a aba Produtividade completa), KPIs resumidos e top 5 do ranking —
   pensada pra caber numa tela só e servir de print rápido pro grupo. */
function irRenderDashProdutividade(){
  const contagens = irProdContagensBase(IR.dashFilters.applyProdDate);
  const p = irCalcProdutividade(contagens);
  return `<div class="panel">
    <h3>Produtividade</h3>
    <p class="panel-sub">Locais contados por colaborador, hora a hora${IR.dashFilters.applyProdDate ? ', no período selecionado acima' : ' (filtro de data desativado pra este painel)'}.</p>
    <div class="form-actions" style="margin:-6px 0 12px;"><button class="btn-link" onclick="irSwitchTab('produtividade')">Ver produtividade completa →</button></div>
    <div class="kpi-grid" style="margin-bottom:14px;">
      <div class="kpi-card orange"><div class="num mono">${irFmtInt(p.totalLocais)}</div><div class="label">Locais contados</div></div>
      <div class="kpi-card"><div class="num mono">${irFmtInt(p.totalItens)}</div><div class="label">Itens contados</div></div>
      <div class="kpi-card"><div class="num mono">${irFmtInt(p.totalPecas)}</div><div class="label">Peças contadas</div></div>
      <div class="kpi-card"><div class="num mono">${irFmtNum(p.itensPorHomemHora,1)}</div><div class="label">Itens / Homem-Hora</div></div>
    </div>
    ${irRenderProdMatriz(p, {limit:8})}
  </div>`;
}
/* ============================================================
   PRODUTIVIDADE
   ============================================================ */
function irProdSetFilter(key, val){ IR.prodFilters[key] = val; irRenderView(); }
function irProdToggleAbertura(){ IR.prodFilters.incluirAbertura = !IR.prodFilters.incluirAbertura; irRenderView(); }
function irToggleDashDateScope(key){ IR.dashFilters[key] = !IR.dashFilters[key]; irRenderView(); }
function irProdContagensBase(applyDate){
  const {de, ate, incluirAbertura} = IR.prodFilters;
  return IR.contagens.filter(c=>{
    if((incluirAbertura ? c.idConferencia<1 : c.idConferencia<=1) || !c.usuario || !c.dataInicioContagem) return false;
    if(!applyDate) return true;
    const dia = c.dataInicioContagem.slice(0,10);
    if(de && dia<de) return false;
    if(ate && dia>ate) return false;
    return true;
  });
}
function irProdContagensFiltradas(){ return irProdContagensBase(true); }
const IR_HORA_INICIO = 6;  // 06:00 — início do expediente de inventário
const IR_HORA_FIM = 21;    // último bloco de hora do expediente (21:00–22:00)
/* Calcula ranking, matriz colaborador x hora e homem-hora a partir de um conjunto de
   contagens já filtrado. "Hora-homem" = nº de blocos de hora distintos (data+hora) em
   que cada colaborador registrou ao menos 1 contagem, somado entre todos — aproximação
   simples (sem ponto eletrônico), sinalizada na tela. A matriz colaborador x hora usa
   só a hora do dia (sem data), fixada na janela 06h–22h de expediente, somando os dias
   do período filtrado na mesma coluna. */
function irCalcProdutividade(contagens){
  const porUsuario = new Map();
  const horasPorUsuario = new Map();
  const matrizLocais = new Map(); // usuario -> Map(horaDia -> Set(locais))
  for(const c of contagens){
    const horaCompleta = c.dataInicioContagem.slice(0,13); // YYYY-MM-DDTHH (p/ homem-hora)
    const horaDia = parseInt(c.dataInicioContagem.slice(11,13), 10); // 0-23 (p/ matriz)
    if(!porUsuario.has(c.usuario)) porUsuario.set(c.usuario, {usuario:c.usuario, locais:new Set(), itens:0, pecas:0, contagens:0, minutos:0, nMin:0, horas:new Set()});
    const gu = porUsuario.get(c.usuario);
    gu.locais.add(c.local); gu.itens++; gu.pecas += (c.qtFis||0); gu.contagens++; gu.horas.add(horaCompleta);
    if(c.dataInicioContagem && c.dataFimContagem){
      const ini=new Date(c.dataInicioContagem).getTime(), fim=new Date(c.dataFimContagem).getTime();
      if(fim>ini){ gu.minutos += (fim-ini)/60000; gu.nMin++; }
    }
    if(!horasPorUsuario.has(c.usuario)) horasPorUsuario.set(c.usuario, new Set());
    horasPorUsuario.get(c.usuario).add(horaCompleta);
    if(horaDia>=IR_HORA_INICIO && horaDia<=IR_HORA_FIM){
      if(!matrizLocais.has(c.usuario)) matrizLocais.set(c.usuario, new Map());
      const mu = matrizLocais.get(c.usuario);
      if(!mu.has(horaDia)) mu.set(horaDia, new Set());
      mu.get(horaDia).add(c.local);
    }
  }
  const ranking = Array.from(porUsuario.values()).map(g=>({
    usuario:g.usuario, locais:g.locais.size, itens:g.itens, pecas:g.pecas, contagens:g.contagens,
    tempoMedioMin: g.nMin>0 ? g.minutos/g.nMin : 0, horasAtivas: g.horas.size
  })).sort((a,b)=>b.locais-a.locais);
  const horasOrdenadas = [];
  for(let h=IR_HORA_INICIO; h<=IR_HORA_FIM; h++) horasOrdenadas.push(h);
  const matrizColaboradorHora = ranking.map(r=>({
    usuario: r.usuario,
    porHora: horasOrdenadas.map(h=>{
      const set = matrizLocais.has(r.usuario) ? matrizLocais.get(r.usuario).get(h) : null;
      return set ? set.size : 0;
    }),
    total: r.locais, pecas: r.pecas
  }));
  let horasHomem = 0;
  for(const set of horasPorUsuario.values()) horasHomem += set.size;
  const totalItens = contagens.length;
  const totalPecas = contagens.reduce((s,c)=>s+(c.qtFis||0),0);
  const totalLocais = new Set(contagens.map(c=>c.local)).size;
  return {
    ranking, horasOrdenadas, matrizColaboradorHora, horasHomem,
    itensPorHomemHora: horasHomem>0 ? totalItens/horasHomem : 0,
    pecasPorHomemHora: horasHomem>0 ? totalPecas/horasHomem : 0,
    totalItens, totalPecas, totalLocais
  };
}
function irRenderProdMatriz(p, opts){
  opts = opts||{};
  const linhas = opts.limit ? p.matrizColaboradorHora.slice(0, opts.limit) : p.matrizColaboradorHora;
  if(!linhas.length) return '<p class="field-hint">Nenhuma contagem no período selecionado.</p>';
  const horaLabel = h => String(h).padStart(2,'0')+'h';
  const totalPorHora = p.horasOrdenadas.map((h,i)=>linhas.reduce((s,r)=>s+r.porHora[i],0));
  const totalLocaisLinhas = linhas.reduce((s,r)=>s+r.total,0);
  const totalPecasLinhas = linhas.reduce((s,r)=>s+r.pecas,0);
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Colaborador</th>
      ${p.horasOrdenadas.map(h=>`<th class="mono">${horaLabel(h)}</th>`).join('')}
      <th>Locais</th><th>Peças</th>
    </tr></thead>
    <tbody>
      ${linhas.map(r=>`<tr>
        <td>${irEsc(r.usuario.replace(/^MECA_/,''))}</td>
        ${r.porHora.map(v=>`<td class="mono">${v>0?irFmtInt(v):'—'}</td>`).join('')}
        <td class="mono" style="font-weight:700;">${irFmtInt(r.total)}</td>
        <td class="mono">${irFmtInt(r.pecas)}</td>
      </tr>`).join('')}
      <tr>
        <td style="font-weight:700;">Total</td>
        ${totalPorHora.map(v=>`<td class="mono" style="font-weight:700;">${irFmtInt(v)}</td>`).join('')}
        <td class="mono" style="font-weight:700;">${irFmtInt(opts.limit ? totalLocaisLinhas : p.totalLocais)}</td>
        <td class="mono" style="font-weight:700;">${irFmtInt(opts.limit ? totalPecasLinhas : p.totalPecas)}</td>
      </tr>
    </tbody>
  </table></div>`;
}
function irRenderProdutividade(){
  const ind = IR.indicadores;
  if(!ind) return irEmptyState('Sem dados', 'Processe o ciclo na Importação.', "irSwitchTab('importacao')", 'Ir para Importação');
  const contagens = irProdContagensFiltradas();
  const p = irCalcProdutividade(contagens);
  const maxLocais = Math.max(1, ...p.ranking.map(r=>r.locais));
  return `
    <div class="filter-bar">
      <label style="display:inline;margin:0;text-transform:none;font-size:12px;color:var(--ink-soft);">De</label>
      <input type="date" style="width:auto;" value="${irEsc(IR.prodFilters.de)}" onchange="irProdSetFilter('de', this.value)">
      <label style="display:inline;margin:0;text-transform:none;font-size:12px;color:var(--ink-soft);">Até</label>
      <input type="date" style="width:auto;" value="${irEsc(IR.prodFilters.ate)}" onchange="irProdSetFilter('ate', this.value)">
      ${(IR.prodFilters.de||IR.prodFilters.ate) ? `<button class="btn-link" onclick="irProdSetFilter('de','');IR.prodFilters.ate='';irRenderView();">Limpar filtro</button>` : ''}
      <label style="display:flex;align-items:center;gap:5px;margin:0;text-transform:none;font-size:12px;color:var(--ink-soft);cursor:pointer;">
        <input type="checkbox" style="width:auto;" ${IR.prodFilters.incluirAbertura?'checked':''} onchange="irProdToggleAbertura()">
        Incluir contagem de abertura (rodada 1) — exemplo de visualização
      </label>
      <button class="btn btn-secondary" style="margin-left:auto;" onclick="irCompartilharProdutividade()">📤 Compartilhar produtividade da equipe</button>
    </div>
    ${IR.prodFilters.incluirAbertura ? `<p class="field-hint" style="color:var(--orange);margin:-8px 0 12px;">A rodada 1 (abertura do inventário) está incluída só para pré-visualizar o design — por padrão ela não conta como produtividade real de conferência.</p>` : ''}
    <div class="kpi-grid">
      <div class="kpi-card"><div class="num mono">${p.ranking.length}</div><div class="label">Colaboradores ativos</div></div>
      <div class="kpi-card orange"><div class="num mono">${irFmtInt(p.totalLocais)}</div><div class="label">Locais contados (distintos)</div></div>
      <div class="kpi-card"><div class="num mono">${irFmtInt(p.totalItens)}</div><div class="label">Itens contados</div></div>
      <div class="kpi-card"><div class="num mono">${irFmtInt(p.totalPecas)}</div><div class="label">Peças contadas</div></div>
      <div class="kpi-card"><div class="num mono">${irFmtNum(p.itensPorHomemHora,1)}</div><div class="label">Itens / Homem-Hora</div></div>
      <div class="kpi-card"><div class="num mono">${irFmtNum(p.pecasPorHomemHora,1)}</div><div class="label">Peças / Homem-Hora</div></div>
    </div>
    <p class="field-hint" style="margin:-8px 0 14px;">Homem-hora = nº de blocos de hora distintos em que cada colaborador registrou ao menos 1 contagem (aproximação, sem ponto eletrônico). Total no período: ${irFmtInt(p.horasHomem)} horas-homem.</p>
    <div class="panel">
      <h3>Locais por colaborador, hora a hora</h3>
      <p class="panel-sub">Cada célula é o número de locais distintos que o colaborador contou naquele horário. Janela de expediente: 06h–22h (soma os dias do período filtrado).</p>
      ${irRenderProdMatriz(p)}
    </div>
    <div class="panel">
      <h3>Ranking de colaboradores (por locais contados)</h3>
      <div class="rank-list">${p.ranking.map((r,i)=>`<div class="rank-item">
        <span class="rank-pos">${i+1}</span>
        <div class="rank-bar-wrap">
          <div class="rank-key"><span>${irEsc(r.usuario)}</span><span class="mono">${r.locais} locais · ${r.itens} itens · ${r.horasAtivas}h ativas · ${irFmtNum(r.tempoMedioMin,1)} min/contagem</span></div>
          <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${(r.locais/maxLocais*100).toFixed(0)}%;"></div></div>
        </div>
      </div>`).join('') || '<p class="field-hint">Sem contagens registradas.</p>'}</div>
    </div>
  `;
}
/* Tabela da matriz colaborador x hora no formato de imagem (rp-table), pro botão
   "Compartilhar produtividade" — mesma matriz de irRenderProdMatriz, mas com o
   markup usado nos exports de imagem (boletim). */
function irBuildProdMatrizRpTable(p){
  if(!p.matrizColaboradorHora.length) return '<p style="padding:16px;color:#6B7280;">Nenhuma contagem no período selecionado.</p>';
  const horaLabel = h => String(h).padStart(2,'0')+'h';
  const totalPorHora = p.horasOrdenadas.map((h,i)=>p.matrizColaboradorHora.reduce((s,r)=>s+r.porHora[i],0));
  return `<table class="rp-table rp-table-dense">
    <thead><tr><th>Colaborador</th>${p.horasOrdenadas.map(h=>`<th>${horaLabel(h)}</th>`).join('')}<th>Locais</th><th>Peças</th></tr></thead>
    <tbody>
      ${p.matrizColaboradorHora.map(r=>`<tr>
        <td>${irEsc(r.usuario.replace(/^MECA_/,''))}</td>
        ${r.porHora.map(v=>`<td>${v>0?irFmtInt(v):'—'}</td>`).join('')}
        <td style="font-weight:700;">${irFmtInt(r.total)}</td>
        <td>${irFmtInt(r.pecas)}</td>
      </tr>`).join('')}
      <tr>
        <td style="font-weight:700;">Total</td>
        ${totalPorHora.map(v=>`<td style="font-weight:700;">${irFmtInt(v)}</td>`).join('')}
        <td style="font-weight:700;">${irFmtInt(p.totalLocais)}</td>
        <td style="font-weight:700;">${irFmtInt(p.totalPecas)}</td>
      </tr>
    </tbody>
  </table>`;
}
/* Gera e baixa uma imagem só com a produtividade da equipe (fora do boletim
   principal) — respeita o mesmo filtro de data/abertura da aba Produtividade. */
function irCompartilharProdutividade(){
  const c = IR.cicloAtivo;
  if(!c){ irShowToast('Sem ciclo ativo.', true); return; }
  const contagens = irProdContagensFiltradas();
  const p = irCalcProdutividade(contagens);
  if(!p.ranking.length){ irShowToast('Sem contagens no período selecionado.', true); return; }
  const agora = new Date().toLocaleString('pt-BR');
  const periodoTxt = (IR.prodFilters.de||IR.prodFilters.ate)
    ? `Período: ${IR.prodFilters.de?irFmtDate(IR.prodFilters.de):'início'} a ${IR.prodFilters.ate?irFmtDate(IR.prodFilters.ate):'hoje'}`
    : 'Ciclo inteiro';
  const html = `<div class="rp-page">
    <div class="rp-hero">
      <div class="rp-hero-top">
        <img src="brand/Logo_LDM_hor_2.png" alt="Loja do Mecânico" class="rp-hero-logo">
        <div class="rp-hero-status">${irEsc(periodoTxt)}</div>
      </div>
      <div class="rp-hero-badge">Produtividade da Equipe</div>
      <h1>${irEsc(irCicloLabel(c))}</h1>
      <p>Loja do Mecânico · Centro de Distribuição Cajamar</p>
      <div class="rp-hero-meta"><span>Gerado em ${agora}</span></div>
    </div>
    <div class="rp-body">
      <div class="rp-blocks">
        ${rpBlock('orange','👥','Equipe',
          rpTile('🧑‍🔧', irFmtInt(p.ranking.length), 'Colaboradores ativos', '', '') +
          rpTile('📍', irFmtInt(p.totalLocais), 'Locais contados', '', '') +
          rpTile('📦', irFmtInt(p.totalPecas), 'Peças contadas', '', '')
        )}
        ${rpBlock('blue','⚡','Ritmo',
          rpTile('🔢', irFmtInt(p.totalItens), 'Itens contados', '', '') +
          rpTile('⏱️', irFmtNum(p.itensPorHomemHora,1), 'Itens / Homem-Hora', '', '') +
          rpTile('⏱️', irFmtNum(p.pecasPorHomemHora,1), 'Peças / Homem-Hora', '', '')
        )}
      </div>
      ${rpSectionTitle('⏰','Locais por colaborador, hora a hora','janela 06h–22h de expediente')}
      <div class="rp-panel">${irBuildProdMatrizRpTable(p)}</div>
      <p class="rp-footer">Gerado automaticamente pelo módulo Inventário Rotativo.</p>
    </div>
  </div>`;
  irBaixarBoletimImagem(html, `Produtividade_Ciclo_${c.numero}_${new Date().toISOString().slice(0,10)}.png`);
}

/* ============================================================
   DIVERGÊNCIAS
   ============================================================ */
const IR_DIV_ROW_H = 32;
function irDivergenciasFiltered(){
  const f = IR.divFilters;
  const search = f.search.trim().toLowerCase();
  return IR.divergencias.filter(d=>{
    if(d.diferenca===0) return false;
    if(f.local && d.local!==f.local) return false;
    if(search){
      const hay = (d.item+' '+d.itemNome+' '+d.local).toLowerCase();
      if(!hay.includes(search)) return false;
    }
    return true;
  }).sort((a,b)=>Math.abs(b.vlDivergencia)-Math.abs(a.vlDivergencia));
}
function irRenderDivergencias(){
  if(!IR.divergencias.length) return irEmptyState('Sem divergências carregadas', 'Processe o ciclo na Importação.', "irSwitchTab('importacao')", 'Ir para Importação');
  const locais = Array.from(new Set(IR.divergencias.map(d=>d.local))).sort();
  return `
    <div class="filter-bar">
      <input type="text" placeholder="Buscar por item, descrição ou local..." value="${irEsc(IR.divFilters.search)}" oninput="irDivSetSearch(this.value)">
      <select onchange="irDivSetFilter('local', this.value)">
        <option value="">Todos os locais</option>${locais.map(l=>`<option value="${irEsc(l)}" ${IR.divFilters.local===l?'selected':''}>${irEsc(l)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary" onclick="irExportDivergenciasCsv()">Exportar CSV</button>
    </div>
    <p class="field-hint" id="ir-div-count" style="margin-bottom:8px;">${irFmtInt(irDivergenciasFiltered().length)} itens divergentes</p>
    <div class="table-wrap">
      <div class="table-scroll" id="ir-div-scroll" style="height:calc(100vh - 300px);">
        <table><thead><tr><th>Item</th><th>Descrição</th><th>Local</th><th>Qtde Sistema</th><th>Qtde Física</th><th>Diferença</th><th>Valor</th></tr></thead>
        <tbody id="ir-div-window"></tbody></table>
      </div>
    </div>
  `;
}
function irDivSetSearch(val){ IR.divFilters.search = val; irMountDivergenciasScroll(true); irUpdateDivCount(); }
function irDivSetFilter(k,v){ IR.divFilters[k]=v; irRenderView(); }
function irUpdateDivCount(){ const el = document.getElementById('ir-div-count'); if(el) el.textContent = irFmtInt(irDivergenciasFiltered().length)+' itens divergentes'; }
function irMountDivergenciasScroll(keepScroll){
  const el = document.getElementById('ir-div-scroll');
  if(!el) return;
  if(IR.__divScrollHandler) el.removeEventListener('scroll', IR.__divScrollHandler);
  let ticking=false;
  IR.__divScrollHandler = ()=>{ if(ticking) return; ticking=true; requestAnimationFrame(()=>{ irRenderDivWindow(); ticking=false; }); };
  el.addEventListener('scroll', IR.__divScrollHandler);
  if(!keepScroll) el.scrollTop = 0;
  irRenderDivWindow();
}
function irRenderDivWindow(){
  const el = document.getElementById('ir-div-scroll'); const winEl = document.getElementById('ir-div-window');
  if(!el || !winEl) return;
  const rows = irDivergenciasFiltered();
  if(!rows.length){ winEl.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:20px;">Nenhum item encontrado.</td></tr>`; return; }
  const viewH = el.clientHeight||400, scrollTop = el.scrollTop, buffer=8;
  const start = Math.max(0, Math.floor(scrollTop/IR_DIV_ROW_H)-buffer);
  const end = Math.min(rows.length, start+Math.ceil(viewH/IR_DIV_ROW_H)+buffer*2);
  const top=start*IR_DIV_ROW_H, bottom=(rows.length-end)*IR_DIV_ROW_H;
  winEl.innerHTML = `<tr style="height:${top}px;"><td colspan="7" style="padding:0;border:none;"></td></tr>`
    + rows.slice(start,end).map(d=>`<tr style="height:${IR_DIV_ROW_H}px;">
        <td class="mono">${irEsc(d.item)}</td><td>${irEsc(d.itemNome)}</td><td>${irEsc(d.local)}</td>
        <td class="mono">${irFmtInt(d.qtdeSistema)}</td><td class="mono">${irFmtInt(d.qtdeFisica)}</td>
        <td class="mono ${d.diferenca>=0?'pos':'neg'}">${d.diferenca>0?'+':''}${irFmtInt(d.diferenca)}</td>
        <td class="mono ${d.vlDivergencia>=0?'pos':'neg'}">${irFmtMoney(d.vlDivergencia)}</td>
      </tr>`).join('')
    + `<tr style="height:${bottom}px;"><td colspan="7" style="padding:0;border:none;"></td></tr>`;
}
function irExportDivergenciasCsv(){
  const rows = irDivergenciasFiltered();
  if(!rows.length){ irShowToast('Nada para exportar.', true); return; }
  const cols = ['item','itemNome','local','qtdeSistema','qtdeFisica','diferenca','precoUnitario','vlFisico','vlDivergencia'];
  const header = cols.join(';');
  const lines = rows.map(r=>cols.map(c=>{ let v=r[c]; if(typeof v==='string') v='"'+v.replace(/"/g,'""')+'"'; return v??''; }).join(';'));
  const csv = '﻿'+header+'\n'+lines.join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'divergencias_ciclo_'+IR.cicloAtivo.numero+'.csv'; a.click(); URL.revokeObjectURL(a.href);
}

/* ============================================================
   AUDITORIA INTELIGENTE
   ============================================================ */
const IR_AUD_ROW_H = 32;
function irAuditoriaFiltered(){
  return IR.divergencias.filter(d=>d.diferenca!==0 && d.prioridade>=IR.auditFilters.minPrioridade)
    .sort((a,b)=>b.prioridade-a.prioridade);
}
function irRenderAuditoria(){
  if(!IR.divergencias.length) return irEmptyState('Sem itens para auditar', 'Processe o ciclo na Importação.', "irSwitchTab('importacao')", 'Ir para Importação');
  return `
    <div class="filter-bar">
      <label style="margin:0;">Prioridade mínima:</label>
      <input type="range" min="0" max="100" value="${IR.auditFilters.minPrioridade}" style="width:180px;" oninput="irAuditSetMinPrioridade(this.value)">
      <span class="mono" id="ir-aud-min-label">${IR.auditFilters.minPrioridade}</span>
      <button class="btn btn-secondary" onclick="irSwitchTab('configuracoes')">Ajustar pesos</button>
    </div>
    <p class="field-hint" id="ir-aud-count" style="margin-bottom:8px;">${irFmtInt(irAuditoriaFiltered().length)} itens na fila</p>
    <div class="table-wrap">
      <div class="table-scroll" id="ir-aud-scroll" style="height:calc(100vh - 300px);">
        <table><thead><tr><th>Prioridade</th><th>Item</th><th>Descrição</th><th>Local</th><th>Diferença</th><th>Valor</th><th>Rodadas</th></tr></thead>
        <tbody id="ir-aud-window"></tbody></table>
      </div>
    </div>
  `;
}
function irAuditSetMinPrioridade(v){
  IR.auditFilters.minPrioridade = parseInt(v,10);
  document.getElementById('ir-aud-min-label').textContent = v;
  irMountAuditoriaScroll(true);
  const el = document.getElementById('ir-aud-count'); if(el) el.textContent = irFmtInt(irAuditoriaFiltered().length)+' itens na fila';
}
function irMountAuditoriaScroll(keepScroll){
  const el = document.getElementById('ir-aud-scroll');
  if(!el) return;
  if(IR.__audScrollHandler) el.removeEventListener('scroll', IR.__audScrollHandler);
  let ticking=false;
  IR.__audScrollHandler = ()=>{ if(ticking) return; ticking=true; requestAnimationFrame(()=>{ irRenderAudWindow(); ticking=false; }); };
  el.addEventListener('scroll', IR.__audScrollHandler);
  if(!keepScroll) el.scrollTop = 0;
  irRenderAudWindow();
}
function irRenderAudWindow(){
  const el = document.getElementById('ir-aud-scroll'); const winEl = document.getElementById('ir-aud-window');
  if(!el || !winEl) return;
  const rows = irAuditoriaFiltered();
  if(!rows.length){ winEl.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:20px;">Nenhum item nessa faixa de prioridade.</td></tr>`; return; }
  const viewH = el.clientHeight||400, scrollTop = el.scrollTop, buffer=8;
  const start = Math.max(0, Math.floor(scrollTop/IR_AUD_ROW_H)-buffer);
  const end = Math.min(rows.length, start+Math.ceil(viewH/IR_AUD_ROW_H)+buffer*2);
  const top=start*IR_AUD_ROW_H, bottom=(rows.length-end)*IR_AUD_ROW_H;
  winEl.innerHTML = `<tr style="height:${top}px;"><td colspan="7" style="padding:0;border:none;"></td></tr>`
    + rows.slice(start,end).map(d=>`<tr style="height:${IR_AUD_ROW_H}px;">
        <td><span class="priority-badge" style="background:${irPrioridadeCor(d.prioridade)};">${d.prioridade}</span></td>
        <td class="mono">${irEsc(d.item)}</td><td>${irEsc(d.itemNome)}</td><td>${irEsc(d.local)}</td>
        <td class="mono ${d.diferenca>=0?'pos':'neg'}">${d.diferenca>0?'+':''}${irFmtInt(d.diferenca)}</td>
        <td class="mono ${d.vlDivergencia>=0?'pos':'neg'}">${irFmtMoney(d.vlDivergencia)}</td>
        <td class="mono">${d.rodadasLocal}</td>
      </tr>`).join('')
    + `<tr style="height:${bottom}px;"><td colspan="7" style="padding:0;border:none;"></td></tr>`;
}

/* ============================================================
   HISTÓRICO
   ============================================================ */
function irRenderHistorico(){
  if(!IR.ciclos.length) return irEmptyState('Nenhum ciclo no histórico', 'Processe o primeiro ciclo na Importação.', "irSwitchTab('importacao')", 'Ir para Importação');
  return `<div class="panel"><h3>Linha do tempo</h3>
    <div class="table-wrap"><table><thead><tr><th>Ciclo</th><th>Status</th><th>Abertura</th><th>Término previsto</th><th>Encerrado em</th><th></th></tr></thead>
    <tbody>${IR.ciclos.map(c=>`<tr>
      <td class="mono">${c.numero}${irCicloAno(c)?'/'+irCicloAno(c):''}</td>
      <td><span class="tag ${c.status==='aberto'?'tag-orange':'tag-good'}">${c.status==='aberto'?'Aberto':'Encerrado'}</span></td>
      <td>${irFmtDate(c.dataAbertura)}</td><td>${irFmtDate(c.dataPrevistaTermino)}</td><td>${irFmtDate(c.dataEncerramento)}</td>
      <td><button class="btn-link" onclick="irSelecionarCiclo('${c.id}')">Ver indicadores</button></td>
    </tr>`).join('')}</tbody></table></div>
  </div>`;
}
async function irSelecionarCiclo(cicloId){
  IR.cicloAtivo = IR.ciclos.find(c=>c.id===cicloId);
  IR.calMesIdx = null;
  await irLoadCicloData(cicloId);
  irSwitchTab('dashboard');
}

/* ============================================================
   COMPARATIVO ENTRE CICLOS
   ============================================================ */
function irRenderComparativo(){
  if(IR.ciclos.length<2) return irEmptyState('Precisa de ao menos 2 ciclos', 'Processe outro ciclo para poder comparar.', "irSwitchTab('importacao')", 'Ir para Importação');
  const opts = IR.ciclos.map(c=>`<option value="${c.id}">${irCicloLabel(c)}</option>`).join('');
  return `
    <div class="filter-bar">
      <select id="ir-cmp-a" onchange="irSetComparar('A', this.value)">${opts}</select>
      <span>vs.</span>
      <select id="ir-cmp-b" onchange="irSetComparar('B', this.value)">${opts}</select>
      <button class="btn btn-primary" onclick="irRenderComparativoResultado()">Comparar</button>
    </div>
    <div id="ir-cmp-result"></div>
  `;
}
function irSetComparar(which, id){ if(which==='A') IR.compararA=id; else IR.compararB=id; }
async function irRenderComparativoResultado(){
  const idA = IR.compararA || document.getElementById('ir-cmp-a').value;
  const idB = IR.compararB || document.getElementById('ir-cmp-b').value;
  const ciA = IR.ciclos.find(c=>c.id===idA), ciB = IR.ciclos.find(c=>c.id===idB);
  const indA = await irGetIndicadores(idA), indB = await irGetIndicadores(idB);
  const el = document.getElementById('ir-cmp-result');
  if(!indA || !indB){ el.innerHTML = '<p class="field-hint">Indicadores não encontrados para um dos ciclos.</p>'; return; }
  const linhas = [
    ['Acurácia Peças', irFmtPct(indA.acuraciaPecas), irFmtPct(indB.acuraciaPecas), indB.acuraciaPecas-indA.acuraciaPecas],
    ['Acurácia Local', irFmtPct(indA.acuraciaLocal), irFmtPct(indB.acuraciaLocal), indB.acuraciaLocal-indA.acuraciaLocal],
    ['Acurácia Valor', irFmtPct(indA.acuraciaValor), irFmtPct(indB.acuraciaValor), indB.acuraciaValor-indA.acuraciaValor],
    ['Andamento', irFmtPct(indA.andamentoCiclo), irFmtPct(indB.andamentoCiclo), indB.andamentoCiclo-indA.andamentoCiclo],
    ['Itens Divergentes', irFmtInt(indA.itensDivergentes), irFmtInt(indB.itensDivergentes), indB.itensDivergentes-indA.itensDivergentes],
    ['Valor Divergente (abs.)', irFmtMoney(indA.valorDivergenteAbsoluto), irFmtMoney(indB.valorDivergenteAbsoluto), indB.valorDivergenteAbsoluto-indA.valorDivergenteAbsoluto],
    ['Recontagens', irFmtInt(indA.qtdRecontagens), irFmtInt(indB.qtdRecontagens), indB.qtdRecontagens-indA.qtdRecontagens],
    ['Tempo Médio (min)', irFmtNum(indA.tempoMedioContagemMin,1), irFmtNum(indB.tempoMedioContagemMin,1), indB.tempoMedioContagemMin-indA.tempoMedioContagemMin],
    ['Eficiência', irFmtPct(indA.eficiencia), irFmtPct(indB.eficiencia), indB.eficiencia-indA.eficiencia]
  ];
  // Junta os Logs presentes em qualquer um dos dois ciclos (um ciclo pode não ter
  // contado ainda um Log que o outro já tem) — cada ciclo já vem com seus próprios
  // indicadores isolados por cicloId no IndexedDB, então não há mistura de dados aqui.
  const porLogA = new Map((indA.porLog||[]).filter(r=>r.chave!=='(sem log)').map(r=>[r.chave,r]));
  const porLogB = new Map((indB.porLog||[]).filter(r=>r.chave!=='(sem log)').map(r=>[r.chave,r]));
  const logsChaves = Array.from(new Set([...porLogA.keys(), ...porLogB.keys()])).sort();
  const linhasLog = logsChaves.map(chave=>{
    const rA = porLogA.get(chave), rB = porLogB.get(chave);
    const delta = (rB?rB.acuraciaPecas:null)!==null && (rA?rA.acuraciaPecas:null)!==null && rA && rB ? rB.acuraciaPecas-rA.acuraciaPecas : null;
    return {chave, rA, rB, delta};
  });
  el.innerHTML = `<div class="panel"><h3>${irCicloLabel(ciA)} vs. ${irCicloLabel(ciB)}</h3>
    <div class="table-wrap"><table><thead><tr><th>Indicador</th><th>${irCicloLabel(ciA)}</th><th>${irCicloLabel(ciB)}</th><th>Tendência</th></tr></thead>
    <tbody>${linhas.map(([label,a,b,delta])=>`<tr><td>${label}</td><td class="mono">${a}</td><td class="mono">${b}</td>
      <td><span class="tag ${delta>0?'tag-good':(delta<0?'tag-bad':'tag-muted')}">${delta>0?'▲ melhora':(delta<0?'▼ piora':'= igual')}</span></td></tr>`).join('')}</tbody>
    </table></div>
  </div>
  ${logsChaves.length ? `<div class="panel">
    <h3>Acurácia por Log — ${irCicloLabel(ciA)} vs. ${irCicloLabel(ciB)}</h3>
    <div class="table-wrap"><table><thead><tr>
      <th>Log</th>
      <th>Peças (${irCicloLabel(ciA)})</th><th>Peças (${irCicloLabel(ciB)})</th>
      <th>Locais (${irCicloLabel(ciA)})</th><th>Locais (${irCicloLabel(ciB)})</th>
      <th>Valor (${irCicloLabel(ciA)})</th><th>Valor (${irCicloLabel(ciB)})</th>
      <th>Tendência (Peças)</th>
    </tr></thead>
    <tbody>${linhasLog.map(({chave,rA,rB,delta})=>`<tr>
      <td class="mono">${irEsc(chave)}</td>
      <td class="mono">${rA?irFmtPct(rA.acuraciaPecas):'—'}</td>
      <td class="mono">${rB?irFmtPct(rB.acuraciaPecas):'—'}</td>
      <td class="mono">${rA?irFmtPct(rA.acuraciaPosicoes):'—'}</td>
      <td class="mono">${rB?irFmtPct(rB.acuraciaPosicoes):'—'}</td>
      <td class="mono">${rA?irFmtPct(rA.acuraciaValor):'—'}</td>
      <td class="mono">${rB?irFmtPct(rB.acuraciaValor):'—'}</td>
      <td>${delta===null ? '<span class="tag tag-muted">sem base</span>' : `<span class="tag ${delta>0?'tag-good':(delta<0?'tag-bad':'tag-muted')}">${delta>0?'▲ melhora':(delta<0?'▼ piora':'= igual')}</span>`}</td>
    </tr>`).join('')}</tbody>
    </table></div>
  </div>` : ''}`;
}

/* ============================================================
   INDICADORES (detalhado, com fórmula)
   ============================================================ */
function irRenderIndicadores(){
  const ind = IR.indicadores;
  if(!ind) return irEmptyState('Sem indicadores', 'Processe o ciclo na Importação.', "irSwitchTab('importacao')", 'Ir para Importação');
  const rows = [
    ['Acurácia Peças', irFmtPct(ind.acuraciaPecas), IR_KPI_FORMULAS.acuraciaPecas],
    ['Acurácia Local', irFmtPct(ind.acuraciaLocal), IR_KPI_FORMULAS.acuraciaLocal],
    ['Acurácia Valor', irFmtPct(ind.acuraciaValor), IR_KPI_FORMULAS.acuraciaValor],
    ['Andamento do Ciclo', irFmtPct(ind.andamentoCiclo), IR_KPI_FORMULAS.andamentoCiclo],
    ['Peças Contadas', irFmtInt(ind.pecasContadas), 'Soma do QT_FIS da última contagem de cada item, nos locais liquidados (QRY0843).'],
    ['Itens Contados', irFmtInt(ind.itensContados), 'Nº de pares (local, item) verificados na QRY0843, com valor cruzado da SIGEQ278/ZBIQ0051.'],
    ['Peças Divergentes', irFmtInt(ind.pecasDivergentes), 'Soma de |Diferença| entre rodada final e rodada 1 (sistêmico), derivado da QRY0843.'],
    ['Itens Divergentes', irFmtInt(ind.itensDivergentes), 'Nº de pares (local, item) da QRY0843 com Diferença ≠ 0.'],
    ['Qtd. de Recontagens', irFmtInt(ind.qtdRecontagens), IR_KPI_FORMULAS.qtdRecontagens],
    ['Tempo Médio por Contagem', irFmtNum(ind.tempoMedioContagemMin,1)+' min', IR_KPI_FORMULAS.tempoMedioContagem],
    ['Dias Restantes', ind.diasRestantes===null?'—':irFmtInt(ind.diasRestantes), IR_KPI_FORMULAS.diasRestantes],
    ['Eficiência', irFmtPct(ind.eficiencia), IR_KPI_FORMULAS.eficiencia]
  ];
  return `<div class="panel"><h3>Todos os indicadores</h3>
    <div class="table-wrap"><table><thead><tr><th>Indicador</th><th>Valor</th><th>Fórmula</th></tr></thead>
    <tbody>${rows.map(([l,v,f])=>`<tr><td>${l}</td><td class="mono">${v}</td><td class="field-hint">${irEsc(f)}</td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */
function irRenderConfiguracoes(){
  const p = IR.prioridadeConfig || {valor:0.5, quantidade:0.2, recontagens:0.15, reincidencia:0.15};
  const soma = p.valor+p.quantidade+p.recontagens+p.reincidencia;
  const temaAtivo = localStorage.getItem('ir-app-theme') || 'padrao';
  return `
  <div class="panel">
    <h3>Aparência — Tema visual</h3>
    <p class="field-hint" style="margin-bottom:14px;">Experimente os temas e escolha o que preferir — o modo claro/escuro (botão no rodapé do menu) continua funcionando dentro de qualquer um deles.</p>
    <div class="theme-picker-grid">
      ${IR_APP_THEMES.map(t=>`<button type="button" class="theme-picker-card ${temaAtivo===t.key?'active':''}" onclick="irSetAppTheme('${t.key}')">
        <span class="theme-picker-swatch" style="background:${t.swatch};"></span>
        <span class="theme-picker-label">${irEsc(t.label)}</span>
        ${temaAtivo===t.key ? '<span class="theme-picker-check">✓</span>' : ''}
      </button>`).join('')}
    </div>
  </div>
  <div class="panel">
    <h3>Índice de Prioridade de Auditoria — pesos</h3>
    <p class="field-hint" style="margin-bottom:12px;">A soma deve ficar em 100%. Ajuste e salve para recalcular a prioridade no próximo processamento.</p>
    <div class="two-col">
      <div><label>Valor financeiro (%)</label><input type="number" id="ir-cfg-valor" min="0" max="100" value="${(p.valor*100).toFixed(0)}"></div>
      <div><label>Quantidade divergente (%)</label><input type="number" id="ir-cfg-qtd" min="0" max="100" value="${(p.quantidade*100).toFixed(0)}"></div>
    </div>
    <div class="two-col">
      <div><label>Nº de recontagens (%)</label><input type="number" id="ir-cfg-reconta" min="0" max="100" value="${(p.recontagens*100).toFixed(0)}"></div>
      <div><label>Reincidência histórica (%)</label><input type="number" id="ir-cfg-reinc" min="0" max="100" value="${(p.reincidencia*100).toFixed(0)}"></div>
    </div>
    <p class="field-hint" id="ir-cfg-soma" style="margin-top:8px;">Soma atual: ${(soma*100).toFixed(0)}%</p>
    <div class="form-actions"><button class="btn btn-primary" onclick="irSalvarPrioridadeConfig()">Salvar pesos</button></div>
  </div>`;
}
async function irSalvarPrioridadeConfig(){
  const valor = parseFloat(document.getElementById('ir-cfg-valor').value)/100;
  const quantidade = parseFloat(document.getElementById('ir-cfg-qtd').value)/100;
  const recontagens = parseFloat(document.getElementById('ir-cfg-reconta').value)/100;
  const reincidencia = parseFloat(document.getElementById('ir-cfg-reinc').value)/100;
  const soma = valor+quantidade+recontagens+reincidencia;
  if(Math.abs(soma-1)>0.01){ irShowToast('A soma dos pesos precisa ser 100% (atual: '+(soma*100).toFixed(0)+'%).', true); return; }
  const pesos = {valor, quantidade, recontagens, reincidencia};
  await irSavePrioridadeConfig(pesos);
  IR.prioridadeConfig = {key:'pesos', ...pesos};
  irShowToast('Pesos salvos. Serão aplicados no próximo processamento de ciclo.');
}
