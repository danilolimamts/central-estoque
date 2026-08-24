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
  net410Legenda:[], // legenda de motivos da 410 (editável em Configurações)
  net410Ignorados:[], // itens ocultos da análise de distorção do NET (motivo já conhecido)
  net410Padroes:[], // trechos da Observação WMS que escondem qualquer item que os carregue (ex.: "SALDO")
  netAuditoriaN:10, // quantos itens entram na "Gerar Auditoria" (top N por |saldo| do período atual)
  netAuditoriaGerada:null, // {geradoEm, mesLabel, linhas:[...]} — resultado da última geração
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
  // Escopo dos painéis "Itens mais Divergentes" — por padrão soma só o ciclo ativo
  // (igual antes), mas dá pra expandir pra um ano inteiro (todos os ciclos abertos
  // naquele ano) ou todos os ciclos já processados. itemDivSaldo é o resultado já
  // calculado pro escopo atual (populado por irAtualizarItemDivSaldo).
  itemDivFiltro:{tipo:'ciclo'}, itemDivSaldo:null,
  // Perdas e Ganhos (QRY410) — independente do ciclo, por ano.
  net410Anos:[], net410AnoSel:null, net410MesSel:null, net410Data:null, net410File:null,
  net410Processing:false, net410Progress:{stage:'', pct:0},
  divNetMesSel:null, // mês selecionado no painel "Por que o NET está distorcido?" (aba Divergências)
  divNetDiaSel:null, // dia selecionado (opcional) no mesmo painel — "" ou null = mês inteiro
  comparativoCiclos:null, // [{ciclo, ind}] de todos os ciclos já processados, pro gráfico do Dashboard
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
    IR.net410Legenda = await irSeedNet410LegendaIfEmpty();
    IR.net410Ignorados = await irGetNet410IgnoradosAll();
    IR.net410Padroes = await irSeedNet410PadroesIgnoradosIfEmpty();
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
  // Troca de ciclo ativo volta o escopo dos "Itens mais Divergentes" pro padrão
  // (só o ciclo atual) — senão ficaria somando um ciclo antigo com o novo ativo.
  IR.itemDivFiltro = {tipo:'ciclo'};
  IR.itemDivSaldo = irCalcItemSaldo(IR.divergencias);
  IR.comparativoCiclos = null; // recarrega no próximo render do Dashboard (irCarregarComparativoCiclos)
}
// Carrega os indicadores de TODOS os ciclos já processados (ordenados por ano+número)
// pro gráfico "Comparativo de Acurácias entre Ciclos" do Dashboard — cada ciclo já é
// isolado por cicloId no IndexedDB, então não há mistura entre eles aqui.
async function irCarregarComparativoCiclos(){
  const ciclosOrdenados = IR.ciclos.slice().sort((a,b)=>{
    const anoA = irCicloAno(a)||0, anoB = irCicloAno(b)||0;
    return anoA!==anoB ? anoA-anoB : a.numero-b.numero;
  });
  const pares = await Promise.all(ciclosOrdenados.map(async c=>({ciclo:c, ind: await irGetIndicadores(c.id)})));
  IR.comparativoCiclos = pares;
  irRenderView();
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
  if(IR.currentTab==='dashboard') irScrollVBarsToEnd();
}
// Gráficos "por dia" (Peças/Valor/Locais Divergentes por Dia) abrem rolados pro dia
// mais recente por padrão — é o que interessa de cara, sem precisar arrastar a barra.
function irScrollVBarsToEnd(){
  document.querySelectorAll('#viewRoot .bi-vbars-scroll').forEach(el=>{ el.scrollLeft = el.scrollWidth; });
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
const IR_INDICADORES_VERSION = 8; // mantido em sincronia com worker.js
/* Barra de filtros do Dashboard, no estilo Power BI: ciclo + período de data num só
   lugar, com um chip pra escolher em quais painéis o filtro de data se aplica (hoje só
   a Produtividade responde a data — os demais KPIs/gráficos são do ciclo inteiro). */
function irRenderDashCicloBar(){
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
  </div>`;
}
// Filtro de data — só afeta a Produtividade, por isso fica logo acima do gráfico
// dela em vez de junto com o seletor de Ciclo (que é global pro Dashboard inteiro).
function irRenderDashDateFilterBar(){
  return `<div class="panel dash-filter-bar">
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
  if(!IR.itemDivSaldo) IR.itemDivSaldo = irCalcItemSaldo(IR.divergencias);
  const itemSaldo = IR.itemDivSaldo;
  if(IR.comparativoCiclos===null) irCarregarComparativoCiclos(); // async — re-renderiza quando chegar
  // Cada bloco tem sempre 3 bullets, no mesmo formato: ícone + acurácia (com meta),
  // + volume principal, + divergência/pendência. Os demais indicadores (itens
  // divergentes, recontagens, tempo médio etc.) continuam na aba Indicadores.
  const metaHint = `Meta: ${irFmtPct(ind.meta)}`;
  // Taxa de recontagem = locais que tiveram trabalho de campo cancelado (contagem
  // começou mas o local não fechou porque foi interrompido, ex.: precisava coletar)
  // sobre o total de locais orçados do ciclo. Pedido explícito do usuário: aparecer
  // em CADA bloco de acurácia, pra deixar claro o quanto disso pesa em cada frente.
  const taxaRecontagemHint = `Recontagem/cancelamento: ${irFmtPct(ind.taxaCancelamento||0)}`;
  const blocoPecas = irKpiBlock('orange','📦','Peças',
    irKpiTile('🎯', irFmtPct(ind.acuraciaPecas), 'Acurácia Peças', ind.acuraciaPecas>=ind.meta?'good':'bad', metaHint+' · '+taxaRecontagemHint) +
    irKpiTile('📦', irFmtInt(ind.pecasContadas), 'Peças Contadas', '', 'total físico') +
    irKpiTile('⚠️', irFmtInt(ind.pecasDivergentes), 'Peças Divergentes', 'bad', irFmtInt(ind.itensDivergentes)+' itens')
  );
  const blocoLocais = irKpiBlock('blue','📍','Locais',
    irKpiTile('🎯', irFmtPct(ind.acuraciaLocal), 'Acurácia Local', ind.acuraciaLocal>=ind.meta?'good':'bad', metaHint+' · '+taxaRecontagemHint) +
    irKpiTile('✅', irFmtInt(ind.locaisConcluidos), 'Concluídos', '', 'de '+irFmtInt(ind.locaisContadosTotal)+' contados') +
    irKpiTile('⏳', irFmtInt(ind.locaisPendentes), 'Pendentes', 'bad', irFmtInt(ind.qtdRecontagens)+' recontagens')
  );
  const blocoValor = irKpiBlock('black','💰','Valor',
    irKpiTile('🎯', irFmtPct(ind.acuraciaValor), 'Acurácia Valor', ind.acuraciaValor>=ind.meta?'good':'bad', metaHint+' · '+taxaRecontagemHint) +
    irKpiTile('💰', irFmtMoney(ind.valorFisicoTotal), 'Valor Contado', '', 'total físico') +
    irKpiTile('⚠️', irFmtMoney(ind.valorDivergenteAbsoluto), 'Valor Divergente', 'bad', 'soma absoluta')
  );
  const blocoCiclo = irKpiBlock('neutral','🔄','Ciclo',
    irKpiTile('📊', irFmtPct(ind.andamentoCiclo), 'Andamento', '', irFmtInt(ind.locaisConcluidos)+' de '+irFmtInt(ind.locaisCongelados)) +
    irKpiTile('📅', ind.diasRestantes===null?'—':irFmtInt(ind.diasRestantes), 'Dias Restantes', '', 'dias úteis · exclui feriados') +
    irKpiTile('⚡', irFmtPct(ind.eficiencia), 'Eficiência', ind.eficiencia>=0.8?'good':(ind.eficiencia<0.5?'bad':''), 'qualidade x velocidade')
  );
  return `
    ${irRenderDashCicloBar()}
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
    ${irRenderDashDateFilterBar()}
    ${irRenderDashProdutividade()}
    ${irRenderPorLogPanel(ind)}
    ${irRenderContadosPorDiaPanel(ind)}
    ${irRenderDivergentesPorDiaPanel(ind)}
    ${irRenderItensSemPrecoPanel(ind)}
    ${irRenderCancelamentoImpactoPanel(ind)}
    ${irRenderItemDivEscopoBar()}
    <div class="bi-grid-2">
      ${irRenderTopItensPanel(itemSaldo, 'pecas')}
      ${irRenderTopItensPanel(itemSaldo, 'valor')}
    </div>
    ${irRenderLogTablePanel(ind)}
    ${irRenderComparativoCiclosPanel(ind)}
    ${irRenderCalendarioPanel(ind)}
  `;
}
// Impacto de locais que tiveram trabalho de campo iniciado (Data Início Contagem
// preenchida na 843) e terminaram CANCELADOS — o colaborador foi lá, começou a contar,
// mas foi interrompido (ex.: precisava coletar) e o local não fechou naquela rodada.
// Pedido explícito do usuário: quantificar o tempo perdido pra levar pra conversa com
// quem pede a interrupção ("perdemos X horas porque pediram pra cancelar o local").
function irRenderCancelamentoImpactoPanel(ind){
  const tentativas = ind.tentativasCanceladas||0;
  if(!tentativas) return '';
  const comHorario = ind.sessoesComHorarioRegistrado||0;
  return `<div class="panel">
    <h3>⏱️ Impacto de cancelamentos (recontagem por interrupção)</h3>
    <p class="panel-sub">Locais em que a contagem foi iniciada em campo mas a rodada terminou cancelada — não fechou porque foi interrompida (ex.: precisava coletar). Essas rodadas não entram em nenhum outro indicador de acurácia; aqui é só o custo da interrupção em si.</p>
    <div class="kpi-blocks">
      ${irKpiBlock('black','⏳','Cancelamentos',
        irKpiTile('📍', irFmtInt(ind.locaisComCancelamento||0), 'Locais Afetados', '', 'com ≥1 cancelamento') +
        irKpiTile('🔁', irFmtInt(tentativas), 'Tentativas Canceladas', '', 'sessões com início de campo') +
        irKpiTile('📊', irFmtPct(ind.taxaCancelamento||0), 'Taxa', '', 'sobre locais orçados do ciclo')
      )}
      ${irKpiBlock('black','⏱️','Tempo Perdido',
        irKpiTile('⏱️', ind.horasPerdidasCancelamento?irFmtNum(ind.horasPerdidasCancelamento,1)+'h':'—', 'Horas Perdidas', '', comHorario+' de '+tentativas+' com início e fim registrados') +
        irKpiTile('📐', (comHorario && ind.horasPerdidasCancelamento)?irFmtNum((ind.horasPerdidasCancelamento*60)/comHorario,0)+' min':'—', 'Média por Tentativa', '', 'entre as com horário completo') +
        irKpiTile('❓', irFmtInt(tentativas-comHorario), 'Sem Horário Completo', '', 'sem Data Fim Contagem')
      )}
      ${irKpiBlock('black','🧑','Custo em Pessoas',
        irKpiTile('📅', ind.horasPerdidasCancelamento?irFmtNum(ind.horasPerdidasCancelamento/8,1)+' dias':'—', 'Dias de Produtividade Perdidos', '', 'jornada de 8h/dia')
      )}
    </div>
  </div>`;
}
// Itens que divergiram em peça mas não tiveram preço encontrado na SIGEQ278/ZBIQ0051 —
// o valor divergente desses fica R$ 0,00 mesmo com peça/local realmente divergente.
// Diagnóstico direto pro usuário ir corrigir a valoração na origem, em vez de ficar
// perguntando por que um dia com contagem aparece zerado no gráfico de valor.
function irRenderItensSemPrecoPanel(ind){
  const itens = ind.itensSemPreco||[];
  if(!itens.length) return '';
  return `<div class="panel">
    <h3>⚠️ Itens divergentes sem preço encontrado</h3>
    <p class="panel-sub">${irFmtInt(ind.itensSemPrecoTotal||itens.length)} itens divergiram em peça mas não têm preço encontrado (nem próprio na SIGEQ278, nem do item pai via ZBIQ0051) — o valor divergente desses fica R$ 0,00 até corrigir a valoração na origem. Componentes "N" da 051 não entram aqui (são zerados por design, não é lacuna de dado). Mostrando os ${itens.length} com mais peças divergentes.</p>
    <div class="table-wrap table-scroll" style="max-height:320px;"><table class="table-dense">
      <thead><tr><th>Item</th><th>Descrição</th><th>Peças Divergentes</th><th>Locais</th></tr></thead>
      <tbody>${itens.map(i=>`<tr>
        <td class="mono">${irEsc(i.item)}</td>
        <td>${irEsc(i.nome||'—')}</td>
        <td class="mono">${irFmtInt(i.pecasDivergentes)}</td>
        <td class="mono">${irFmtInt(i.locais)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
// Quebra da Acurácia Peças por status do local — diagnóstico pra separar divergência
// real (local já convergido/fechado) de instabilidade temporária (local ainda em
// contagem, que muda de rodada a cada reprocessamento e ainda não é o número final).
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
    <p class="panel-sub">Locais orçados x contados (Grupo Classe da base congelada), peças e acurácias por log — só locais CONCLUÍDOS (mesma regra do KPI "Acurácia Peças/Valor" do topo). Só LOG 1, 2, 3 e 6 — os demais ainda têm base congelada pra corrigir.</p>
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
  // Pendente aqui usa a mesma regra do módulo de Inventário: local sem NENHUMA linha
  // Liquidada na 843 ainda, cruzado pela rua (X1) da base congelada.
  const rowsComPendentes = rows.map(r=>({...r, locaisPendentes: irLocaisPendentesContagem(r.chave).length}));
  const totalPendentes = rowsComPendentes.reduce((s,r)=>s+r.locaisPendentes,0);
  return `<div class="panel">
    <h3>Resumo por Setor</h3>
    <p class="panel-sub">Locais orçados x contados (coluna X1 da base congelada), peças e acurácias por rua.</p>
    ${totalPendentes>0?`<div class="form-actions" style="margin:0 0 12px;">
      <button class="btn-link" onclick="irExportarLocaisPendentesCsv()">📤 Exportar todos os locais pendentes (${irFmtInt(totalPendentes)})</button>
    </div>`:''}
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Rua</th><th>Locais Orçados</th><th>Locais Contados</th><th>Locais Divergentes</th>
        <th>Locais Pendentes</th>
        <th>Peças Contadas</th><th>Peças Divergentes</th>
        <th>Acurácia Peças</th><th>Posições</th><th>Valores</th>
      </tr></thead>
      <tbody>${rowsComPendentes.map(r=>`<tr>
        <td class="mono">${irEsc(r.chave)}</td>
        <td class="mono">${irFmtInt(r.locaisOrcados)}</td>
        <td class="mono">${irFmtInt(r.locaisContados)}</td>
        <td class="mono">${irFmtInt(r.locaisDivergentes)}</td>
        <td class="mono">${irFmtInt(r.locaisPendentes)}</td>
        <td class="mono">${irFmtInt(r.pecasContadas)}</td>
        <td class="mono">${irFmtInt(r.pecasDivergentes)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaPecas, meta)}">${irFmtPct(r.acuraciaPecas)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaPosicoes, meta)}">${irFmtPct(r.acuraciaPosicoes)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaValor, meta)}">${irFmtPct(r.acuraciaValor)}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--line);">
        <td class="mono">TOTAL</td>
        <td class="mono">${irFmtInt(rowsComPendentes.reduce((s,r)=>s+r.locaisOrcados,0))}</td>
        <td class="mono">${irFmtInt(rowsComPendentes.reduce((s,r)=>s+r.locaisContados,0))}</td>
        <td class="mono">${irFmtInt(rowsComPendentes.reduce((s,r)=>s+r.locaisDivergentes,0))}</td>
        <td class="mono">${irFmtInt(totalPendentes)}</td>
        <td class="mono">${irFmtInt(rowsComPendentes.reduce((s,r)=>s+r.pecasContadas,0))}</td>
        <td class="mono">${irFmtInt(rowsComPendentes.reduce((s,r)=>s+r.pecasDivergentes,0))}</td>
        <td colspan="3"></td>
      </tr></tfoot>
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
  const campo = opts.campo || 'total';
  const fmt = opts.fmt || irFmtInt;
  // W fixo = mesma largura útil do painel do boletim (ver comentário em irBuildLogBarChartSvg).
  const W = 800, H = 260;
  const padL = 14, padR = 14, padT = 36, padB = 32;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  // Slot mínimo por dia (data "dd/mm" + valor acima, sem colar no vizinho) — é uma
  // imagem estática (sem como rolar como no Dashboard ao vivo), então em vez de
  // espremer todo mundo até ficar ilegível, mostra só os últimos N dias, que são os
  // mais relevantes pro acompanhamento do ciclo. Rótulo em R$ é bem mais largo que um
  // inteiro simples ("R$ 1.234,56" vs "12") — precisa de mais espaço por dia, senão os
  // rótulos vizinhos colam um no outro.
  const MIN_SLOT = opts.minSlot || (fmt===irFmtMoney ? 56 : 34);
  const maxDias = Math.max(1, Math.floor(plotW/MIN_SLOT));
  const rowsVisiveis = rows.length > maxDias ? rows.slice(rows.length-maxDias) : rows;
  const omitidos = rows.length - rowsVisiveis.length;
  const n = rowsVisiveis.length;
  const max = Math.max(1, meta, ...rowsVisiveis.map(r=>r[campo]));
  const barW = Math.min(50, plotW/n*0.7);
  let bars = '', labels = '', xLabels = '';
  rowsVisiveis.forEach((r,i)=>{
    const cx = padL + (i+0.5)*(plotW/n);
    const bh = (r[campo]/max)*plotH;
    const bx = cx-barW/2, by = padT+plotH-bh;
    bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${colors.bar}" rx="2"/>`;
    // Sem rótulo em dias com valor zero — só polui (um "R$ 0,00" atrás do outro,
    // grudados, ilegível) e não carrega informação nenhuma.
    if(r[campo]){
      labels += `<text x="${cx.toFixed(1)}" y="${(by-6).toFixed(1)}" font-size="10.5" text-anchor="middle" fill="${colors.label}" font-weight="700">${fmt(r[campo])}</text>`;
    }
    const dia = new Date(r.dia+'T00:00:00');
    xLabels += `<text x="${cx.toFixed(1)}" y="${H-12}" font-size="11.5" text-anchor="middle" fill="${colors.axis}" font-weight="600">${String(dia.getDate()).padStart(2,'0')}/${String(dia.getMonth()+1).padStart(2,'0')}</text>`;
  });
  // meta null/undefined = sem linha de meta (gráficos que não têm uma meta diária,
  // como os de divergência — só faz sentido pra "Contados por Dia").
  const metaY = padT+plotH-(meta/max)*plotH;
  const metaLine = (meta!==null && meta!==undefined) ? `<line x1="${padL}" y1="${metaY.toFixed(1)}" x2="${W-padR}" y2="${metaY.toFixed(1)}" stroke="${colors.meta}" stroke-width="1.5" stroke-dasharray="5 4"/>
    <text x="${W-padR}" y="${(metaY-6).toFixed(1)}" font-size="11.5" text-anchor="end" fill="${colors.meta}" font-weight="700">Meta ${irFmtInt(meta)}</text>` : '';
  const notaOmitidos = omitidos>0 ? `<text x="${padL}" y="14" font-size="11" fill="${colors.axis}">Mostrando os últimos ${n} de ${rows.length} dias</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;">${notaOmitidos}${bars}${labels}${xLabels}${metaLine}</svg>`;
}
/* Gráfico de colunas com linha de base no zero — pra série que tem mês positivo E
   negativo (NET da 410 por mês), diferente do resto dos gráficos de barra do app
   (que partem sempre de 0 pra cima). Barra positiva sobe da base, negativa desce;
   rótulo fica do lado de fora da barra (acima se positiva, abaixo se negativa). */
function irBuildColunasComBaseZeroSvg(rows, opts){
  opts = opts||{};
  const corPos = opts.corPos||'#001A72', corNeg = opts.corNeg||'#C0392B', corAxis = opts.corAxis||'#6B7280', corLabel = opts.corLabel||'#1D1F2A';
  const campo = opts.campo||'valor', fmt = opts.fmt||irFmtMoney, xLabel = opts.xLabel||(r=>r.label);
  const W = 800, H = 260;
  const padL = 14, padR = 14, padT = 34, padB = 30;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const n = rows.length;
  const maxAbs = Math.max(1, ...rows.map(r=>Math.abs(r[campo])));
  const baseY = padT + plotH/2;
  const barW = Math.min(56, plotW/n*0.62);
  let bars = '', labels = '', xLabels = '';
  const baseLine = `<line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W-padR}" y2="${baseY.toFixed(1)}" stroke="${corAxis}" stroke-width="1"/>`;
  rows.forEach((r,i)=>{
    const cx = padL + (i+0.5)*(plotW/n);
    const v = r[campo];
    const bh = Math.abs(v)/maxAbs*(plotH/2-8);
    const cor = v>=0 ? corPos : corNeg;
    const by = v>=0 ? baseY-bh : baseY;
    bars += `<rect x="${(cx-barW/2).toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${cor}" rx="2"/>`;
    const labelY = v>=0 ? by-6 : by+bh+14;
    labels += `<text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="11" text-anchor="middle" fill="${corLabel}" font-weight="700">${fmt(v)}</text>`;
    xLabels += `<text x="${cx.toFixed(1)}" y="${H-10}" font-size="11.5" text-anchor="middle" fill="${corAxis}" font-weight="600">${irEsc(xLabel(r))}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;">${baseLine}${bars}${labels}${xLabels}</svg>`;
}
/* Gráfico de barras agrupadas (3 séries por ciclo: Peças/Locais/Valor) — "Comparativo
   de Acurácias entre Ciclos" do Dashboard. Ciclo sem indicadores ainda (não processado)
   entra com barras cinza vazias, só pra manter o eixo com todos os ciclos cadastrados. */
function irBuildAcuraciaCiclosSvg(rows, opts){
  opts = opts||{};
  const meta = opts.meta!=null ? opts.meta : 0.97;
  const cores = {pecas:'#FA4616', locais:'#001A72', valor:'#1D1F2A', vazio:'#D8DCE3', axis:'#6B7280', label:'#1D1F2A', meta:'#6B7280'};
  const W = 800, H = 260;
  const padL = 14, padR = 14, padT = 30, padB = 32;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const n = Math.max(1, rows.length);
  const grupoW = plotW/n;
  const barW = Math.min(46, grupoW*0.26);
  const gap = 6;
  const metaY = padT + plotH*(1-meta);
  let bars = '', labels = '', xLabels = '';
  rows.forEach((r,i)=>{
    const cx = padL + (i+0.5)*grupoW;
    const series = [{v:r.pecas, cor:cores.pecas}, {v:r.locais, cor:cores.locais}, {v:r.valor, cor:cores.valor}];
    const totalW = series.length*barW + (series.length-1)*gap;
    let bx = cx - totalW/2;
    series.forEach(s=>{
      const tem = s.v!==null && s.v!==undefined;
      const bh = tem ? Math.max(0,Math.min(1,s.v))*plotH : plotH*0.015;
      const by = padT+plotH-bh;
      bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${tem?s.cor:cores.vazio}" rx="3"/>`;
      if(tem) labels += `<text x="${(bx+barW/2).toFixed(1)}" y="${(by-7).toFixed(1)}" font-size="13" text-anchor="middle" fill="${cores.label}" font-weight="800">${(s.v*100).toFixed(1)}%</text>`;
      bx += barW+gap;
    });
    xLabels += `<text x="${cx.toFixed(1)}" y="${H-10}" font-size="14" text-anchor="middle" fill="${cores.axis}" font-weight="800">${irEsc(r.label)}</text>`;
  });
  const metaLine = `<line x1="${padL}" y1="${metaY.toFixed(1)}" x2="${W-padR}" y2="${metaY.toFixed(1)}" stroke="${cores.meta}" stroke-width="1.5" stroke-dasharray="5 4"/>
    <text x="${W-padR}" y="${(metaY-6).toFixed(1)}" font-size="13" text-anchor="end" fill="${cores.meta}" font-weight="700">Meta ${(meta*100).toFixed(0)}%</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;">${metaLine}${bars}${labels}${xLabels}</svg>`;
}
function irRenderComparativoCiclosPanel(){
  const pares = IR.comparativoCiclos;
  if(!pares || pares.length<1) return '';
  const rows = pares.map(({ciclo,ind})=>({
    label: irCicloLabel(ciclo),
    pecas: ind?ind.acuraciaPecas:null, locais: ind?ind.acuraciaLocal:null, valor: ind?ind.acuraciaValor:null
  }));
  let pecasContadas=0, pecasDivergentes=0, locaisContados=0, locaisDivergentes=0, valorContado=0, valorDivergente=0;
  let temValorContado=false;
  for(const {ind} of pares){
    if(!ind) continue;
    pecasContadas += ind.pecasContadas||0; pecasDivergentes += ind.pecasDivergentes||0;
    locaisContados += ind.locaisContadosTotal||0;
    // locaisDivergentes é campo novo — ciclo processado antes dele existir cai no
    // fallback (soma de "locais" do divergentesPorDia, já existia e é equivalente).
    locaisDivergentes += ind.locaisDivergentes!=null ? ind.locaisDivergentes : (ind.divergentesPorDia||[]).reduce((s,d)=>s+(d.locais||0),0);
    // valorFisicoTotal também é novo, sem fallback confiável — só soma quando existe,
    // pra não mostrar R$ 0,00 como se fosse um valor real (ciclo precisa reprocessar).
    if(ind.valorFisicoTotal!=null){ temValorContado = true; valorContado += ind.valorFisicoTotal; }
    valorDivergente += ind.valorDivergenteAbsoluto||0;
  }
  return `<div class="panel">
    <h3>Comparativo de Acurácias entre Ciclos</h3>
    <p class="panel-sub">Peças, Locais e Valor de cada ciclo já processado, com a meta de ${irFmtPct(IR_META_ACURACIA)}.</p>
    ${irBuildAcuraciaCiclosSvg(rows, {meta:IR_META_ACURACIA})}
    <div class="cmp-legend">
      <span><span class="cmp-dot" style="background:#FA4616;"></span>Peças</span>
      <span><span class="cmp-dot" style="background:#001A72;"></span>Locais</span>
      <span><span class="cmp-dot" style="background:#1D1F2A;"></span>Valor</span>
    </div>
    <div class="kpi-blocks" style="margin-top:14px;">
      ${irKpiBlock('orange','📦','Peças',
        irKpiTile('🎯', pecasContadas>0?irFmtPct(1-pecasDivergentes/pecasContadas):'—', 'Acurácia Geral', '', 'todos os ciclos') +
        irKpiTile('📦', irFmtInt(pecasContadas), 'Contadas', '', 'todos os ciclos') +
        irKpiTile('⚠️', irFmtInt(pecasDivergentes), 'Divergentes', 'bad', ''))}
      ${irKpiBlock('blue','📍','Locais',
        irKpiTile('🎯', locaisContados>0?irFmtPct(1-locaisDivergentes/locaisContados):'—', 'Acurácia Geral', '', 'todos os ciclos') +
        irKpiTile('📍', irFmtInt(locaisContados), 'Contados', '', 'todos os ciclos') +
        irKpiTile('⚠️', irFmtInt(locaisDivergentes), 'Divergentes', 'bad', ''))}
      ${irKpiBlock('black','💰','Valor',
        irKpiTile('🎯', temValorContado&&valorContado>0?irFmtPct(1-valorDivergente/valorContado):'—', 'Acurácia Geral', '', temValorContado?'todos os ciclos':'reprocesse o ciclo pra habilitar') +
        irKpiTile('💰', temValorContado?irFmtMoney(valorContado):'—', 'Contado', '', '') +
        irKpiTile('⚠️', irFmtMoney(valorDivergente), 'Divergente', 'bad', ''))}
    </div>
  </div>`;
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
  // Mesma base do KPI "Andamento" (locaisConcluidos ÷ locaisCongelados) — antes esse
  // donut usava locaisContadosTotal (inclui locais ainda "em contagem", não fechados),
  // o que fazia o % daqui não bater com o card de Andamento do Ciclo.
  const total = ind.locaisCongelados||0, concluidos = ind.locaisConcluidos||0;
  const pct = total>0 ? concluidos/total : 0;
  const porMes = irAgruparContadosPorMes(ind.contadosPorDia, IR.cicloAtivo && IR.cicloAtivo.dataAbertura);
  const maxMes = Math.max(1, ...porMes.map(m=>m.total));
  return `<div class="panel">
    <h3>Status do Inventário</h3>
    <p class="panel-sub">Percentual de locais concluídos em relação ao total orçado do ciclo.</p>
    <div class="status-donut-row">
      ${irDonutSvg(pct)}
      <div class="status-donut-stats">
        <div class="status-donut-stat"><div class="n mono">${irFmtInt(total)}</div><div class="l">Locais totais (orçados)</div></div>
        <div class="status-donut-stat"><div class="n mono good">${irFmtInt(concluidos)}</div><div class="l">Locais concluídos</div></div>
        <div class="status-donut-stat"><div class="n mono bad">${irFmtInt(total-concluidos)}</div><div class="l">Ainda não concluídos</div></div>
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
    <div class="bi-vbars-scroll">
      <div class="bi-vbars bi-vbars-meta">
        <div class="bi-vbar-meta-line" style="bottom:${metaPct}%;"><span>Meta ${irFmtInt(IR_META_DIARIA)}</span></div>
        ${rows.map(r=>`<div class="bi-vbar-col" onmouseenter="irShowDiaTooltip(event,'${r.dia}')" onmousemove="irMoveDiaTooltip(event)" onmouseleave="irHideDiaTooltip()">
          <div class="bi-vbar-val">${irFmtInt(r.total)}</div>
          <div class="bi-vbar orange" style="height:${Math.round(r.total/max*100)}%;"></div>
          <div class="bi-vbar-label">${new Date(r.dia+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}
// Peças/Valor/Locais divergentes por dia — mesmo estilo do gráfico "Contados por
// Dia" (barras por dia da Data Fim/Situação da rodada final do local), mas sem a
// linha de meta, já que aqui não existe uma meta diária de divergência. Ajuda a
// responder "quando o NET desviou" com números concretos, não só o total do mês.
function irRenderDivergentesPorDiaPanel(ind){
  const rows = ind.divergentesPorDia||[];
  if(!rows.length) return '';
  const diaLabel = (dia)=> new Date(dia+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  const chart = (campo, cor, fmt, titulo)=>{
    const max = Math.max(1, ...rows.map(r=>r[campo]));
    return `<div class="panel">
      <h3>${titulo}</h3>
      <div class="bi-vbars-scroll">
        <div class="bi-vbars">
          ${rows.map(r=>`<div class="bi-vbar-col">
            <div class="bi-vbar-val">${fmt(r[campo])}</div>
            <div class="bi-vbar ${cor}" style="height:${Math.round(r[campo]/max*100)}%;"></div>
            <div class="bi-vbar-label">${diaLabel(r.dia)}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  };
  return `<div class="bi-grid-3">
    ${chart('pecas','orange',irFmtInt,'Peças Divergentes por Dia')}
    ${chart('valor','ink',irFmtMoney,'Valor Divergente por Dia (abs.)')}
    ${chart('locais','blue',irFmtInt,'Locais Divergentes por Dia')}
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
// Mesma regra de "locais concluídos" usada nos KPIs de Acurácia (worker.js) — local
// ainda em contagem/recontagem pode mudar de rodada no próximo reprocessamento, então
// não é um saldo final. Sem esse filtro, "Itens mais Divergentes" somava rodadas
// intermediárias do mesmo local (cada recontagem reabre e reconta o item do zero),
// inflando o saldo de itens muito recontados bem acima do que a QRY0144 mostra.
const IR_LOCAIS_CONCLUIDO = new Set(['convergido','encerrado_sem_convergencia']);
function irSoLocaisConcluidos(divergencias){
  return (divergencias||[]).filter(d=>IR_LOCAIS_CONCLUIDO.has(d.statusLocal));
}
function irCalcItemSaldo(divergencias){
  const map = new Map();
  for(const d of irSoLocaisConcluidos(divergencias)){
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
// Busca as divergências do escopo escolhido pro painel "Itens mais Divergentes":
// só o ciclo ativo (padrão, já carregado em memória), um ano inteiro (soma de todos
// os ciclos abertos naquele ano) ou todos os ciclos já processados. É por isso que
// o saldo por item pode "não bater" com um relatório de fora (ex.: QRY0144) — aqui
// é sempre soma líquida (ganho − perda), mas só dentro do escopo escolhido.
async function irCarregarDivergenciasEscopo(escopo){
  if(escopo.tipo==='ano'){
    const ciclosDoAno = IR.ciclos.filter(c=>String(c.dataAbertura||'').slice(0,4)===String(escopo.ano));
    const listas = await Promise.all(ciclosDoAno.map(c=>irGetByCiclo(IR_STORES.divergencias, c.id)));
    return listas.flat();
  }
  if(escopo.tipo==='todos'){
    const listas = await Promise.all(IR.ciclos.map(c=>irGetByCiclo(IR_STORES.divergencias, c.id)));
    return listas.flat();
  }
  return IR.divergencias; // 'ciclo' — já está carregado em memória
}
async function irAtualizarItemDivSaldo(){
  const divs = await irCarregarDivergenciasEscopo(IR.itemDivFiltro);
  IR.itemDivSaldo = irCalcItemSaldo(divs);
  irRenderView();
}
function irOnItemDivEscopoChange(value){
  IR.itemDivFiltro = value.startsWith('ano:') ? {tipo:'ano', ano:value.slice(4)} : {tipo:value};
  irAtualizarItemDivSaldo();
}
function irItemDivEscopoLabel(){
  const f = IR.itemDivFiltro;
  if(f.tipo==='ano') return `no ano ${f.ano} (todos os ciclos)`;
  if(f.tipo==='todos') return 'em todos os ciclos já processados';
  return 'no ciclo atual';
}
function irRenderItemDivEscopoBar(){
  const anos = Array.from(new Set(IR.ciclos.map(c=>String(c.dataAbertura||'').slice(0,4)).filter(Boolean))).sort((a,b)=>b.localeCompare(a));
  const f = IR.itemDivFiltro;
  const valorAtual = f.tipo==='ano' ? 'ano:'+f.ano : f.tipo;
  return `<div class="panel dash-filter-bar" style="margin-bottom:14px;">
    <div class="dash-filter-group">
      <label>Escopo dos itens divergentes</label>
      <select onchange="irOnItemDivEscopoChange(this.value)">
        <option value="ciclo" ${valorAtual==='ciclo'?'selected':''}>Ciclo atual (${irEsc(irCicloLabel(IR.cicloAtivo))})</option>
        ${anos.map(a=>`<option value="ano:${a}" ${valorAtual==='ano:'+a?'selected':''}>Ano ${a} (todos os ciclos)</option>`).join('')}
        <option value="todos" ${valorAtual==='todos'?'selected':''}>Todos os ciclos já processados</option>
      </select>
    </div>
  </div>`;
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
    // Botão no TOPO da lista (antes de qualquer linha) — dá pra abrir/fechar sem
    // rolar até o meio ou o fim da lista, ainda mais útil quando "ver mais" trouxer
    // muitas linhas.
    return `<button class="btn-link" style="margin:0 0 6px;" onclick="irToggleCollapse('${uid}', this)">Ver mais (+${resto.length})</button>
      ${visiveis}<div id="${uid}" style="display:none;">${resto.map(i=>row(i,cls)).join('')}</div>`;
  };
  return `<div class="panel">
    <h3>${titulo}</h3>
    <p class="panel-sub">${isValor ? 'Soma líquida do valor divergente por item' : 'Soma líquida da diferença de quantidade por item'}, ${irItemDivEscopoLabel()}.</p>
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
    rpTile('💰', irFmtMoney(ind.valorFisicoTotal), 'Valor Contado', '', 'total físico') +
    rpTile('⚠️', irFmtMoney(ind.valorDivergenteAbsoluto), 'Valor Divergente', 'bad', 'soma absoluta')
  );
  const blocoCiclo = rpBlock('neutral','🔄','Ciclo',
    rpTile('📊', irFmtPct(ind.andamentoCiclo), 'Andamento', '', irFmtInt(ind.locaisConcluidos)+' de '+irFmtInt(ind.locaisCongelados)) +
    rpTile('📅', ind.diasRestantes===null?'—':irFmtInt(ind.diasRestantes), 'Dias Restantes', '', 'dias úteis · exclui feriados') +
    rpTile('⚡', irFmtPct(ind.eficiencia), 'Eficiência', ind.eficiencia>=0.8?'good':(ind.eficiencia<0.5?'bad':''), 'qualidade x velocidade')
  );

  const rua = (ind.porRua||[]).filter(r=>r.chave!=='(sem rua)').slice().sort((a,b)=>b.pecasDivergentes-a.pecasDivergentes);
  const rowsLog = irFiltrarLogsValidos(ind.porLog);
  const rowsLogComTotal = rowsLog.length ? [...rowsLog, irCalcLogTotal(rowsLog)] : [];
  // Mesma base do KPI "Andamento" (locaisConcluidos), pra bater com o card de Ciclo.
  const pctContagem = ind.locaisCongelados>0 ? ind.locaisConcluidos/ind.locaisCongelados : 0;
  const rpDonutColors = {color:'#FA4616', track:'#EEF0F4', textColor:'#1D1F2A'};
  const rpLogColors = {pecas:'#FA4616', posicoes:'#001A72', valor:'#1D1F2A', grid:'#E4E7EE', axis:'#6B7280'};
  const porMes = irAgruparContadosPorMes(ind.contadosPorDia, c.dataAbertura);
  const maxMes = Math.max(1, ...porMes.map(m=>m.total));
  // NET mensal (QRY410) — a série do ano inteiro, ganho/perda de TODOS os ajustes do
  // CD (não só o ciclo rotativo). Diferente do "Divergente (líq.)" acima, que é só o
  // líquido do ciclo. Fica de fora se a 410 ainda não foi processada.
  const netMensalRows = (IR.net410Data && IR.net410Data.porMes || []).map(m=>({
    mes:m.mes, net:m.net, label: IR_MES_NOMES_ABREV[parseInt(m.mes.slice(5,7),10)-1]
  }));
  const netMensalTotal = netMensalRows.reduce((s,r)=>s+r.net,0);
  const html = `<div class="rp-page">
    <div class="rp-hero">
      <div class="rp-hero-top">
        <img src="brand/Logo_LDM_hor_2.png" alt="Loja do Mecânico" class="rp-hero-logo">
        <div class="rp-hero-status">${c.status==='aberto'?'Ciclo em andamento':'Ciclo encerrado'}</div>
      </div>
      <div class="rp-hero-badge">Boletim de Inventário</div>
      <h1>Andamento do ${irCicloLabel(c)}</h1>
      <p>Loja do Mecânico · Centro de Distribuição Cajamar</p>
    </div>
    <div class="rp-body">

    <div class="rp-blocks">
      ${blocoPecas}${blocoLocais}${blocoValor}${blocoCiclo}
    </div>

    ${netMensalRows.length ? `${sectionTitle('📈','NET Mensal em Colunas','QRY410 — mesmo valor da tabela abaixo, um mês por coluna pra facilitar a leitura lado a lado')}
    <div class="rp-panel rp-panel-pad">
      ${irBuildColunasComBaseZeroSvg(netMensalRows, {campo:'net', fmt:irFmtMoney, xLabel:r=>r.label, corPos:'#001A72', corNeg:'#C0392B'})}
      <div class="table-wrap" style="margin-top:14px;"><table class="rp-table">
        <thead><tr><th>Indicador</th>${netMensalRows.map(r=>`<th>${irEsc(r.label)}</th>`).join('')}<th>Total ${irEsc(String(IR.net410AnoSel||''))}</th></tr></thead>
        <tbody><tr><td>NET</td>${netMensalRows.map(r=>`<td style="color:${r.net>=0?'#001A72':'#C0392B'};font-weight:700;">${irFmtMoney(r.net)}</td>`).join('')}<td style="font-weight:800;">${irFmtMoney(netMensalTotal)}</td></tr></tbody>
      </table></div>
    </div>` : ''}

    ${sectionTitle('🟡','Status do Inventário','percentual de locais contados')}
    <div class="rp-panel rp-panel-pad">
      <div class="rp-donut-row">
        ${irDonutSvg(pctContagem, rpDonutColors)}
        <div class="rp-donut-stats">
          <div class="rp-donut-stat"><div class="n">${irFmtInt(ind.locaisCongelados)}</div><div class="l">Locais totais (orçados)</div></div>
          <div class="rp-donut-stat"><div class="n good">${irFmtInt(ind.locaisConcluidos)}</div><div class="l">Locais concluídos</div></div>
          <div class="rp-donut-stat"><div class="n bad">${irFmtInt(ind.locaisCongelados-ind.locaisConcluidos)}</div><div class="l">Ainda não concluídos</div></div>
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

    ${ind.divergentesPorDia && ind.divergentesPorDia.length ? `${sectionTitle('⚠️','Peças Divergentes por Dia','soma da diferença absoluta, por dia de fechamento do local')}
    <div class="rp-panel rp-panel-pad">
      ${irBuildContadosPorDiaSvg(ind.divergentesPorDia, null, {colors:{bar:'#FA4616', grid:'#E4E7EE', axis:'#6B7280', label:'#1D1F2A'}, campo:'pecas', fmt:irFmtInt})}
    </div>
    ${sectionTitle('💰','Valor Divergente por Dia','soma do valor divergente absoluto (QRY0843), por dia de fechamento do local')}
    <div class="rp-panel rp-panel-pad">
      ${irBuildContadosPorDiaSvg(ind.divergentesPorDia, null, {colors:{bar:'#1D1F2A', grid:'#E4E7EE', axis:'#6B7280', label:'#1D1F2A'}, campo:'valor', fmt:irFmtMoney})}
    </div>
    ${sectionTitle('📍','Locais Divergentes por Dia','locais fechados com pelo menos 1 item divergente, por dia')}
    <div class="rp-panel rp-panel-pad">
      ${irBuildContadosPorDiaSvg(ind.divergentesPorDia, null, {colors:{bar:'#001A72', grid:'#E4E7EE', axis:'#6B7280', label:'#1D1F2A'}, campo:'locais', fmt:irFmtInt})}
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
    const assunto = `Boletim Inventário — Ciclo ${numero}`;
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
  // Aqui a métrica é "local CONTADO" (esforço de cada colaborador), não "local
  // fechado" — um local recontado por mais de um colaborador conta pra todos que
  // participaram, de propósito (cada um fez trabalho real ali). Por isso o total
  // somado das linhas pode passar do total único de locais do ciclo — são métricas
  // diferentes: essa é "quem trabalhou onde", não deduplicação de local.
  for(const c of contagens){
    // Hora do bloco = Data Fim Contagem (quando o local foi de fato finalizado), não
    // Início — Início é só quando o colaborador abriu a contagem, podendo ficar em
    // aberto além do horário de trabalho dele (ex.: local pendurado, retomado depois
    // por outra pessoa ou fechado só no dia seguinte), o que jogava contagens pra
    // horários que ele nem estava trabalhando mais.
    const dataRef = c.dataFimContagem || c.dataInicioContagem;
    const horaCompleta = dataRef.slice(0,13); // YYYY-MM-DDTHH (p/ homem-hora)
    const horaDia = parseInt(dataRef.slice(11,13), 10); // 0-23 (p/ matriz)
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
      <p class="rp-footer">Gerado automaticamente pelo módulo Inventário.</p>
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
// Descrição completa só cabe truncada — junta palavras do início até ~42 caracteres
// (o suficiente pra identificar o item na maioria dos casos, sem quebrar a linha) e
// fecha com a última palavra; o texto completo fica no title (tooltip ao passar o
// mouse). Só corta quando realmente precisa — descrições curtas passam inteiras.
function irTruncDesc(nome){
  const s = String(nome||'').trim();
  if(!s) return '—';
  const partes = s.split(/\s+/);
  if(partes.length<=2) return irEsc(s);
  const LIMITE = 42;
  let out = partes[0], i = 1;
  while(i<partes.length-1 && (out+' '+partes[i]).length<=LIMITE){ out += ' '+partes[i]; i++; }
  if(i>=partes.length-1) return irEsc(s);
  return irEsc(out+' … '+partes[partes.length-1]);
}
// Evidência = a prova documental de cada lançamento que formou o saldo do item (Num
// Doc, quem fez, quando, sentido, qtd, valor e a Observação WMS original) — pra
// responder "evidencie essa divergência" sem precisar abrir a QRY410 original.
function irBuildMovEvidenciaTable(movs){
  const row = (m)=>{
    const dh = m.dataHora ? new Date(m.dataHora) : null;
    // getUTC* — mesmo motivo do resto da 410: SheetJS monta a data com componentes
    // UTC, então ler com getters locais desloca a hora em fusos negativos (Brasil).
    const dhLabel = dh ? `${String(dh.getUTCDate()).padStart(2,'0')}/${String(dh.getUTCMonth()+1).padStart(2,'0')}/${dh.getUTCFullYear()} ${String(dh.getUTCHours()).padStart(2,'0')}:${String(dh.getUTCMinutes()).padStart(2,'0')}` : '—';
    return `<tr>
      <td class="mono">${irEsc(m.numDoc||'—')}</td>
      <td>${irEsc(m.usuario||'—')}</td>
      <td class="mono">${dhLabel}</td>
      <td>${irEsc(m.sentido||'—')}</td>
      <td class="mono">${irFmtInt(m.qtd)}</td>
      <td class="mono">${irFmtMoney(m.valor)}</td>
      <td style="font-size:11px;">${irEsc(m.obsWms||'—')}</td>
    </tr>`;
  };
  return `<div class="table-wrap" style="margin:0 0 4px 24px;">
    <table>
      <thead><tr><th>Num Doc</th><th>Usuário</th><th>Data/Hora</th><th>Sentido</th><th>Qtd</th><th>Valor</th><th>Observação WMS</th></tr></thead>
      <tbody>${movs.map(row).join('')}</tbody>
    </table>
  </div>`;
}
function irToggleMovEvidencia(uid, btn){
  const el = document.getElementById(uid);
  if(!el) return;
  const abrindo = el.style.display==='none';
  el.style.display = abrindo ? '' : 'none';
  if(abrindo){
    btn.dataset.labelVer = btn.dataset.labelVer || btn.textContent;
    btn.textContent = 'Ocultar';
  } else {
    btn.textContent = btn.dataset.labelVer || 'Ver';
  }
}
// "Gerar Auditoria" — pega os Top N itens que já estão na tela (mesmo período/
// filtro que o usuário está vendo) e cruza CADA UM com TODOS os locais onde ele
// está divergente no ciclo ativo (não só o "local mais divergente" já mostrado na
// tabela) — um item pode ter mais de um local divergente, e o local pode até se
// repetir entre itens diferentes; a lista final é o que se entrega pro colaborador
// ir auditar fisicamente.
function irGerarAuditoriaNet(){
  const input = document.getElementById('ir-net-audit-n');
  const n = Math.max(1, parseInt(input && input.value, 10) || 10);
  IR.netAuditoriaN = n;
  const itens = (IR._netComCoberturaAtual || []).slice(0, n);
  if(!itens.length){ irShowToast('Sem itens nesse período pra gerar auditoria.', true); return; }
  const linhas = [];
  for(const i of itens){
    const locais = (IR.divergencias||[]).filter(d=>d.item===i.item && d.diferenca!==0)
      .sort((a,b)=>Math.abs(b.vlDivergencia)-Math.abs(a.vlDivergencia));
    if(!locais.length){
      linhas.push({item:i.item, nome:i.nome, saldoValor:i.saldoValor, local:null});
    } else {
      // Um item pode aparecer em mais de um local (e o local pode se repetir entre
      // itens diferentes) — lista TODOS, sem esconder nenhum, pra garantir que o
      // auditor não deixe de conferir uma posição.
      for(const l of locais) linhas.push({item:i.item, nome:i.nome, saldoValor:i.saldoValor, local:l.local, qtdeSistema:l.qtdeSistema, qtdeFisica:l.qtdeFisica, diferenca:l.diferenca, vlDivergencia:l.vlDivergencia});
    }
  }
  IR.netAuditoriaGerada = {geradoEm: new Date().toLocaleString('pt-BR'), mesLabel: IR._netMesLabelAtual, n, itensCount: itens.length, linhas};
  irRenderView();
}
function irRenderAuditoriaNetGerada(){
  const g = IR.netAuditoriaGerada;
  const row = (l)=>`<tr>
    <td class="mono">${irEsc(l.item)}</td>
    <td title="${irEsc(l.nome||'')}">${irTruncDesc(l.nome)}</td>
    <td class="mono" style="color:${l.saldoValor>=0?'var(--blue)':'var(--danger)'};font-weight:700;">${l.saldoValor>=0?'+':''}${irFmtMoney(l.saldoValor)}</td>
    <td class="mono">${l.local ? irEsc(l.local) : '<span class="field-hint">fora do ciclo atual</span>'}</td>
    <td class="mono">${l.qtdeSistema!==undefined?irFmtInt(l.qtdeSistema):'—'}</td>
    <td class="mono">${l.qtdeFisica!==undefined?irFmtInt(l.qtdeFisica):'—'}</td>
    <td class="mono" style="color:${l.diferenca>0?'var(--success)':(l.diferenca<0?'var(--danger)':'var(--ink)')};font-weight:700;">${l.diferenca!==undefined?(l.diferenca>0?'+':'')+irFmtInt(l.diferenca):'—'}</td>
  </tr>`;
  return `<div class="panel" style="background:var(--surface2);margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:4px;">
      <h3 style="margin:0;">Auditoria Direcionada — Top ${g.n} de ${irEsc(g.mesLabel)}</h3>
      <button class="btn btn-secondary" onclick="irBaixarAuditoriaNetImagem()">📥 Baixar / Compartilhar</button>
    </div>
    <p class="field-hint" style="margin-bottom:12px;">Gerado em ${irEsc(g.geradoEm)} · ${g.itensCount} ${g.itensCount===1?'item':'itens'} · ${g.linhas.length} ${g.linhas.length===1?'local a conferir':'locais a conferir'}.</p>
    <div class="table-wrap"><table class="table-dense">
      <thead><tr><th>Item</th><th>Descrição</th><th>Saldo no período</th><th>Local</th><th>Qtde Sistema</th><th>Qtde Física</th><th>Diferença</th></tr></thead>
      <tbody>${g.linhas.map(row).join('')}</tbody>
    </table></div>
  </div>`;
}
async function irBaixarAuditoriaNetImagem(){
  const g = IR.netAuditoriaGerada;
  if(!g) return;
  const c = IR.cicloAtivo;
  const row = (l)=>`<tr>
    <td>${irEsc(l.item)}</td>
    <td>${irEsc(l.nome||'')}</td>
    <td>${l.saldoValor>=0?'+':''}${irFmtMoney(l.saldoValor)}</td>
    <td>${l.local ? irEsc(l.local) : 'fora do ciclo atual'}</td>
    <td>${l.qtdeSistema!==undefined?irFmtInt(l.qtdeSistema):'—'}</td>
    <td>${l.qtdeFisica!==undefined?irFmtInt(l.qtdeFisica):'—'}</td>
    <td>${l.diferenca!==undefined?(l.diferenca>0?'+':'')+irFmtInt(l.diferenca):'—'}</td>
  </tr>`;
  const html = `<div class="rp-page">
    <div class="rp-hero">
      <div class="rp-hero-top">
        <img src="brand/Logo_LDM_hor_2.png" alt="Loja do Mecânico" class="rp-hero-logo">
      </div>
      <div class="rp-hero-badge">Auditoria Direcionada</div>
      <h1>Top ${g.n} itens de ${irEsc(g.mesLabel)}</h1>
      <p>Loja do Mecânico · Centro de Distribuição Cajamar${c?' · '+irEsc(irCicloLabel(c)):''}</p>
    </div>
    <div class="rp-body">
      <p class="rp-footer" style="margin:0 0 14px;">Gerado em ${irEsc(g.geradoEm)} · ${g.itensCount} itens · ${g.linhas.length} locais a conferir</p>
      <div class="rp-panel"><table class="rp-table">
        <thead><tr><th>Item</th><th>Descrição</th><th>Saldo no período</th><th>Local</th><th>Qtde Sistema</th><th>Qtde Física</th><th>Diferença</th></tr></thead>
        <tbody>${g.linhas.map(row).join('')}</tbody>
      </table></div>
      <p class="rp-footer">Gerado automaticamente pelo módulo Inventário.</p>
    </div>
  </div>`;
  irBaixarBoletimImagem(html, `Auditoria_Direcionada_${new Date().toISOString().slice(0,10)}.png`);
}
async function irIgnorarNet410Item(item, nome){
  await irSaveNet410Ignorado(item, nome);
  IR.net410Ignorados = await irGetNet410IgnoradosAll();
  irShowToast(`"${nome||item}" não vai mais aparecer nessa análise — gerenciar em Configurações.`);
  irRenderView();
}
// Um item entra na análise com qualquer movimento (Observação WMS) batendo com algum
// padrão ignorado (ex.: "SALDO") — não precisa bater com TODOS os movimentos do item,
// já que um único ajuste desse tipo já é motivo suficiente pra não confiar no saldo do
// período todo pra esse item.
function irItemTemPadraoIgnorado(item, padroes){
  if(!padroes.length) return false;
  const movs = item.movimentos||[];
  return movs.some(mv=>{
    const obs = String(mv.obsWms||'').toUpperCase();
    return padroes.some(p=>obs.includes(p.padrao.toUpperCase()));
  });
}
async function irAdicionarNet410Padrao(){
  const input = document.getElementById('ir-net410-padrao-novo');
  const texto = input ? input.value.trim() : '';
  if(!texto){ irShowToast('Informe um trecho da Observação WMS.', true); return; }
  await irSaveNet410PadraoIgnorado(texto);
  IR.net410Padroes = await irGetNet410PadroesIgnoradosAll();
  if(input) input.value = '';
  irShowToast(`Itens com "${texto}" na Observação WMS não vão mais aparecer na análise do NET.`);
  irRenderView();
}
async function irRemoverNet410PadraoUI(id){
  await irRemoverNet410PadraoIgnorado(id);
  IR.net410Padroes = await irGetNet410PadroesIgnoradosAll();
  irShowToast('Padrão removido — itens com esse trecho voltam a aparecer na análise.');
  irRenderView();
}
function irSetDivNetMes(mes){ IR.divNetMesSel = mes; IR.divNetDiaSel = null; irRenderView(); }
function irSetDivNetDia(dia){ IR.divNetDiaSel = dia || null; irRenderView(); }
function irToggleNetItensResto(uid, btn){
  const el = document.getElementById(uid);
  if(!el) return;
  const abrindo = el.style.display==='none';
  el.style.display = abrindo ? '' : 'none';
  btn.textContent = abrindo ? 'Ver menos' : btn.dataset.labelFechado;
}
// Maiores ganhos/perdas separados por valor e por peças — em vez de uma lista só
// misturando os dois sinais ordenada por |saldo| (confuso: um ganho grande e uma
// perda grande apareciam lado a lado sem destaque visual do sinal). Mesmo estilo de
// barra horizontal já usado em "Itens mais Divergentes" do Dashboard, pra manter a
// linguagem visual consistente e a linha sempre de 1 altura só.
function irRenderNetTopLists(comCobertura){
  const VISIVEL = 6;
  const bloco = (titulo, campo, fmt)=>{
    const pos = comCobertura.filter(i=>i[campo]>0).sort((a,b)=>b[campo]-a[campo]);
    const neg = comCobertura.filter(i=>i[campo]<0).sort((a,b)=>a[campo]-b[campo]);
    const maxAbs = Math.max(1, ...pos.map(i=>i[campo]), ...neg.map(i=>Math.abs(i[campo])));
    const row = (i, cls)=>`<div class="bi-hbar-row bi-hbar-row-money">
      <div class="bi-hbar-label" title="${irEsc(i.item)} — ${irEsc(i.nome||'')}"><span class="mono">${irEsc(i.item)}</span> — ${irEsc(i.nome||i.item)}</div>
      <div class="bi-hbar-track"><div class="bi-hbar-fill ${cls}" style="width:${Math.round(Math.abs(i[campo])/maxAbs*100)}%;"></div></div>
      <div class="bi-hbar-val">${i[campo]>0?'+':''}${fmt(i[campo])}</div>
    </div>`;
    const list = (items, cls)=>{
      if(!items.length) return '<p class="field-hint">Nenhum.</p>';
      const visiveis = items.slice(0, VISIVEL).map(i=>row(i,cls)).join('');
      const resto = items.slice(VISIVEL);
      if(!resto.length) return visiveis;
      const uid = 'ir-nettop-'+Math.random().toString(36).slice(2,9);
      return `<button class="btn-link" style="margin:0 0 6px;" onclick="irToggleCollapse('${uid}', this)">Ver mais (+${resto.length})</button>
        ${visiveis}<div id="${uid}" style="display:none;">${resto.map(i=>row(i,cls)).join('')}</div>`;
    };
    return `<div><h4 style="margin:0 0 10px;font-size:13px;">${titulo}</h4>
      <div class="bi-grid-2">
        <div><p class="field-hint" style="margin-bottom:6px;font-weight:700;color:var(--success);">MAIORES GANHOS</p>${list(pos,'pos')}</div>
        <div><p class="field-hint" style="margin-bottom:6px;font-weight:700;color:var(--danger);">MAIORES PERDAS</p>${list(neg,'neg')}</div>
      </div>
    </div>`;
  };
  return `<div class="panel">
    ${bloco('Por Valor (R$)', 'saldoValor', irFmtMoney)}
    <div class="divider" style="height:1px;background:var(--line);margin:18px 0;"></div>
    ${bloco('Por Quantidade (peças)', 'saldoQtd', irFmtInt)}
  </div>`;
}
// "Por que o NET está distorcido?" — a 410 acumula TODOS os ajustes do CD (o
// Inventário Rotativo/AIR é só um dos motivos), então quando o NET do mês está
// estranhamente alto ou baixo, o auditor precisa saber rápido quais itens específicos
// explicam a maior parte do número — não só uma lista de "top itens" arbitrária, mas
// itens suficientes pra cobrir a maior parte do NET, com local e quantidade pra ir
// direto validar fisicamente.
function irRenderNetDistorcaoPanel(){
  if(!IR.net410Anos.length){
    return `<div class="panel"><p class="field-hint">Nenhuma QRY410 processada ainda — importe na aba <a href="#" onclick="irSwitchTab('importacao');return false;">Importação</a> pra usar essa análise.</p></div>`;
  }
  const d = IR.net410Data;
  if(!d) return '';
  const meses = d.porMes||[];
  if(!meses.length) return `<div class="panel"><p class="field-hint">Sem movimentos no ano ${d.ano}.</p></div>`;
  if(!IR.divNetMesSel || !meses.some(m=>m.mes===IR.divNetMesSel)) IR.divNetMesSel = meses[meses.length-1].mes;
  const mSel = meses.find(mm=>mm.mes===IR.divNetMesSel);
  // Dia é opcional — "ver as divergências de ontem" sem esperar o mês fechar. Os
  // dias do seletor são só os que tiveram movimento dentro do mês escolhido.
  const diasDoMes = (d.porDia||[]).filter(dd=>dd.dia.slice(0,7)===IR.divNetMesSel).sort((a,b)=>a.dia.localeCompare(b.dia));
  if(IR.divNetDiaSel && !diasDoMes.some(dd=>dd.dia===IR.divNetDiaSel)) IR.divNetDiaSel = null;
  const m = IR.divNetDiaSel ? diasDoMes.find(dd=>dd.dia===IR.divNetDiaSel) : mSel;
  const mesLabel = IR.divNetDiaSel
    ? new Date(IR.divNetDiaSel+'T00:00:00').toLocaleDateString('pt-BR')
    : IR_MES_NOMES[parseInt(mSel.mes.slice(5,7),10)-1]+'/'+mSel.mes.slice(0,4);
  const pctAIR = m.net!==0 ? Math.abs(m.netAIR/m.net) : 0;

  // Itens ignorados (motivo já conhecido, ex.: troca de identidade já identificada)
  // saem da análise inteira — não só da lista, também da cobertura acumulada e da
  // movimentação bruta, senão eles continuariam pesando nos % mesmo escondidos.
  const ignoradosSet = new Set((IR.net410Ignorados||[]).map(i=>i.item));
  const padroes = IR.net410Padroes||[];

  // Junta os itens positivos e negativos do mês, ordena por |saldo| — são os que
  // mais pesam na distorção do NET, seja puxando pra cima ou pra baixo.
  const todosOrdenados = [...(m.topItensPositivos||[]), ...(m.topItensNegativos||[])]
    .filter(i=>!ignoradosSet.has(i.item) && !irItemTemPadraoIgnorado(i, padroes))
    .sort((a,b)=>Math.abs(b.saldoValor)-Math.abs(a.saldoValor));
  // Cobertura acumulada usa a MOVIMENTAÇÃO BRUTA (soma de |saldo| de todos os itens),
  // não o NET do mês — quando dois itens grandes se cancelam (ex.: +19.452 de um lado,
  // -19.452 do outro, sobrando quase nada de NET), usar o NET pequeno como base faria
  // a % de cada item explodir pra bem além de 100%, o que não significa nada. A soma
  // bruta sempre vai de 0% a 100% de forma sensata.
  const totalMovimentoBruto = todosOrdenados.reduce((s,i)=>s+Math.abs(i.saldoValor), 0);
  let acumulado = 0;
  const comCobertura = todosOrdenados.map(i=>{
    acumulado += Math.abs(i.saldoValor);
    return {...i,
      pctDoNet: m.netAbs>0 ? Math.abs(i.saldoValor)/m.netAbs : 0,
      pctAcumulado: totalMovimentoBruto>0 ? acumulado/totalMovimentoBruto : 0};
  });
  // Cache pro botão "Gerar Auditoria" — evita recalcular tudo de novo só pra pegar
  // os top N itens do período que já está na tela.
  IR._netComCoberturaAtual = comCobertura;
  IR._netMesLabelAtual = mesLabel;
  // Cancelamento forte = a movimentação bruta é bem maior que o NET final, ou seja,
  // ganhos e perdas grandes quase se anulam — vale alertar, porque é o padrão clássico
  // de item com contagem trocada (ex.: duas variantes de cor do mesmo modelo).
  const cancelamentoForte = m.netAbs>0 && totalMovimentoBruto >= m.netAbs*3;
  // Mostra itens até cobrir 90% da movimentação bruta do mês (com pelo menos 5, pra dar
  // contexto mesmo quando 1-2 itens já dominam) — o resto fica atrás de "ver mais",
  // sem sumir, mas sem poluir a leitura principal.
  const COBERTURA_ALVO = 0.90;
  let corte = comCobertura.findIndex(i=>i.pctAcumulado>=COBERTURA_ALVO);
  if(corte===-1) corte = comCobertura.length-1;
  corte = Math.max(corte, Math.min(4, comCobertura.length-1));
  const visiveis = comCobertura.slice(0, corte+1);
  const resto = comCobertura.slice(corte+1);

  // Itens processados com uma versão anterior da 410 (antes de Ganhos/Saldo no
  // Ano/Quantidade existirem) não têm esses campos — sem isso não dá pra mostrar
  // as colunas novas, então avisa em vez de exibir tudo vazio silenciosamente.
  const dadosDesatualizados = comCobertura.some(i=>i.ganhos===undefined || i.saldoAno===undefined);

  // Local mais divergente pro item no ciclo ATIVO (a 410 não tem local/endereço —
  // só a QRY0843 do ciclo em andamento tem isso). Ajuda o auditor a saber pra onde ir
  // fisicamente validar. Pode não achar nada se o item não estiver no ciclo atual.
  const localMaisDivergente = (item)=>{
    const divs = (IR.divergencias||[]).filter(d=>d.item===item && d.diferenca!==0);
    if(!divs.length) return null;
    divs.sort((a,b)=>Math.abs(b.vlDivergencia)-Math.abs(a.vlDivergencia));
    return divs[0];
  };

  const row = (i)=>{
    // Motivo principal = maior |valor| dentre TODOS os motivos do item (AIR incluso),
    // já vem ordenado do worker — substitui as antigas colunas separadas "AIR" e
    // "Outros motivos", que ficavam as duas vazias quando o item não tinha nenhum
    // motivo classificado nos dados (sinal de reprocessamento pendente).
    const motivoTop = (i.porObs||[])[0];
    const ehAIR = motivoTop && motivoTop.id==='AIR';
    const local = localMaisDivergente(i.item);
    const outrosLocais = local ? (IR.divergencias||[]).filter(d=>d.item===i.item && d.diferenca!==0).length - 1 : 0;
    // Compensado no ano = o mês pesa no NET mas ao longo do ano esse item se anula
    // (ou quase) — ganho de um mês/ciclo cobrindo perda de outro. É essa comparação
    // que permite justificar um NET mensal alto sem estar "sujo".
    const compensado = i.saldoAno!==undefined && Math.abs(i.saldoValor)>0 && Math.abs(i.saldoAno) < Math.abs(i.saldoValor)*0.3;
    const uid = 'ir-mov-'+irEsc(i.item)+'-'+Math.random().toString(36).slice(2,7);
    const movs = i.movimentos||[];
    const linhaPrincipal = `<tr>
      <td class="mono">${irEsc(i.item)}</td>
      <td title="${irEsc(i.nome||'')}">${irTruncDesc(i.nome)}</td>
      <td class="mono" style="color:var(--blue);">${i.ganhos?'+'+irFmtMoney(i.ganhos):'—'}</td>
      <td class="mono" style="font-weight:700;color:${i.saldoValor>=0?'var(--blue)':'var(--danger)'};white-space:nowrap;">${i.saldoValor>=0?'+':''}${irFmtMoney(i.saldoValor)} <span class="field-hint">(${i.saldoQtd!==undefined?(i.saldoQtd>0?'+':'')+irFmtInt(i.saldoQtd)+' pçs':'—'})</span></td>
      <td class="mono" style="font-weight:700;color:${i.saldoAno>=0?'var(--ink)':'var(--danger)'};">${i.saldoAno!==undefined?(i.saldoAno>=0?'+':'')+irFmtMoney(i.saldoAno):'—'}${compensado?' <span class="tag tag-muted">compensado</span>':''}</td>
      <td class="mono">${irFmtPct(i.pctDoNet)}</td>
      <td class="mono" style="font-weight:700;">${irFmtPct(i.pctAcumulado)}</td>
      <td style="font-size:11.5px;">${motivoTop ? `<span style="color:${ehAIR?'var(--orange)':'var(--ink)'};font-weight:700;">${irEsc(irLegenda410(motivoTop.id, IR.net410Legenda))}</span><br>${irFmtMoney(motivoTop.valor)}` : '—'}</td>
      <td style="font-size:11.5px;">${local ? `${irEsc(local.local)}<div class="field-hint">dif. ${local.diferenca>0?'+':''}${irFmtInt(local.diferenca)} pçs${outrosLocais>0?' · +'+outrosLocais:''}</div>` : '<span class="field-hint">fora do ciclo atual</span>'}</td>
      <td><span class="tag ${ehAIR?'tag-good':'tag-muted'}">${ehAIR?'Validar no inventário':'Não é do inventário'}</span></td>
      <td>${movs.length ? `<button class="btn-link" onclick="irToggleMovEvidencia('${uid}', this)">Ver ${movs.length}</button>` : '<span class="field-hint">—</span>'}</td>
      <td><button class="btn-link" title="Já sei o motivo — esconder esse item da análise" onclick="irIgnorarNet410Item('${irEsc(i.item)}','${irEsc((i.nome||'').replace(/'/g,"\\'"))}')">Ignorar</button></td>
    </tr>`;
    if(!movs.length) return linhaPrincipal;
    return linhaPrincipal + `<tr id="${uid}" style="display:none;"><td colspan="12" style="padding:0 0 10px;">${irBuildMovEvidenciaTable(movs)}</td></tr>`;
  };

  const periodoCurto = IR.divNetDiaSel ? 'dia' : 'mês';
  const thead = `<thead><tr><th>Item</th><th>Descrição</th><th>Ganhos no ${periodoCurto}</th><th>Saldo no ${periodoCurto}</th><th>Saldo no ano</th><th>% do NET</th><th>% Acum. movimentação</th><th>Motivo principal</th><th>Local mais divergente (ciclo atual)</th><th>Ação sugerida</th><th>Evidência</th><th></th></tr></thead>`;
  let tabela;
  if(!comCobertura.length){
    tabela = `<p class="field-hint">Nenhum item com saldo válido pro NET nesse ${periodoCurto==='dia'?'dia':'mês'}.</p>`;
  } else {
    const uid = 'ir-net-resto-'+Math.random().toString(36).slice(2,9);
    const coberturaVisivel = visiveis.length ? irFmtPct(visiveis[visiveis.length-1].pctAcumulado) : '0%';
    // Botão de "ver mais" ANTES da tabela — pra recolher de novo sem precisar rolar
    // até o fim de uma lista que pode ter centenas de linhas.
    tabela = `<p class="field-hint" style="margin-bottom:8px;">Esses <strong>${visiveis.length}</strong> ${visiveis.length===1?'item explica':'itens explicam'} <strong>${coberturaVisivel}</strong> da movimentação de ${irEsc(mesLabel)} (${irFmtMoney(totalMovimentoBruto)} em ganhos e perdas somados em módulo).</p>
    ${resto.length ? `<button class="btn-link" style="margin-bottom:8px;" data-label-fechado="Ver mais ${resto.length} até 100% da movimentação" onclick="irToggleNetItensResto('${uid}', this)">Ver mais ${resto.length} até 100% da movimentação</button>` : ''}
    <div class="table-wrap"><table class="table-wide table-dense">
      ${thead}
      <tbody>${visiveis.map(row).join('')}</tbody>
      ${resto.length ? `<tbody id="${uid}" style="display:none;">${resto.map(row).join('')}</tbody>` : ''}
    </table></div>`;
  }

  return `<div class="panel">
    <div class="form-actions" style="align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--line);">
      <div style="max-width:160px;"><label>Top N itens</label><input type="number" id="ir-net-audit-n" min="1" max="100" value="${IR.netAuditoriaN}"></div>
      <button class="btn btn-primary" onclick="irGerarAuditoriaNet()">🔍 Gerar Auditoria</button>
      <p class="field-hint" style="margin:0 0 8px;max-width:38ch;">Monta a lista dos itens mais divergentes do período com todos os locais onde cada um está divergente no ciclo atual — pra entregar pro colaborador auditar fisicamente.</p>
    </div>
    ${IR.netAuditoriaGerada ? irRenderAuditoriaNetGerada() : ''}
    ${dadosDesatualizados ? `<p class="field-hint" style="color:var(--danger);margin-bottom:12px;">⚠️ Alguns dados desse ano foram processados antes de Ganhos, Saldo no Ano e Quantidade existirem nessa análise — aparecem como "—" abaixo. Reimporte a QRY410 na aba <a href="#" onclick="irSwitchTab('importacao');return false;">Importação</a> pra atualizar.</p>` : ''}
    ${cancelamentoForte ? `<p class="field-hint" style="color:var(--orange);margin-bottom:12px;">⚠️ A movimentação bruta de ${irEsc(mesLabel)} (${irFmtMoney(totalMovimentoBruto)}) é bem maior que o NET final (${irFmtMoney(m.netAbs)}) — sinal de que ganhos e perdas grandes estão se cancelando. Vale checar se não é troca de contagem entre itens parecidos (ex.: mesma peça em cores/variações diferentes).</p>` : ''}
    ${ignoradosSet.size ? `<p class="field-hint" style="margin-bottom:12px;">${ignoradosSet.size} ${ignoradosSet.size===1?'item ignorado não aparece':'itens ignorados não aparecem'} nessa análise (motivo já conhecido) — <a href="#" onclick="irSwitchTab('configuracoes');return false;">gerenciar em Configurações</a>.</p>` : ''}
    ${padroes.length ? `<p class="field-hint" style="margin-bottom:12px;">Itens com "${padroes.map(p=>irEsc(p.padrao)).join('", "')}" na Observação WMS não aparecem nessa análise — <a href="#" onclick="irSwitchTab('configuracoes');return false;">gerenciar em Configurações</a>.</p>` : ''}
    <div class="two-col" style="max-width:620px;margin-bottom:14px;grid-template-columns:1fr 1fr 1fr;">
      <div><label>Ano</label><select onchange="irSetNet410Ano(this.value)">
        ${IR.net410Anos.map(a=>`<option value="${a}" ${a===IR.net410AnoSel?'selected':''}>${a}</option>`).join('')}
      </select></div>
      <div><label>Mês</label><select onchange="irSetDivNetMes(this.value)">
        ${meses.map(mm=>`<option value="${mm.mes}" ${mm.mes===IR.divNetMesSel?'selected':''}>${irEsc(IR_MES_NOMES[parseInt(mm.mes.slice(5,7),10)-1])}</option>`).join('')}
      </select></div>
      <div><label>Dia (opcional)</label><select onchange="irSetDivNetDia(this.value)">
        <option value="">Mês inteiro</option>
        ${diasDoMes.map(dd=>`<option value="${dd.dia}" ${dd.dia===IR.divNetDiaSel?'selected':''}>${new Date(dd.dia+'T00:00:00').toLocaleDateString('pt-BR')}</option>`).join('')}
      </select></div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card ${m.net>=0?'good':'bad'}"><div class="num mono">${irFmtMoney(m.net)}</div><div class="label">NET de ${irEsc(mesLabel)}</div></div>
      <div class="kpi-card orange"><div class="num mono">${irFmtMoney(m.netAIR)}</div><div class="label">Vindo do Inventário (AIR)</div></div>
      <div class="kpi-card"><div class="num mono">${irFmtMoney(m.netOutros)}</div><div class="label">Vindo de outros motivos</div></div>
      <div class="kpi-card"><div class="num mono">${irFmtPct(pctAIR)}</div><div class="label">% do NET vindo do inventário</div></div>
    </div>
    ${irRenderNetTopLists(comCobertura)}
    ${tabela}
  </div>`;
}
function irRenderDivergencias(){
  const semDivergencias = !IR.divergencias.length;
  if(semDivergencias && !IR.net410Anos.length) return irEmptyState('Sem divergências carregadas', 'Processe o ciclo na Importação.', "irSwitchTab('importacao')", 'Ir para Importação');
  if(semDivergencias) return irRenderNetDistorcaoPanel();
  const locais = Array.from(new Set(IR.divergencias.map(d=>d.local))).sort();
  return `
    ${irRenderNetDistorcaoPanel()}
    <button class="btn-link" style="margin-bottom:10px;" onclick="irToggleDivRawTable(this)">📋 Ver lista completa de divergências do ciclo atual (${irFmtInt(irDivergenciasFiltered().length)} itens, item × local)</button>
    <div id="ir-div-raw-wrap" style="display:none;">
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
    </div>
  `;
}
function irToggleDivRawTable(btn){
  const el = document.getElementById('ir-div-raw-wrap');
  if(!el) return;
  const abrindo = el.style.display==='none';
  el.style.display = abrindo ? '' : 'none';
  if(abrindo) irMountDivergenciasScroll(false);
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
// Locais pendentes de CONTAGEM no ciclo VIGENTE — cruza a Base Congelada com a
// QRY0843: se existe qualquer linha do local com Situação Local e Situação Inventário
// = Liquidado, o local foi contado (entrou em campo, teve rodada liquidada), mesmo que
// ainda não tenha convergido (rodadas ainda divergindo). "Pendente" aqui é só quem não
// tem NENHUMA linha liquidada — quem ninguém foi contar ainda. Não confundir com
// "concluído" (usado na Acurácia), que exige convergência das rodadas, não só contagem.
// rua (opcional) filtra pela coluna X1 da base congelada, usado pelo botão por
// setor em "Resumo por Setor" — ordenado por DESCRIÇÃO do local, não pelo código.
function irLocaisPendentesContagem(rua){
  // Usa IR.contagens, não IR.divergencias — local confirmado VAZIO (Liquidado, sem
  // nenhum item) é um local válido e contado, mas não gera nenhuma linha em
  // divergencias (o loop que monta divergencias pula linha sem item). Usar só
  // divergencias marcava esses locais como "pendente" por engano, mesmo já contados.
  const contadosSet = new Set((IR.contagens||[]).map(c=>c.local));
  let base = (IR.locais||[]).filter(l=>!contadosSet.has(l.idLocal));
  if(rua) base = base.filter(l=>l.x1===rua);
  return base.sort((a,b)=>String(a.descricao||'').localeCompare(String(b.descricao||''), undefined, {numeric:true}));
}
function irExportarLocaisPendentesCsv(rua){
  if(!IR.cicloAtivo){ irShowToast('Nenhum ciclo ativo.', true); return; }
  const pendentes = irLocaisPendentesContagem(rua);
  if(!pendentes.length){ irShowToast('Nenhum local pendente'+(rua?' na rua '+rua:'')+'.'); return; }
  const header = 'Local;Descrição';
  const lines = pendentes.map(l=>{
    const desc = '"'+String(l.descricao||'').replace(/"/g,'""')+'"';
    return l.idLocal+';'+desc;
  });
  const csv = '﻿'+header+'\n'+lines.join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'locais_pendentes_ciclo_'+IR.cicloAtivo.numero+(rua?'_'+rua:'')+'.csv';
  a.click();
  URL.revokeObjectURL(a.href);
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
  </div>
  ${irRenderNet410LegendaConfig()}
  ${irRenderNet410IgnoradosConfig()}
  ${irRenderNet410PadroesConfig()}`;
}
// Padrões de Observação WMS (ex.: "SALDO") que escondem qualquer item que os carregue
// da análise "Por que o NET está distorcido" — diferente do ignorado item por item,
// vale pra qualquer item futuro que carregue esse mesmo tipo de ajuste.
function irRenderNet410PadroesConfig(){
  const lista = (IR.net410Padroes||[]).slice().sort((a,b)=>(a.criadoEm||'').localeCompare(b.criadoEm||''));
  const row = (p)=>`<tr>
    <td class="mono">${irEsc(p.padrao)}</td>
    <td class="field-hint">${p.criadoEm ? new Date(p.criadoEm).toLocaleDateString('pt-BR') : '—'}</td>
    <td><button class="btn-link" onclick="irRemoverNet410PadraoUI('${irEsc(p.id)}')">Remover</button></td>
  </tr>`;
  return `<div class="panel">
    <h3>Padrões de Observação ignorados na análise do NET</h3>
    <p class="field-hint" style="margin-bottom:12px;">Qualquer item com esse trecho na Observação WMS de algum movimento fica fora da análise "Por que o NET está distorcido", em qualquer mês — útil pra tipos de ajuste recorrentes (ex.: "SALDO INCLUIDO INDEVIDAMENTE...") que aparecem em itens diferentes com o tempo.</p>
    <div class="form-actions" style="margin-bottom:12px;">
      <input type="text" id="ir-net410-padrao-novo" placeholder="Ex.: SALDO" style="max-width:280px;">
      <button class="btn btn-secondary" onclick="irAdicionarNet410Padrao()">Adicionar padrão</button>
    </div>
    ${lista.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Trecho da Observação</th><th>Adicionado em</th><th></th></tr></thead>
      <tbody>${lista.map(row).join('')}</tbody>
    </table></div>` : `<p class="field-hint">Nenhum padrão cadastrado.</p>`}
  </div>`;
}
// Itens ignorados na análise "Por que o NET está distorcido" — marcados manualmente
// no painel de Divergências quando o motivo já é conhecido. Aqui dá pra ver a lista
// completa e trazer o item de volta pra análise a qualquer momento.
function irRenderNet410IgnoradosConfig(){
  const lista = (IR.net410Ignorados||[]).slice().sort((a,b)=>(a.criadoEm||'').localeCompare(b.criadoEm||''));
  const row = (i)=>`<tr>
    <td class="mono">${irEsc(i.item)}</td>
    <td>${irEsc(i.nome||'—')}</td>
    <td class="field-hint">${i.criadoEm ? new Date(i.criadoEm).toLocaleDateString('pt-BR') : '—'}</td>
    <td><button class="btn-link" onclick="irRestaurarNet410Item('${irEsc(i.item)}')">Restaurar</button></td>
  </tr>`;
  return `<div class="panel">
    <h3>Itens ignorados na análise do NET</h3>
    <p class="field-hint" style="margin-bottom:12px;">Itens marcados como "já sei o motivo" no painel "Por que o NET está distorcido" — ficam fora dos rankings e da cobertura até você restaurar aqui.</p>
    ${lista.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Descrição</th><th>Ignorado em</th><th></th></tr></thead>
      <tbody>${lista.map(row).join('')}</tbody>
    </table></div>` : `<p class="field-hint">Nenhum item ignorado.</p>`}
  </div>`;
}
async function irRestaurarNet410Item(item){
  await irRemoverNet410Ignorado(item);
  IR.net410Ignorados = await irGetNet410IgnoradosAll();
  irRenderView();
}
// Legenda de motivos da 410 (AIR/ADE/LOJA/...) — editável aqui em vez de fixa no
// código, pra dar conta de motivo novo ou mudança de classificação sem precisar
// mexer em código. "Considera no NET" só vale a partir do próximo processamento da
// QRY410 (é usado durante a importação); o nome/legenda já atualiza na hora nos
// painéis que buscam ao vivo (ex.: "Motivo principal" em Divergências).
function irRenderNet410LegendaConfig(){
  const lista = (IR.net410Legenda||[]).slice().sort((a,b)=>a.id.localeCompare(b.id));
  const row = (l)=>`<tr>
    <td class="mono">${irEsc(l.id)}</td>
    <td><input type="text" value="${irEsc(l.legenda)}" onchange="irSetLegenda410Campo('${irEsc(l.id)}','legenda',this.value)"></td>
    <td style="text-align:center;"><input type="checkbox" ${l.considerarNet?'checked':''} onchange="irSetLegenda410Campo('${irEsc(l.id)}','considerarNet',this.checked)"></td>
    <td><button class="btn-link" onclick="irRemoverLegenda410('${irEsc(l.id)}')">Remover</button></td>
  </tr>`;
  return `<div class="panel">
    <h3>Legenda de motivos da QRY410</h3>
    <p class="field-hint" style="margin-bottom:12px;">Mapeia o código no início da "Observação WMS" (ex.: AIR, ADE, LOJA) pro nome exibido nos painéis de NET, e se esse motivo entra no cálculo do NET. Código não listado aqui conta como "considera no NET" por padrão. "Considera no NET" só vale a partir da próxima vez que reimportar a QRY410.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Código</th><th>Legenda</th><th style="text-align:center;">Considera no NET</th><th></th></tr></thead>
      <tbody>${lista.map(row).join('')}</tbody>
    </table></div>
    <div class="two-col" style="margin-top:14px;">
      <div><label>Novo código</label><input type="text" id="ir-cfg-legenda-id" placeholder="Ex.: XYZ" style="text-transform:uppercase;"></div>
      <div><label>Legenda</label><input type="text" id="ir-cfg-legenda-nome" placeholder="Ex.: Motivo Novo"></div>
    </div>
    <div class="form-actions"><button class="btn btn-secondary" onclick="irAdicionarLegenda410()">Adicionar código</button></div>
  </div>`;
}
async function irSetLegenda410Campo(id, campo, valor){
  const item = (IR.net410Legenda||[]).find(l=>l.id===id);
  if(!item) return;
  item[campo] = valor;
  await irSaveNet410LegendaItem({...item});
  irShowToast('Legenda salva.');
}
async function irRemoverLegenda410(id){
  IR.net410Legenda = (IR.net410Legenda||[]).filter(l=>l.id!==id);
  await irDeleteNet410LegendaItem(id);
  irRenderView();
}
async function irAdicionarLegenda410(){
  const id = document.getElementById('ir-cfg-legenda-id').value.trim().toUpperCase();
  const nome = document.getElementById('ir-cfg-legenda-nome').value.trim();
  if(!id){ irShowToast('Informe o código.', true); return; }
  if((IR.net410Legenda||[]).some(l=>l.id===id)){ irShowToast('Esse código já existe.', true); return; }
  const item = {id, legenda:nome, considerarNet:true};
  IR.net410Legenda = [...(IR.net410Legenda||[]), item];
  await irSaveNet410LegendaItem(item);
  irRenderView();
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
