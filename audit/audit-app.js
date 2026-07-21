/* ============================================================
   Auditoria de Divergências de Inventário — UI principal
   Módulo independente: importação, motor de regras, diagnóstico,
   dashboards, tela de auditoria, configurações e relatórios.
   Toda a persistência é local (IndexedDB) — sem servidor, sem API.

   Esta camada é só apresentação: nenhuma função aqui recalcula ou
   reinterpreta o diagnóstico/NET — tudo isso vem pronto do worker
   (audit-worker.js). As agregações por item/endereço/inventário
   feitas aqui (Top10, Matriz de Ofensores, painéis) são apenas
   reagrupamentos de exibição sobre os dados já processados.
   ============================================================ */

const AUD = {
  files: {f0114:null, f390:null, f845:null},
  processing:false,
  progress:{stage:'', pct:0},
  worker:null,
  netConfig:[],
  anos:[],
  currentAno:2026,
  indicadores:null,
  importMeta:null,
  kpiPrev:null,
  list:[],
  filtered:[],
  showAll:false,
  filtersOpen:false,
  filters:{search:'', inventario:'', usuario:'', diagnostico:'', necessita:'', valorMin:'', valorMax:'', qtdMin:'', qtdMax:'', dataIni:'', dataFim:'', legenda:'', prioridade:''},
  quickChip:'',
  scrollHandler:null,
  rankSort:{itens:'valorAbs', enderecos:'valorAbs', inventarios:'qtdAbs'},
  op:{sortKey:'vlDivergenciaAbs', sortDir:'desc', groupBy:'', hiddenCols:{}, colMenuOpen:false},
  printScope:'pendentes'
};

const AUD_ROW_H = 272;
const AUD_OP_ROW_H = 30;

function audFmtInt(n){ return Math.round(n||0).toLocaleString('pt-BR'); }
function audFmtNum(n, dec){ return (n||0).toLocaleString('pt-BR', {minimumFractionDigits:dec||0, maximumFractionDigits:dec||2}); }
function audFmtMoney(n){ return (n||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
function audToday(){ return new Date().toISOString().slice(0,10); }

/* ============================================================
   INIT
   ============================================================ */
async function audModuleInit(){
  try{
    AUD.netConfig = await audSeedNetConfigIfEmpty();
    await audLoadAnosDisponiveis();
    if(AUD.anos.length){
      AUD.currentAno = AUD.anos[0];
      await audLoadMetaAndIndicadores(AUD.currentAno);
      await audLoadLista();
    }
  }catch(e){ console.error('Falha ao iniciar módulo de auditoria', e); }
}

async function audLoadAnosDisponiveis(){
  const metas = await audGetAllImportMeta();
  AUD.anos = metas.map(m=>m.ano).sort((a,b)=>b-a);
}
async function audLoadMetaAndIndicadores(ano){
  AUD.importMeta = await audGetImportMeta(ano);
  AUD.indicadores = await audGetIndicadores(ano);
  const hoje = audToday();
  const prevSnap = await audGetPreviousKpiSnapshot(ano, hoje);
  AUD.kpiPrev = prevSnap ? prevSnap.kpis : null;
}
async function audLoadLista(){
  AUD.list = await audGetDivergenciasByAno(AUD.currentAno);
  audApplyFilters();
}

/* ============================================================
   DISPATCH — chamado pelo renderView() do app principal
   ============================================================ */
function audRenderTab(tab){
  const needsData = tab!=='aud-import' && tab!=='aud-config';
  if(needsData && !AUD.indicadores){
    return audWrap(emptyState('Nenhuma auditoria processada ainda', 'Importe as três planilhas em Importação e clique em PROCESSAR AUDITORIA.', "switchTab('aud-import')", 'Ir para Importação'));
  }
  if(tab==='aud-import') return audWrap(audRenderImport());
  if(tab==='aud-home') return audWrap(audRenderHome());
  if(tab==='aud-audit') return audWrap(audRenderAuditoria());
  if(tab==='aud-offenders') return audWrap(audRenderOfensores());
  if(tab==='aud-enderecos') return audWrap(audRenderEnderecos());
  if(tab==='aud-inventarios') return audWrap(audRenderInventarios());
  if(tab==='aud-financeiro') return audWrap(audRenderFinanceiro());
  if(tab==='aud-config') return audWrap(audRenderConfig());
  if(tab==='aud-reports') return audWrap(audRenderRelatorios());
  return '';
}
function audOnRender(tab){
  if(tab==='aud-audit') audMountCardsScroll();
  if(tab==='aud-home') audMountOpTableScroll();
  if(tab==='aud-reports') audFillHistory();
}

/* ============================================================
   HEADER COMPACTO — presente em todas as telas do módulo
   ============================================================ */
function audWrap(inner){
  return `<div class="aud-shell">${audRenderHeaderBar()}${inner}</div>`;
}
function audRenderHeaderBar(){
  const m = AUD.importMeta;
  const dt = m ? new Date(m.processedAt) : null;
  const statusChip = (ok)=>`<span class="aud-hb-status ${ok?'ok':'pend'}">${ok?'OK':'Pendente'}</span>`;
  return `<div class="aud-headerbar">
    <div class="aud-hb-group">Atualizado em <b>${dt?dt.toLocaleDateString('pt-BR'):'—'}</b></div>
    <div class="aud-hb-group">às <b>${dt?dt.toLocaleTimeString('pt-BR'):'—'}</b></div>
    <div class="aud-hb-sep"></div>
    <div class="aud-hb-group">QUERY 0114 ${statusChip(!!m)}</div>
    <div class="aud-hb-group">QUERY 390 ${statusChip(!!m)}</div>
    <div class="aud-hb-group">QUERY 845 ${statusChip(!!m)}</div>
    <div class="aud-hb-sep"></div>
    <div class="aud-hb-group">Registros importados <b class="mono">${m?audFmtInt(m.totalLinhas):'0'}</b></div>
    ${audAnoSelectorInline()}
    <button class="btn btn-primary" onclick="switchTab('aud-import')">Atualizar Auditoria</button>
  </div>`;
}
function audAnoSelectorInline(){
  if(AUD.anos.length<=1) return '';
  return `<select onchange="audChangeAno(this.value)" style="font-size:11px;border:1px solid var(--line);border-radius:4px;background:var(--paper);color:var(--ink);padding:3px 6px;">
    ${AUD.anos.map(a=>`<option value="${a}" ${a===AUD.currentAno?'selected':''}>${a}</option>`).join('')}
  </select>`;
}
async function audChangeAno(ano){
  AUD.currentAno = parseInt(ano,10);
  await audLoadMetaAndIndicadores(AUD.currentAno);
  await audLoadLista();
  renderView();
}
function audAnoSelector(){ return ''; }

/* ============================================================
   AGREGAÇÕES DE APRESENTAÇÃO (não recalculam diagnóstico/NET)
   ============================================================ */
function audAggregateBy(rows, keyFn){
  const map = new Map();
  for(const r of rows){
    const key = keyFn(r);
    if(!key) continue;
    let g = map.get(key);
    if(!g) g = {chave:key, valor:0, valorAbs:0, qtd:0, qtdAbs:0, ocorrencias:0, inventarios:new Set(), enderecos:new Set(), itens:new Set(), usuarios:new Set(), compensadas:0, pendentes:0, ultimaData:''};
    g.valor += r.vlDivergencia; g.valorAbs += Math.abs(r.vlDivergencia);
    g.qtd += r.diferenca; g.qtdAbs += Math.abs(r.diferenca);
    g.ocorrencias++;
    g.inventarios.add(r.inventario); g.enderecos.add(r.endereco); g.itens.add(r.itemWms); if(r.usuario) g.usuarios.add(r.usuario);
    if(r.diagnostico==='compensacao_historica' || r.diagnostico==='compensacao_parcial') g.compensadas++;
    if(r.necessitaValidacao) g.pendentes++;
    if(r.dataFim && r.dataFim > g.ultimaData) g.ultimaData = r.dataFim;
    map.set(key, g);
  }
  return Array.from(map.values()).map(g=>({
    ...g,
    numInventarios: g.inventarios.size, numEnderecos: g.enderecos.size, numItens: g.itens.size, numUsuarios: g.usuarios.size,
    pctCompensado: g.ocorrencias ? (g.compensadas/g.ocorrencias*100) : 0
  }));
}
function audAggItens(){ return audAggregateBy(AUD.list, r=>r.itemWms+'|'+r.descricao); }
function audAggEnderecos(){ return audAggregateBy(AUD.list, r=>r.endereco); }
function audAggInventarios(){ return audAggregateBy(AUD.list, r=>r.inventario); }

const AUD_RANK_SORTERS = {
  valor: (a,b)=>b.valor-a.valor,
  valorAbs: (a,b)=>b.valorAbs-a.valorAbs,
  qtd: (a,b)=>b.qtd-a.qtd,
  qtdAbs: (a,b)=>b.qtdAbs-a.qtdAbs,
  ocorrencias: (a,b)=>b.ocorrencias-a.ocorrencias,
  numInventarios: (a,b)=>b.numInventarios-a.numInventarios,
  numItens: (a,b)=>b.numItens-a.numItens
};

/* ============================================================
   IMPORTAÇÃO
   ============================================================ */
function audRenderImport(){
  const f = AUD.files;
  const dz = (key, label, desc, icon)=>`
    <div class="aud-dropzone ${f[key]?'has-file':''}">
      <input type="file" id="aud-file-${key}" accept=".xlsx,.xls" style="display:none" onchange="audOnFile('${key}', this.files[0])">
      <div class="aud-dz-icon">${icon}</div>
      <div class="aud-dz-title">${label}</div>
      <div class="aud-dz-desc">${desc}</div>
      ${f[key]
        ? `<div class="aud-dz-file mono">${esc(f[key].name)}<br>${(f[key].size/1024/1024).toFixed(2)} MB</div>
           <button class="btn-link" onclick="audRemoveFile('${key}')">Remover</button>`
        : `<button class="btn btn-secondary" onclick="document.getElementById('aud-file-${key}').click()">Selecionar arquivo</button>`}
    </div>`;

  const allSelected = f.f0114 && f.f390 && f.f845;

  return `
    <div class="panel">
      <h3>Importar planilhas do inventário</h3>
      <p class="field-hint" style="margin-bottom:14px;">Selecione as três planilhas exportadas do WMS (formato .xlsx). O processamento roda inteiramente no navegador — nenhum arquivo é enviado para servidor.</p>
      <div class="aud-dz-grid">
        ${dz('f0114','QUERY 0114','Divergências de inventário (base principal)','&#128203;')}
        ${dz('f390','QUERY 390','Estoque por local (posição atual)','&#128230;')}
        ${dz('f845','QUERY 845','Detalhe / observação do inventário','&#128269;')}
      </div>
      ${AUD.processing ? `
        <div class="aud-progress-wrap">
          <div class="aud-progress-stage">${esc(AUD.progress.stage)}</div>
          <div class="aud-progress-track"><div class="aud-progress-fill" style="width:${AUD.progress.pct}%"></div></div>
          <div class="aud-progress-pct mono">${AUD.progress.pct}%</div>
        </div>`
        : allSelected
          ? `<div class="action-bar" style="margin-top:16px;"><button class="btn btn-primary" style="font-size:14px;padding:10px 26px;" onclick="audProcessar()">PROCESSAR AUDITORIA</button></div>`
          : `<p class="field-hint" style="margin-top:14px;">Selecione os três arquivos para habilitar o processamento.</p>`
      }
    </div>
    ${AUD.importMeta ? audRenderUltimoProcessamento() : emptyState('Nenhuma auditoria processada ainda', 'Importe as três planilhas acima e clique em PROCESSAR AUDITORIA para gerar a lista priorizada de divergências.', 'document.getElementById(\'aud-file-f0114\').click()', 'Começar importação')}
  `;
}

function audRenderUltimoProcessamento(){
  const m = AUD.importMeta;
  return `<div class="panel">
    <h3>Último processamento — Ano ${AUD.currentAno}</h3>
    <div class="stat-grid">
      <div class="stat-card"><div class="num mono">${audFmtInt(m.totalLinhas)}</div><div class="label">Divergências tratadas</div></div>
      <div class="stat-card accent"><div class="num mono">${audFmtInt(m.necessitaValidacao)}</div><div class="label">Necessitam validação</div></div>
      <div class="stat-card"><div class="num mono">${audFmtInt(m.duplicidadesRemovidas)}</div><div class="label">Duplicidades removidas</div></div>
    </div>
    <p class="field-hint">Processado em ${new Date(m.processedAt).toLocaleString('pt-BR')}. <a href="#" onclick="switchTab('aud-home');return false;">Ir para a visão geral &rarr;</a></p>
  </div>`;
}

function audOnFile(key, file){
  if(!file) return;
  AUD.files[key] = file;
  renderView();
}
function audRemoveFile(key){
  AUD.files[key] = null;
  renderView();
}

async function audProcessar(){
  if(AUD.processing) return;
  if(!(AUD.files.f0114 && AUD.files.f390 && AUD.files.f845)) return;
  AUD.processing = true;
  AUD.progress = {stage:'Lendo arquivos...', pct:0};
  renderView();
  try{
    const [buf0114, buf390, buf845] = await Promise.all([
      AUD.files.f0114.arrayBuffer(), AUD.files.f390.arrayBuffer(), AUD.files.f845.arrayBuffer()
    ]);
    const worker = new Worker('audit/audit-worker.js');
    AUD.worker = worker;
    worker.onmessage = async (e)=>{
      const msg = e.data;
      if(msg.type==='progress'){
        AUD.progress = {stage: msg.stage, pct: msg.pct};
        audUpdateProgressUI();
      } else if(msg.type==='error'){
        AUD.processing = false;
        worker.terminate();
        showToast('Erro no processamento: '+msg.message, true);
        renderView();
      } else if(msg.type==='done'){
        AUD.processing = false;
        worker.terminate();
        AUD.files = {f0114:null, f390:null, f845:null};
        await audLoadAnosDisponiveis();
        if(msg.anos && msg.anos.length) AUD.currentAno = msg.anos[msg.anos.length-1];
        AUD.netConfig = await audGetNetConfig();
        await audLoadMetaAndIndicadores(AUD.currentAno);
        await audLoadLista();
        await audSaveKpiSnapshot(AUD.currentAno, audToday(), audBuildKpiSnapshot());
        showToast('✓ Auditoria processada: '+audFmtInt(msg.total)+' divergências, '+audFmtInt(msg.necessitaValidacao)+' precisam de validação.');
        if(msg.codigosNovos && msg.codigosNovos.length){
          setTimeout(()=>showToast('Atenção: '+msg.codigosNovos.length+' código(s) de legenda novo(s) — revise em Configurações NET.', true), 2600);
        }
        switchTab('aud-home');
      }
    };
    worker.onerror = (err)=>{
      AUD.processing = false;
      showToast('Erro no worker de processamento: '+err.message, true);
      renderView();
    };
    worker.postMessage({type:'process', buf0114, buf390, buf845, netConfig: AUD.netConfig}, [buf0114, buf390, buf845]);
  }catch(err){
    AUD.processing = false;
    showToast('Erro ao ler arquivos: '+err.message, true);
    renderView();
  }
}
function audUpdateProgressUI(){
  const stageEl = document.querySelector('.aud-progress-stage');
  const fillEl = document.querySelector('.aud-progress-fill');
  const pctEl = document.querySelector('.aud-progress-pct');
  if(stageEl && fillEl && pctEl){
    stageEl.textContent = AUD.progress.stage;
    fillEl.style.width = AUD.progress.pct+'%';
    pctEl.textContent = AUD.progress.pct+'%';
  } else renderView();
}

/* ============================================================
   KPI SNAPSHOT (para comparação dia-a-dia)
   ============================================================ */
function audBuildKpiSnapshot(){
  const ind = AUD.indicadores || {};
  return {
    netAtual: ind.saldoLiquido||0, netAcumulado: ind.saldoLiquido||0,
    divergenciasImportadas: ind.totalImportadas||0, considerNetSim: ind.considerNetSim||0, considerNetNao: ind.considerNetNao||0,
    qtdDivergente: ind.qtdDivergente||0, qtdAbsoluta: ind.qtdAbsoluta||0,
    valorDivergente: ind.valorDivergente||0, valorAbsoluto: ind.valorAbsoluto||0,
    compensadas: (ind.porDiagnostico && (ind.porDiagnostico.compensacao_historica||0)+(ind.porDiagnostico.compensacao_parcial||0)) || 0,
    pendentes: ind.necessitaValidacao||0, necessitaValidacao: ind.necessitaValidacao||0,
    itensUnicos: ind.itensUnicos||0, inventarios: ind.inventarios||0, usuarios: ind.usuarios||0, enderecos: ind.enderecos||0
  };
}
function audKpiDelta(atual, campo){
  if(!AUD.kpiPrev || AUD.kpiPrev[campo]===undefined) return '';
  const antes = AUD.kpiPrev[campo];
  if(antes===0 && atual===0) return '<span class="delta flat">= ontem</span>';
  const diff = atual-antes;
  const pct = antes!==0 ? (diff/Math.abs(antes)*100) : 100;
  const cls = diff>0?'up':(diff<0?'down':'flat');
  const seta = diff>0?'▲':(diff<0?'▼':'=');
  return `<span class="delta ${cls}">${seta} ${audFmtNum(Math.abs(pct),1)}% vs ontem</span>`;
}

/* ============================================================
   VISÃO GERAL (home) — KPIs + Top10 + gráficos + tabela operacional
   ============================================================ */
function audRenderHome(){
  const ind = AUD.indicadores;
  return `
    ${audRenderKpiRow(ind)}
    ${audRenderRankRow()}
    ${audRenderChartRow(ind)}
    ${audRenderOpTable()}
  `;
}

function audRenderKpiRow(ind){
  const k = audBuildKpiSnapshot();
  const kpis = [
    ['netAtual','NET atual', audFmtInt(k.netAtual), 'orange'],
    ['netAcumulado','NET acumulado', audFmtInt(k.netAcumulado), 'orange'],
    ['divergenciasImportadas','Divergências importadas', audFmtInt(k.divergenciasImportadas), ''],
    ['considerNetSim','Considerados no NET', audFmtInt(k.considerNetSim), ''],
    ['considerNetNao','Desconsiderados', audFmtInt(k.considerNetNao), ''],
    ['qtdDivergente','Qtde divergente', audFmtInt(k.qtdDivergente), ''],
    ['qtdAbsoluta','Qtde divergente absoluta', audFmtInt(k.qtdAbsoluta), ''],
    ['valorDivergente','Valor divergente', audFmtMoney(k.valorDivergente), ''],
    ['valorAbsoluto','Valor divergente absoluto', audFmtMoney(k.valorAbsoluto), ''],
    ['compensadas','Compensadas', audFmtInt(k.compensadas), 'good'],
    ['pendentes','Pendentes', audFmtInt(k.pendentes), 'orange'],
    ['necessitaValidacao','Necessitam validação', audFmtInt(k.necessitaValidacao), 'orange'],
    ['itensUnicos','Qtde de itens', audFmtInt(k.itensUnicos), ''],
    ['inventarios','Qtde de inventários', audFmtInt(k.inventarios), ''],
    ['usuarios','Qtde de usuários', audFmtInt(k.usuarios), ''],
    ['enderecos','Qtde de endereços', audFmtInt(k.enderecos), '']
  ];
  return `<div class="aud-kpi-grid">
    ${kpis.map(([campo,label,val,cls])=>`<div class="aud-kpi ${cls}">
      <div class="num mono">${val}</div>
      <div class="label">${label}</div>
      ${audKpiDelta(k[campo], campo)}
    </div>`).join('')}
  </div>`;
}

function audRenderRankRow(){
  const itens = audAggItens().sort(AUD_RANK_SORTERS[AUD.rankSort.itens]).slice(0,10);
  const enderecos = audAggEnderecos().sort(AUD_RANK_SORTERS[AUD.rankSort.enderecos]).slice(0,10);
  const invs = audAggInventarios().sort(AUD_RANK_SORTERS[AUD.rankSort.inventarios]).slice(0,10);

  const itemSortOpts = [['valorAbs','Maior valor'],['qtdAbs','Maior quantidade absoluta'],['qtd','Maior quantidade'],['ocorrencias','Maior nº divergências'],['numInventarios','Maior nº inventários'],['valor','Maior valor acumulado'],['qtd','Maior quantidade acumulada']];
  const list = (rows, valueFn)=>rows.length ? rows.map((r,i)=>`<div class="aud-rank-item"><span class="aud-rank-pos">${i+1}</span><span class="aud-rank-key" title="${esc(r.chave)}">${esc(r.chave)}</span><span class="aud-rank-val mono">${valueFn(r)}</span></div>`).join('')
    : '<div class="field-hint">Sem dados</div>';

  return `<div class="aud-rank-row3">
    <div class="aud-rank-card">
      <h4>Top 10 itens ofensores <select onchange="audSetRankSort('itens', this.value)">${itemSortOpts.map(([k,l])=>`<option value="${k}" ${AUD.rankSort.itens===k?'selected':''}>${l}</option>`).join('')}</select></h4>
      <div class="aud-rank-list">${list(itens, r=>AUD.rankSort.itens.includes('valor')?audFmtMoney(r.valor):audFmtInt(r.qtdAbs))}</div>
    </div>
    <div class="aud-rank-card">
      <h4>Top endereços <select onchange="audSetRankSort('enderecos', this.value)">
        <option value="qtdAbs" ${AUD.rankSort.enderecos==='qtdAbs'?'selected':''}>Quantidade</option>
        <option value="valorAbs" ${AUD.rankSort.enderecos==='valorAbs'?'selected':''}>Valor</option>
        <option value="numItens" ${AUD.rankSort.enderecos==='numItens'?'selected':''}>Nº itens</option>
        <option value="ocorrencias" ${AUD.rankSort.enderecos==='ocorrencias'?'selected':''}>Nº divergências</option>
      </select></h4>
      <div class="aud-rank-list">${list(enderecos, r=>AUD.rankSort.enderecos==='valorAbs'?audFmtMoney(r.valorAbs):audFmtInt(r[AUD.rankSort.enderecos]))}</div>
    </div>
    <div class="aud-rank-card">
      <h4>Top inventários <select onchange="audSetRankSort('inventarios', this.value)">
        <option value="ocorrencias" ${AUD.rankSort.inventarios==='ocorrencias'?'selected':''}>Nº divergências</option>
        <option value="valorAbs" ${AUD.rankSort.inventarios==='valorAbs'?'selected':''}>Valor</option>
        <option value="qtdAbs" ${AUD.rankSort.inventarios==='qtdAbs'?'selected':''}>Quantidade</option>
      </select></h4>
      <div class="aud-rank-list">${list(invs, r=>AUD.rankSort.inventarios==='valorAbs'?audFmtMoney(r.valorAbs):audFmtInt(r[AUD.rankSort.inventarios]))}</div>
    </div>
  </div>`;
}
function audSetRankSort(painel, key){ AUD.rankSort[painel] = key; renderView(); }

function audRenderChartRow(ind){
  return `<div class="aud-chart-row">
    <div class="aud-chart-card"><h4>Evolução diária (Qtde / Valor / NET)</h4>${audEvolutionSvg()}</div>
    <div class="aud-chart-card"><h4>Pareto de perdas (80x20)</h4>${audParetoSvg(ind)}</div>
    <div class="aud-chart-card"><h4>Distribuição das divergências</h4>${audDistribuicaoHtml()}</div>
  </div>`;
}
async function audEvolutionSvgData(){ return audGetKpiHistory(AUD.currentAno); }
function audEvolutionSvg(){
  // Renderiza com o histórico já carregado de forma síncrona via cache leve
  const w=280,h=90;
  if(!AUD._evolCache || AUD._evolCache.ano!==AUD.currentAno){
    audGetKpiHistory(AUD.currentAno).then(hist=>{ AUD._evolCache = {ano:AUD.currentAno, hist}; if(document.querySelector('.aud-chart-row')) renderView(); });
    return `<p class="field-hint">Carregando histórico...</p>`;
  }
  const hist = AUD._evolCache.hist;
  if(hist.length<2) return `<p class="field-hint">Histórico insuficiente (é gerado a cada processamento). ${hist.length} ponto(s) até agora.</p>`;
  const vals = hist.map(p=>p.kpis.valorAbsoluto||0);
  const max = Math.max(1,...vals), min = Math.min(0,...vals);
  const pts = vals.map((v,i)=>{
    const x = (i/(vals.length-1))*(w-10)+5;
    const y = h-6 - ((v-min)/(max-min||1))*(h-16);
    return x+','+y;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="#FE5000" stroke-width="2"/></svg>
  <div class="field-hint">${hist[0].data} → ${hist[hist.length-1].data} · Valor absoluto</div>`;
}
function audParetoSvg(ind){
  const pareto = (ind && ind.pareto) || [];
  if(!pareto.length) return `<p class="field-hint">Sem dados de perdas.</p>`;
  const w=280,h=90;
  const bars = pareto.slice(0,10);
  const maxV = Math.max(1,...bars.map(p=>Math.abs(p.valor)));
  const barW = (w-10)/bars.length;
  const barsHtml = bars.map((p,i)=>{
    const bh = Math.abs(p.valor)/maxV*(h-24);
    return `<rect x="${5+i*barW}" y="${h-10-bh}" width="${barW*0.7}" height="${bh}" fill="#001A72"/>`;
  }).join('');
  const linePts = bars.map((p,i)=>{
    const x = 5+i*barW+barW*0.35;
    const y = h-10-(p.pctAcumulado/100)*(h-24);
    return x+','+y;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}">${barsHtml}<polyline points="${linePts}" fill="none" stroke="#FE5000" stroke-width="1.5"/></svg>
  <div class="field-hint">Top 10 perdas · linha = % acumulado</div>`;
}
function audDistribuicaoHtml(){
  const porItem = new Map();
  for(const r of AUD.list){ porItem.set(r.itemWms, (porItem.get(r.itemWms)||0)+1); }
  const faixas = [[1,1,'1'],[2,5,'2-5'],[6,10,'6-10'],[11,20,'11-20'],[21,Infinity,'20+']];
  const counts = faixas.map(([min,max,label])=>{
    let c=0; for(const v of porItem.values()) if(v>=min && v<=max) c++;
    return {label, count:c};
  });
  const maxC = Math.max(1,...counts.map(c=>c.count));
  return `<div class="aud-dist-row">${counts.map(c=>`<div class="aud-dist-col">
    <div class="aud-dist-value">${c.count}</div>
    <div class="aud-dist-bar" style="height:${(c.count/maxC*100).toFixed(0)}%;"></div>
    <div class="aud-dist-label">${c.label}</div>
  </div>`).join('')}</div>`;
}

/* ============================================================
   TABELA OPERACIONAL (principal) — sort/filter/group/hide/export
   ============================================================ */
const AUD_OP_COLS = [
  {key:'itemWms', label:'Item', w:90},
  {key:'ean', label:'EAN', w:110},
  {key:'descricao', label:'Descrição', w:220},
  {key:'endereco', label:'Endereço', w:110},
  {key:'diferenca', label:'Qtde Divergente', w:110, num:true},
  {key:'vlDivergencia', label:'Valor Divergente', w:120, num:true, money:true},
  {key:'inventario', label:'Inventário', w:90},
  {key:'usuario', label:'Usuário', w:120},
  {key:'diagnostico', label:'Diagnóstico', w:130, diag:true},
  {key:'necessitaValidacao', label:'Necessita Validação', w:110, bool:true},
  {key:'prioridade', label:'Prioridade', w:80},
  {key:'justificativa', label:'Observação', w:260}
];
function audOpRelevantRows(){
  return AUD.list.filter(r=>r.necessitaValidacao || Math.abs(r.vlDivergencia)>=1000);
}
function audOpSortedGrouped(){
  const rows = audOpRelevantRows().slice();
  const {sortKey, sortDir} = AUD.op;
  rows.sort((a,b)=>{
    let av=a[sortKey], bv=b[sortKey];
    if(typeof av==='string') av=av.toLowerCase(); if(typeof bv==='string') bv=bv.toLowerCase();
    if(av<bv) return sortDir==='asc'?-1:1;
    if(av>bv) return sortDir==='asc'?1:-1;
    return 0;
  });
  return rows;
}
function audRenderOpTable(){
  const rows = audOpSortedGrouped();
  const visibleCols = AUD_OP_COLS.filter(c=>!AUD.op.hiddenCols[c.key]);
  return `<div class="panel" style="padding:0;overflow:hidden;">
    <div class="aud-optable-toolbar">
      <b style="font-size:11.5px;color:var(--ink);">Tabela operacional</b>
      <span class="field-hint">${audFmtInt(rows.length)} itens relevantes</span>
      <select onchange="audOpSetGroup(this.value)">
        <option value="">Sem agrupamento</option>
        <option value="inventario" ${AUD.op.groupBy==='inventario'?'selected':''}>Agrupar por Inventário</option>
        <option value="endereco" ${AUD.op.groupBy==='endereco'?'selected':''}>Agrupar por Endereço</option>
        <option value="usuario" ${AUD.op.groupBy==='usuario'?'selected':''}>Agrupar por Usuário</option>
        <option value="diagnostico" ${AUD.op.groupBy==='diagnostico'?'selected':''}>Agrupar por Diagnóstico</option>
      </select>
      <div class="aud-col-menu">
        <button class="btn btn-secondary" onclick="audToggleColMenu()">Colunas</button>
        ${AUD.op.colMenuOpen ? `<div class="aud-col-menu-panel">${AUD_OP_COLS.map(c=>`<label><input type="checkbox" ${AUD.op.hiddenCols[c.key]?'':'checked'} onchange="audToggleCol('${c.key}')"> ${c.label}</label>`).join('')}</div>` : ''}
      </div>
      <button class="btn btn-secondary" onclick="audExportXlsxRows(audOpSortedGrouped(), 'tabela_operacional_'+AUD.currentAno+'.xlsx')">Exportar Excel</button>
    </div>
    <div class="aud-optable-scroll" id="aud-op-scroll">
      <table class="aud-optable">
        <thead><tr>${visibleCols.map(c=>`<th style="width:${c.w}px;" onclick="audOpSort('${c.key}')">${c.label}${AUD.op.sortKey===c.key?`<span class="arrow">${AUD.op.sortDir==='asc'?'▲':'▼'}</span>`:''}</th>`).join('')}</tr></thead>
        <tbody id="aud-op-window"></tbody>
      </table>
    </div>
  </div>`;
}
function audOpSort(key){
  if(AUD.op.sortKey===key) AUD.op.sortDir = AUD.op.sortDir==='asc'?'desc':'asc';
  else { AUD.op.sortKey = key; AUD.op.sortDir = 'desc'; }
  renderView();
}
function audOpSetGroup(val){ AUD.op.groupBy = val; renderView(); }
function audToggleColMenu(){ AUD.op.colMenuOpen = !AUD.op.colMenuOpen; renderView(); }
function audToggleCol(key){ AUD.op.hiddenCols[key] = !AUD.op.hiddenCols[key]; renderView(); }

function audOpRowHtml(r, visibleCols){
  return `<tr style="height:${AUD_OP_ROW_H}px;">${visibleCols.map(c=>{
    let v = r[c.key];
    if(c.money) v = audFmtMoney(v);
    else if(c.num) v = audFmtInt(v);
    else if(c.bool) v = v ? '<span class="stamp-tag tag-alert">Sim</span>' : '<span class="stamp-tag tag-muted">Não</span>';
    else if(c.diag) v = (AUD_DIAG[v]||{label:v}).label;
    else v = esc(v==null?'—':v);
    return `<td style="width:${c.w}px;" title="${typeof r[c.key]==='string'?esc(r[c.key]):''}">${v}</td>`;
  }).join('')}</tr>`;
}
function audMountOpTableScroll(){
  const el = document.getElementById('aud-op-scroll');
  if(!el) return;
  let ticking = false;
  const handler = ()=>{ if(ticking) return; ticking=true; requestAnimationFrame(()=>{ audRenderOpWindow(); ticking=false; }); };
  el.addEventListener('scroll', handler);
  audRenderOpWindow();
}
function audOpFlattenGrouped(){
  let rows = audOpSortedGrouped();
  if(AUD.op.groupBy){
    const groups = new Map();
    rows.forEach(r=>{ const k=r[AUD.op.groupBy]||'—'; if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r); });
    const flat = [];
    for(const [k, grows] of groups){
      flat.push({__group:true, label:k, count:grows.length});
      grows.forEach(r=>flat.push(r));
    }
    rows = flat;
  }
  return rows;
}
function audRenderOpWindow(){
  const el = document.getElementById('aud-op-scroll');
  const winEl = document.getElementById('aud-op-window');
  if(!el || !winEl) return;
  const visibleCols = AUD_OP_COLS.filter(c=>!AUD.op.hiddenCols[c.key]);
  const rows = audOpFlattenGrouped();
  if(!rows.length){
    winEl.innerHTML = `<tr><td colspan="${visibleCols.length}" style="text-align:center;color:var(--ink-soft);padding:20px;">Nenhum item relevante encontrado.</td></tr>`;
    return;
  }
  const viewH = el.clientHeight || 400;
  const scrollTop = el.scrollTop;
  const buffer = 6;
  const start = Math.max(0, Math.floor(scrollTop/AUD_OP_ROW_H) - buffer);
  const visibleCount = Math.ceil(viewH/AUD_OP_ROW_H) + buffer*2;
  const end = Math.min(rows.length, start+visibleCount);
  const topSpacer = start*AUD_OP_ROW_H;
  const bottomSpacer = (rows.length-end)*AUD_OP_ROW_H;
  const body = rows.slice(start,end).map(r=>{
    if(r.__group) return `<tr class="grp-row" style="height:${AUD_OP_ROW_H}px;"><td colspan="${visibleCols.length}">${esc(r.label)} (${r.count})</td></tr>`;
    return audOpRowHtml(r, visibleCols);
  }).join('');
  winEl.innerHTML =
    `<tr style="height:${topSpacer}px;"><td colspan="${visibleCols.length}" style="padding:0;border:none;"></td></tr>`
    + body
    + `<tr style="height:${bottomSpacer}px;"><td colspan="${visibleCols.length}" style="padding:0;border:none;"></td></tr>`;
}
function audExportXlsxRows(rows, filename){
  if(!rows || !rows.length){ showToast('Nada para exportar.', true); return; }
  const ws = XLSX.utils.json_to_sheet(rows.map(r=>({
    Item:r.itemWms, EAN:r.ean, Descricao:r.descricao, Endereco:r.endereco,
    QtdeDivergente:r.diferenca, ValorDivergente:r.vlDivergencia, Inventario:r.inventario, Usuario:r.usuario,
    Diagnostico:(AUD_DIAG[r.diagnostico]||{}).label||r.diagnostico, NecessitaValidacao:r.necessitaValidacao?'Sim':'Não',
    Prioridade:r.prioridade, Observacao:r.justificativa
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tabela Operacional');
  XLSX.writeFile(wb, filename);
}

/* ============================================================
   TELA DE AUDITORIA (fila de pendências) — cartões + chips rápidos
   ============================================================ */
const AUD_QUICK_CHIPS = [
  ['perdas','Perdas'], ['ganhos','Ganhos'],
  ['sem_localizacao','Sem localização'], ['erro_movimentacao','Erro de movimentação'], ['erro_posicao','Erro de posição'],
  ['compensacao_parcial','Compensação parcial'], ['compensacao_historica','Compensação histórica'], ['divergencia_real','Divergência real'],
  ['alta','Alta prioridade'], ['maiorValor','Maior valor'], ['maiorQtd','Maior quantidade']
];
function audRenderAuditoria(){
  if(!AUD.list.length){
    return emptyState('Nenhuma divergência carregada', 'Processe uma auditoria na aba Importação para ver a lista priorizada aqui.', "switchTab('aud-import')", 'Ir para Importação');
  }
  const uniq = (field)=>Array.from(new Set(AUD.list.map(r=>r[field]).filter(Boolean))).sort();
  const invs = uniq('inventario'), users = uniq('usuario'), legendas = uniq('codLegenda');

  return `
    <div class="aud-chips">
      ${AUD_QUICK_CHIPS.map(([k,l])=>`<button class="aud-chip ${AUD.quickChip===k?'active':''}" onclick="audSetQuickChip('${k}')">${l}</button>`).join('')}
    </div>
    <div class="aud-toolbar">
      <div class="aud-search-wrap">
        <input type="text" id="aud-search" placeholder="Buscar por item, descrição, EAN, endereço, inventário, usuário, fornecedor ou legenda..." value="${esc(AUD.filters.search)}" oninput="audOnSearch(this.value)">
      </div>
      <div class="aud-toolbar-actions">
        <label class="aud-toggle"><input type="checkbox" ${AUD.showAll?'checked':''} onchange="audToggleShowAll(this.checked)"> Mostrar todos</label>
        <button class="btn btn-secondary" onclick="audToggleFilters()">${AUD.filtersOpen?'Ocultar filtros':'Filtros'} (${audCountActiveFilters()})</button>
        <button class="btn btn-secondary" onclick="audExportCsv(AUD.filtered, 'auditoria_'+AUD.currentAno+'.csv')">Exportar lista</button>
      </div>
    </div>
    ${AUD.filtersOpen ? audRenderFiltersPanel(invs, users, legendas) : ''}
    <div class="aud-result-count">${audFmtInt(AUD.filtered.length)} de ${audFmtInt(AUD.list.length)} divergências ${AUD.showAll?'':'(necessitam validação)'}</div>
    <div class="aud-cards-scroll" id="aud-cards-scroll">
      <div id="aud-cards-total-height" style="position:relative;">
        <div id="aud-cards-window" style="position:absolute;top:0;left:0;right:0;"></div>
      </div>
    </div>
  `;
}
function audSetQuickChip(chip){
  AUD.quickChip = (AUD.quickChip===chip) ? '' : chip;
  audApplyFilters();
  renderView();
}

function audRenderFiltersPanel(invs, users, legendas){
  const flt = AUD.filters;
  const diagOpts = Object.entries(AUD_DIAG).map(([k,v])=>`<option value="${k}" ${flt.diagnostico===k?'selected':''}>${v.label}</option>`).join('');
  return `<div class="panel aud-filters-panel">
    <div class="aud-filters-grid">
      <div><label>Inventário</label><select onchange="audSetFilter('inventario', this.value)">
        <option value="">Todos</option>${invs.map(i=>`<option value="${esc(i)}" ${flt.inventario===i?'selected':''}>${esc(i)}</option>`).join('')}
      </select></div>
      <div><label>Usuário</label><select onchange="audSetFilter('usuario', this.value)">
        <option value="">Todos</option>${users.map(u=>`<option value="${esc(u)}" ${flt.usuario===u?'selected':''}>${esc(u)}</option>`).join('')}
      </select></div>
      <div><label>Diagnóstico</label><select onchange="audSetFilter('diagnostico', this.value)">
        <option value="">Todos</option>${diagOpts}
      </select></div>
      <div><label>Necessita validação</label><select onchange="audSetFilter('necessita', this.value)">
        <option value="">Todos</option>
        <option value="sim" ${flt.necessita==='sim'?'selected':''}>Sim</option>
        <option value="nao" ${flt.necessita==='nao'?'selected':''}>Não</option>
      </select></div>
      <div><label>Prioridade</label><select onchange="audSetFilter('prioridade', this.value)">
        <option value="">Todas</option>
        <option value="alta" ${flt.prioridade==='alta'?'selected':''}>Alta</option>
        <option value="media" ${flt.prioridade==='media'?'selected':''}>Média</option>
        <option value="baixa" ${flt.prioridade==='baixa'?'selected':''}>Baixa</option>
      </select></div>
      <div><label>Legenda</label><select onchange="audSetFilter('legenda', this.value)">
        <option value="">Todas</option>${legendas.map(l=>`<option value="${esc(l)}" ${flt.legenda===l?'selected':''}>${esc(l)}</option>`).join('')}
      </select></div>
      <div><label>Valor mín. (R$)</label><input type="number" value="${flt.valorMin}" onchange="audSetFilter('valorMin', this.value)"></div>
      <div><label>Valor máx. (R$)</label><input type="number" value="${flt.valorMax}" onchange="audSetFilter('valorMax', this.value)"></div>
      <div><label>Qtde mín.</label><input type="number" value="${flt.qtdMin}" onchange="audSetFilter('qtdMin', this.value)"></div>
      <div><label>Qtde máx.</label><input type="number" value="${flt.qtdMax}" onchange="audSetFilter('qtdMax', this.value)"></div>
      <div><label>Data início</label><input type="date" value="${flt.dataIni}" onchange="audSetFilter('dataIni', this.value)"></div>
      <div><label>Data fim</label><input type="date" value="${flt.dataFim}" onchange="audSetFilter('dataFim', this.value)"></div>
    </div>
    <div class="form-actions"><button class="btn btn-secondary" onclick="audClearFilters()">Limpar filtros</button></div>
  </div>`;
}

function audCountActiveFilters(){
  return Object.values(AUD.filters).filter(v=>v!=='' && v!==null && v!==undefined).length;
}
function audToggleFilters(){ AUD.filtersOpen = !AUD.filtersOpen; renderView(); }
function audSetFilter(key, val){ AUD.filters[key] = val; audApplyFilters(); renderView(); }
function audClearFilters(){
  AUD.filters = {search:AUD.filters.search, inventario:'', usuario:'', diagnostico:'', necessita:'', valorMin:'', valorMax:'', qtdMin:'', qtdMax:'', dataIni:'', dataFim:'', legenda:'', prioridade:''};
  audApplyFilters(); renderView();
}
let audSearchDebounce = null;
function audOnSearch(val){
  AUD.filters.search = val;
  clearTimeout(audSearchDebounce);
  audSearchDebounce = setTimeout(()=>{
    audApplyFilters();
    audMountCardsScroll(true);
    audUpdateResultCount();
  }, 180);
}
function audUpdateResultCount(){
  const el = document.querySelector('.aud-result-count');
  if(el) el.textContent = audFmtInt(AUD.filtered.length)+' de '+audFmtInt(AUD.list.length)+' divergências'+(AUD.showAll?'':' (necessitam validação)');
}
function audToggleShowAll(val){ AUD.showAll = val; audApplyFilters(); renderView(); }

function audApplyFilters(){
  const f = AUD.filters;
  const search = f.search.trim().toLowerCase();
  let base = AUD.list.filter(r=>{
    if(!AUD.showAll && !r.necessitaValidacao) return false;
    if(f.inventario && r.inventario!==f.inventario) return false;
    if(f.usuario && r.usuario!==f.usuario) return false;
    if(f.diagnostico && r.diagnostico!==f.diagnostico) return false;
    if(f.legenda && r.codLegenda!==f.legenda) return false;
    if(f.prioridade && r.prioridade!==f.prioridade) return false;
    if(f.necessita==='sim' && !r.necessitaValidacao) return false;
    if(f.necessita==='nao' && r.necessitaValidacao) return false;
    if(f.valorMin!=='' && Math.abs(r.vlDivergencia) < parseFloat(f.valorMin)) return false;
    if(f.valorMax!=='' && Math.abs(r.vlDivergencia) > parseFloat(f.valorMax)) return false;
    if(f.qtdMin!=='' && Math.abs(r.diferenca) < parseFloat(f.qtdMin)) return false;
    if(f.qtdMax!=='' && Math.abs(r.diferenca) > parseFloat(f.qtdMax)) return false;
    if(f.dataIni && r.dataFim && r.dataFim < f.dataIni) return false;
    if(f.dataFim && r.dataFim && r.dataFim > f.dataFim) return false;
    if(search){
      const hay = (r.itemWms+' '+r.descricao+' '+r.ean+' '+r.endereco+' '+r.inventario+' '+r.usuario+' '+r.fornecedor+' '+r.codLegenda).toLowerCase();
      if(!hay.includes(search)) return false;
    }
    return true;
  });
  if(AUD.quickChip){
    const c = AUD.quickChip;
    if(c==='perdas') base = base.filter(r=>r.vlDivergencia<0);
    else if(c==='ganhos') base = base.filter(r=>r.vlDivergencia>0);
    else if(c==='alta') base = base.filter(r=>r.prioridade==='alta');
    else if(c==='maiorValor') base = base.slice().sort((a,b)=>Math.abs(b.vlDivergencia)-Math.abs(a.vlDivergencia)).slice(0,50);
    else if(c==='maiorQtd') base = base.slice().sort((a,b)=>Math.abs(b.diferenca)-Math.abs(a.diferenca)).slice(0,50);
    else base = base.filter(r=>r.diagnostico===c);
  }
  AUD.filtered = base;
  AUD.filtered.sort((a,b)=> (AUD_DIAG[b.diagnostico]?.prioridade||0) - (AUD_DIAG[a.diagnostico]?.prioridade||0) || Math.abs(b.vlDivergencia) - Math.abs(a.vlDivergencia));
}

/* ---- Virtual scroll (cartões) ---- */
function audMountCardsScroll(keepScroll){
  const el = document.getElementById('aud-cards-scroll');
  if(!el) return;
  if(AUD.scrollHandler) el.removeEventListener('scroll', AUD.scrollHandler);
  let ticking = false;
  AUD.scrollHandler = ()=>{
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(()=>{ audRenderCardsWindow(); ticking = false; });
  };
  el.addEventListener('scroll', AUD.scrollHandler);
  if(!keepScroll) el.scrollTop = 0;
  audRenderCardsWindow();
}
function audRenderCardsWindow(){
  const el = document.getElementById('aud-cards-scroll');
  const totalEl = document.getElementById('aud-cards-total-height');
  const winEl = document.getElementById('aud-cards-window');
  if(!el || !totalEl || !winEl) return;
  const total = AUD.filtered.length;
  totalEl.style.height = (total*AUD_ROW_H)+'px';
  if(!total){ winEl.innerHTML = `<div class="empty-state"><div class="eicon">&#128269;</div><h3>Nenhuma divergência encontrada</h3><p>Ajuste a busca, os filtros ou o filtro rápido selecionado.</p></div>`; return; }
  const viewH = el.clientHeight || 600;
  const scrollTop = el.scrollTop;
  const buffer = 3;
  const start = Math.max(0, Math.floor(scrollTop/AUD_ROW_H) - buffer);
  const visibleCount = Math.ceil(viewH/AUD_ROW_H) + buffer*2;
  const end = Math.min(total, start+visibleCount);
  winEl.style.transform = `translateY(${start*AUD_ROW_H}px)`;
  winEl.innerHTML = AUD.filtered.slice(start, end).map(audCardHtml).join('');
}

function audCardHtml(r){
  const diag = AUD_DIAG[r.diagnostico] || {label:r.diagnostico, cor:'#7B80A0'};
  const diffCls = r.diferenca>0 ? 'aud-pos' : (r.diferenca<0 ? 'aud-neg' : '');
  const enderecos = (r.estoqueEnderecos||[]).slice(0,4).map(e=>`${esc(e.local)}: ${audFmtInt(e.quantidade)}`).join(' · ');
  const liquidadoInfo = r.estoqueTotalLiquidado ? ` · Liquidado: <b class="mono">${audFmtInt(r.estoqueTotalLiquidado)}</b> em ${r.estoqueNumEnderecosLiquidados} endereço(s)` : '';
  return `<div class="aud-card">
    <div class="aud-card-top">
      <div class="aud-card-item">
        <span class="mono">${esc(r.itemWms)}</span>
        <span class="aud-card-desc">${esc(r.descricao||'—')}</span>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        ${r.situacaoLiquidada ? '<span class="stamp-tag tag-muted">Liquidado</span>' : ''}
        <span class="stamp-tag" style="background:${diag.cor}22;color:${diag.cor};border:1px solid ${diag.cor}55;">${diag.label}</span>
      </div>
    </div>
    <div class="aud-card-grid">
      <div><span class="aud-k">Endereço</span><span class="aud-v">${esc(r.endereco||'—')}</span></div>
      <div><span class="aud-k">Diferença</span><span class="aud-v mono ${diffCls}">${r.diferenca>0?'+':''}${audFmtInt(r.diferenca)}</span></div>
      <div><span class="aud-k">Valor</span><span class="aud-v mono ${diffCls}">${audFmtMoney(r.vlDivergencia)}</span></div>
      <div><span class="aud-k">Inventário</span><span class="aud-v">${esc(r.inventario)}</span></div>
      <div><span class="aud-k">Usuário</span><span class="aud-v">${esc(r.usuario||'—')}</span></div>
      <div><span class="aud-k">Legenda</span><span class="aud-v">${r.codLegenda?esc(r.codLegenda)+' — '+esc(r.descLegenda):'—'}</span></div>
      <div><span class="aud-k">Necessita validação</span><span class="aud-v">${r.necessitaValidacao?'<span class="stamp-tag tag-alert">Sim</span>':'<span class="stamp-tag tag-muted">Não</span>'}</span></div>
      <div><span class="aud-k">Prioridade</span><span class="aud-v">${esc((r.prioridade||'').toUpperCase())}</span></div>
    </div>
    <div class="aud-card-estoque">
      <span class="aud-k">Estoque atual (QUERY 390)</span>
      <span class="aud-v">Total: <b class="mono">${audFmtInt(r.estoqueTotal)}</b> · No endereço: <b class="mono">${audFmtInt(r.estoqueQtdNoEndereco)}</b> · ${r.estoqueNumEnderecos} endereço(s)${enderecos?' — '+enderecos:''}${liquidadoInfo}</span>
    </div>
    <div class="aud-card-just">${esc(r.justificativa||'')}</div>
  </div>`;
}

function audExportCsv(rows, filename){
  if(!rows || !rows.length){ showToast('Nada para exportar.', true); return; }
  const cols = ['inventario','local','endereco','itemWms','itemSige','descricao','ean','codTerceiro','qtdeLogica','qtdeFisica','diferenca','vlLogico','vlFisico','vlDivergencia','dataInicio','dataFim','usuario','codLegenda','descLegenda','considerarNet','diagnostico','prioridade','necessitaValidacao','situacaoLiquidada','justificativa','estoqueTotal','estoqueQtdNoEndereco','estoqueNumEnderecos','estoqueTotalLiquidado','estoqueNumEnderecosLiquidados','ano'];
  const header = cols.join(';');
  const lines = rows.map(r=>cols.map(c=>{
    let v = r[c];
    if(typeof v === 'string') v = '"'+v.replace(/"/g,'""')+'"';
    return v===undefined||v===null?'':v;
  }).join(';'));
  const csv = '﻿'+header+'\n'+lines.join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ============================================================
   MATRIZ DE OFENSORES — Índice de Criticidade (0-100)
   ============================================================ */
function audComputeCriticidade(itens){
  const maxValor = Math.max(1,...itens.map(i=>i.valorAbs));
  const maxQtd = Math.max(1,...itens.map(i=>i.qtdAbs));
  const maxOcorr = Math.max(1,...itens.map(i=>i.ocorrencias));
  const maxInv = Math.max(1,...itens.map(i=>i.numInventarios));
  const maxEnd = Math.max(1,...itens.map(i=>i.numEnderecos));
  return itens.map(i=>{
    const nValor = i.valorAbs/maxValor, nQtd = i.qtdAbs/maxQtd, nOcorr = i.ocorrencias/maxOcorr,
          nInv = i.numInventarios/maxInv, nEnd = i.numEnderecos/maxEnd,
          nNaoCompensado = 1 - (i.pctCompensado/100);
    // pesos: valor financeiro e recorrência pesam mais; distribuídos para somar 1
    const score = (nValor*0.30 + nQtd*0.15 + nOcorr*0.20 + nInv*0.15 + nEnd*0.10 + nNaoCompensado*0.10) * 100;
    return {...i, criticidade: Math.round(score)};
  }).sort((a,b)=>b.criticidade-a.criticidade);
}
function audCritColor(score){
  if(score>=70) return '#C83812';
  if(score>=40) return '#FE5000';
  return '#33488E';
}
function audRenderOfensores(){
  const itens = audComputeCriticidade(audAggItens());
  return `<div class="panel" style="padding:0;overflow:hidden;">
    <div class="aud-optable-toolbar"><b style="font-size:11.5px;color:var(--ink);">Matriz de Ofensores</b><span class="field-hint">Índice de Criticidade de 0 a 100, calculado a partir de valor, quantidade, ocorrências, recorrência e endereços — ordenado do maior para o menor</span></div>
    <div class="table-wrap" style="border:none;border-radius:0;">
      <table><thead><tr><th>Item</th><th>Valor Abs.</th><th>Qtde Abs.</th><th>Ocorrências</th><th>Inventários</th><th>Endereços</th><th>% Compensado</th><th>Criticidade</th></tr></thead>
      <tbody>${itens.slice(0,200).map(i=>`<tr>
        <td>${esc(i.chave)}</td>
        <td class="mono">${audFmtMoney(i.valorAbs)}</td>
        <td class="mono">${audFmtInt(i.qtdAbs)}</td>
        <td class="mono">${audFmtInt(i.ocorrencias)}</td>
        <td class="mono">${i.numInventarios}</td>
        <td class="mono">${i.numEnderecos}</td>
        <td class="mono">${i.pctCompensado.toFixed(0)}%</td>
        <td><span class="aud-crit-badge" style="background:${audCritColor(i.criticidade)};">${i.criticidade}</span></td>
      </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--ink-soft);">Sem registros</td></tr>'}</tbody></table>
    </div>
  </div>`;
}

/* ============================================================
   PAINEL DE ENDEREÇOS
   ============================================================ */
function audRenderEnderecos(){
  const enderecos = audAggEnderecos().sort((a,b)=>b.valorAbs-a.valorAbs);
  return `<div class="panel" style="padding:0;overflow:hidden;">
    <div class="aud-optable-toolbar"><b style="font-size:11.5px;color:var(--ink);">Painel de Endereços</b><span class="field-hint">${enderecos.length} endereços com divergência</span></div>
    <div class="table-wrap" style="border:none;border-radius:0;">
      <table><thead><tr><th>Endereço</th><th>Qtde Divergente</th><th>Valor</th><th>Itens</th><th>Inventários</th><th>Recorrência</th><th>% Compensação</th></tr></thead>
      <tbody>${enderecos.slice(0,200).map(e=>`<tr>
        <td>${esc(e.chave)}</td>
        <td class="mono">${audFmtInt(e.qtdAbs)}</td>
        <td class="mono ${e.valor>=0?'aud-pos':'aud-neg'}">${audFmtMoney(e.valor)}</td>
        <td class="mono">${e.numItens}</td>
        <td class="mono">${e.numInventarios}</td>
        <td class="mono">${e.ocorrencias}x</td>
        <td><span class="aud-mini-bar"><span style="width:${e.pctCompensado.toFixed(0)}%;"></span></span>${e.pctCompensado.toFixed(0)}%</td>
      </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);">Sem registros</td></tr>'}</tbody></table>
    </div>
  </div>`;
}

/* ============================================================
   PAINEL DE INVENTÁRIOS
   ============================================================ */
function audRenderInventarios(){
  const invs = audAggInventarios().sort((a,b)=>b.ocorrencias-a.ocorrencias);
  return `<div class="panel" style="padding:0;overflow:hidden;">
    <div class="aud-optable-toolbar"><b style="font-size:11.5px;color:var(--ink);">Painel de Inventários</b><span class="field-hint">${invs.length} inventários com divergência</span></div>
    <div class="table-wrap" style="border:none;border-radius:0;">
      <table><thead><tr><th>Inventário</th><th>Divergências</th><th>Valor</th><th>Usuários</th><th>Itens</th><th>% Compensado</th><th>NET (líquido)</th></tr></thead>
      <tbody>${invs.slice(0,200).map(i=>`<tr>
        <td>${esc(i.chave)}</td>
        <td class="mono">${audFmtInt(i.ocorrencias)}</td>
        <td class="mono ${i.valor>=0?'aud-pos':'aud-neg'}">${audFmtMoney(i.valor)}</td>
        <td class="mono">${i.numUsuarios}</td>
        <td class="mono">${i.numItens}</td>
        <td><span class="aud-mini-bar"><span style="width:${i.pctCompensado.toFixed(0)}%;"></span></span>${i.pctCompensado.toFixed(0)}%</td>
        <td class="mono">${audFmtInt(i.qtd)}</td>
      </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);">Sem registros</td></tr>'}</tbody></table>
    </div>
  </div>`;
}

/* ============================================================
   PAINEL FINANCEIRO
   ============================================================ */
function audRenderFinanceiro(){
  const ind = AUD.indicadores;
  const topTable = (title, rows)=>`<div class="panel">
    <h3>${title}</h3>
    <div class="table-wrap"><table><thead><tr><th>Item</th><th>Descrição</th><th>Inventário</th><th>Endereço</th><th>Valor</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td class="mono">${esc(r.item)}</td><td>${esc(r.descricao||'—')}</td><td>${esc(r.inventario)}</td><td>${esc(r.endereco||'—')}</td><td class="mono ${r.valor>0?'aud-pos':'aud-neg'}">${audFmtMoney(r.valor)}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);">Sem registros</td></tr>'}</tbody></table></div>
  </div>`;
  return `
    <div class="aud-kpi-grid">
      <div class="aud-kpi"><div class="num mono">${ind.maiorGanho?audFmtMoney(ind.maiorGanho.valor):'—'}</div><div class="label">Maior ganho financeiro</div></div>
      <div class="aud-kpi orange"><div class="num mono">${ind.maiorPerda?audFmtMoney(ind.maiorPerda.valor):'—'}</div><div class="label">Maior perda financeira</div></div>
      <div class="aud-kpi"><div class="num mono">${audFmtMoney(ind.valorDivergente)}</div><div class="label">Valor líquido divergente</div></div>
      <div class="aud-kpi"><div class="num mono">${audFmtMoney(ind.valorAbsoluto)}</div><div class="label">Valor absoluto total</div></div>
    </div>
    <div class="two-col">
      ${topTable('Top 20 maiores perdas', ind.top20Perdas)}
      ${topTable('Top 20 maiores ganhos', ind.top20Ganhos)}
    </div>
    <div class="panel">
      <h3>Pareto financeiro (top 20 perdas)</h3>
      <div class="table-wrap"><table><thead><tr><th>Item</th><th>Inventário</th><th>Valor</th><th>% Acumulado</th></tr></thead>
      <tbody>${ind.pareto.map(p=>`<tr><td class="mono">${esc(p.item)}</td><td>${esc(p.inventario)}</td><td class="mono aud-neg">${audFmtMoney(p.valor)}</td><td class="mono">${p.pctAcumulado.toFixed(1)}%</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);">Sem registros</td></tr>'}</tbody></table></div>
    </div>
  `;
}

/* ============================================================
   CONFIGURAÇÕES — TABELA NET
   ============================================================ */
function audRenderConfig(){
  const rows = AUD.netConfig.slice().sort((a,b)=>{
    if(a.origem==='auto' && b.origem!=='auto') return -1;
    if(b.origem==='auto' && a.origem!=='auto') return 1;
    return a.cod.localeCompare(b.cod);
  });
  return `
    <div class="panel">
      <h3>Motor de regras — considerar no NET</h3>
      <p class="field-hint" style="margin-bottom:12px;">Defina, por código de legenda (extraído de "Obs inventario" da QUERY 845), se o ajuste deve entrar no cálculo do NET. Códigos novos detectados na importação aparecem automaticamente aqui como <b>Não</b>, sinalizados para revisão.</p>
      <div class="action-bar"><div></div><button class="btn btn-primary" onclick="audAddNetRow()">+ Adicionar código</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th style="width:90px;">Código</th><th>Descrição</th><th style="width:110px;">Considerar NET</th><th style="width:90px;">Origem</th><th style="width:60px;"></th></tr></thead>
        <tbody>
          ${rows.map(r=>`<tr ${r.origem==='auto'?'style="background:rgba(254,80,0,.06);"':''}>
            <td class="mono">${r.novo ? `<input value="${esc(r.cod)}" style="width:80px;" onchange="audNetRowRename('${esc(r.cod)}', this.value)">` : esc(r.cod)}</td>
            <td><input value="${esc(r.descricao)}" onchange="audUpdateNetRow('${esc(r.cod)}','descricao',this.value)"></td>
            <td><label class="aud-toggle"><input type="checkbox" ${r.net?'checked':''} onchange="audUpdateNetRow('${esc(r.cod)}','net',this.checked)"> Sim</label></td>
            <td>${r.origem==='auto'?'<span class="stamp-tag tag-alert">Novo</span>':'<span class="stamp-tag tag-muted">Semente</span>'}</td>
            <td><button class="btn-danger-text" onclick="audDeleteNetRow('${esc(r.cod)}')">Remover</button></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
  `;
}
async function audUpdateNetRow(cod, field, value){
  const row = AUD.netConfig.find(r=>r.cod===cod);
  if(!row) return;
  row[field] = value;
  if(field==='descricao') row.revisar = /revisar/i.test(value);
  await audSaveNetConfig([row]);
  showToast('Regra atualizada.');
}
async function audAddNetRow(){
  const cod = 'NOVO'+(AUD.netConfig.length+1);
  const row = {cod, descricao:'', net:false, origem:'manual', novo:true};
  AUD.netConfig.push(row);
  await audSaveNetConfig([row]);
  renderView();
}
async function audNetRowRename(oldCod, newCod){
  newCod = newCod.trim().toUpperCase();
  if(!newCod) return;
  const row = AUD.netConfig.find(r=>r.cod===oldCod);
  if(!row) return;
  const db = await audDB();
  await new Promise((resolve,reject)=>{
    const tx = db.transaction(AUD_STORES.netConfig,'readwrite');
    tx.objectStore(AUD_STORES.netConfig).delete(oldCod);
    tx.oncomplete = resolve; tx.onerror = ()=>reject(tx.error);
  });
  row.cod = newCod; delete row.novo;
  await audSaveNetConfig([row]);
  AUD.netConfig = await audGetNetConfig();
  renderView();
  showToast('Código salvo: '+newCod);
}
async function audDeleteNetRow(cod){
  if(!confirm('Remover a regra "'+cod+'"?')) return;
  const db = await audDB();
  await new Promise((resolve,reject)=>{
    const tx = db.transaction(AUD_STORES.netConfig,'readwrite');
    tx.objectStore(AUD_STORES.netConfig).delete(cod);
    tx.oncomplete = resolve; tx.onerror = ()=>reject(tx.error);
  });
  AUD.netConfig = await audGetNetConfig();
  renderView();
  showToast('Regra removida.');
}

/* ============================================================
   RELATÓRIOS + IMPRESSÃO OPERACIONAL
   ============================================================ */
const AUD_PRINT_SCOPES = [
  ['todos','Todos'], ['perdas','Somente perdas'], ['ganhos','Somente ganhos'], ['pendentes','Somente pendentes'],
  ['altoValor','Somente alto valor'], ['altaPrioridade','Somente alta prioridade'], ['real','Somente divergências reais']
];
function audRenderRelatorios(){
  return `
    <div class="panel">
      <h3>Exportar auditoria — Ano ${AUD.currentAno}</h3>
      <p class="field-hint" style="margin-bottom:12px;">Exporta a base tratada e diagnosticada do ano selecionado.</p>
      <div class="action-bar">
        <div class="btn-group">
          <button class="btn btn-primary" onclick="audExportCsv(AUD.list.filter(r=>r.necessitaValidacao), 'auditoria_pendentes_'+AUD.currentAno+'.csv')">Exportar pendentes (CSV)</button>
          <button class="btn btn-secondary" onclick="audExportCsv(AUD.list, 'auditoria_completa_'+AUD.currentAno+'.csv')">Exportar base completa (CSV)</button>
          <button class="btn btn-secondary" onclick="audExportXlsx()">Exportar base completa (XLSX)</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <h3>Exportar indicadores</h3>
      <div class="action-bar">
        <div class="btn-group">
          <button class="btn btn-secondary" onclick="audExportIndicadoresJson()">Exportar indicadores (JSON)</button>
          <button class="btn btn-secondary" onclick="audExportIndicadoresCsv()">Exportar indicadores (CSV)</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <h3>Folha operacional de impressão</h3>
      <p class="field-hint" style="margin-bottom:10px;">Gera uma folha A4 enxuta para uso durante a conferência física — sem gráficos, KPIs ou menus.</p>
      <div class="aud-print-scope-bar">
        <label>Escopo:</label>
        <select id="aud-print-scope-select">${AUD_PRINT_SCOPES.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select>
        <button class="btn btn-primary" onclick="audPrintFolha(document.getElementById('aud-print-scope-select').value)">Gerar e imprimir</button>
      </div>
    </div>
    <div class="panel">
      <h3>Histórico de processamentos</h3>
      <div class="table-wrap"><table><thead><tr><th>Ano</th><th>Linhas</th><th>Pendentes</th><th>Duplicidades removidas</th><th>Processado em</th></tr></thead>
      <tbody id="aud-history-tbody">
      <tr id="aud-history-body"><td colspan="5" style="text-align:center;color:var(--ink-soft);">Carregando...</td></tr>
      </tbody></table></div>
    </div>
    <div id="aud-print-sheet"></div>
  `;
}
function audPrintFolha(scope){
  let rows = AUD.list.slice();
  if(scope==='perdas') rows = rows.filter(r=>r.vlDivergencia<0);
  else if(scope==='ganhos') rows = rows.filter(r=>r.vlDivergencia>0);
  else if(scope==='pendentes') rows = rows.filter(r=>r.necessitaValidacao);
  else if(scope==='altoValor') rows = rows.filter(r=>Math.abs(r.vlDivergencia)>=1000);
  else if(scope==='altaPrioridade') rows = rows.filter(r=>r.prioridade==='alta');
  else if(scope==='real') rows = rows.filter(r=>r.diagnostico==='divergencia_real');

  const sheet = document.getElementById('aud-print-sheet');
  if(!rows.length){ showToast('Nenhum registro no escopo selecionado.', true); return; }
  const inventarios = Array.from(new Set(rows.map(r=>r.inventario))).slice(0,3).join(', ');
  const usuarios = Array.from(new Set(rows.map(r=>r.usuario))).slice(0,3).join(', ');
  sheet.innerHTML = `<div class="aud-print-page">
    <div class="aud-print-head">
      <div><h2>Folha Operacional de Auditoria de Inventário</h2>
      <div>Inventário(s): ${esc(inventarios)}${rows.length>3?' (+)':''} · Usuário(s): ${esc(usuarios)}</div></div>
      <div style="text-align:right;">Data: ${new Date().toLocaleDateString('pt-BR')}<br>Itens: ${rows.length}<br>Página 1</div>
    </div>
    <table class="aud-print-table">
      <thead><tr><th>Item</th><th>EAN</th><th>Descrição</th><th>Endereço</th><th>Qtde Div.</th><th>Qtde Encontrada</th><th>Endereço Encontrado</th><th>Observações</th><th>Auditor</th><th>Data</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td>${esc(r.itemWms)}</td><td>${esc(r.ean)}</td><td>${esc(r.descricao)}</td><td>${esc(r.endereco)}</td>
        <td>${audFmtInt(r.diferenca)}</td><td class="tall"></td><td class="tall"></td><td class="tall"></td><td class="tall"></td><td class="tall"></td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
  setTimeout(()=>window.print(), 80);
}
function audExportXlsx(){
  if(!AUD.list.length){ showToast('Nada para exportar.', true); return; }
  const ws = XLSX.utils.json_to_sheet(AUD.list.map(r=>({
    Inventario:r.inventario, Local:r.local, Endereco:r.endereco, ItemWMS:r.itemWms, ItemSIGE:r.itemSige,
    Descricao:r.descricao, EAN:r.ean, CodTerceiro:r.codTerceiro, QtdeLogica:r.qtdeLogica, QtdeFisica:r.qtdeFisica,
    Diferenca:r.diferenca, VlLogico:r.vlLogico, VlFisico:r.vlFisico, VlDivergencia:r.vlDivergencia,
    DataInicio:r.dataInicio, DataFim:r.dataFim, Usuario:r.usuario, CodLegenda:r.codLegenda, DescLegenda:r.descLegenda,
    ConsiderarNET:r.considerarNet?'Sim':'Não', Diagnostico:(AUD_DIAG[r.diagnostico]||{}).label||r.diagnostico,
    Prioridade:r.prioridade, NecessitaValidacao:r.necessitaValidacao?'Sim':'Não', SituacaoLiquidada:r.situacaoLiquidada?'Sim':'Não',
    Justificativa:r.justificativa, EstoqueTotal:r.estoqueTotal, EstoqueNoEndereco:r.estoqueQtdNoEndereco,
    EstoqueNumEnderecos:r.estoqueNumEnderecos, EstoqueTotalLiquidado:r.estoqueTotalLiquidado,
    EstoqueNumEnderecosLiquidados:r.estoqueNumEnderecosLiquidados, Ano:r.ano
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Auditoria');
  XLSX.writeFile(wb, 'auditoria_'+AUD.currentAno+'.xlsx');
}
function audExportIndicadoresJson(){
  if(!AUD.indicadores){ showToast('Nada para exportar.', true); return; }
  const blob = new Blob([JSON.stringify(AUD.indicadores, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'indicadores_'+AUD.currentAno+'.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function audExportIndicadoresCsv(){
  if(!AUD.indicadores){ showToast('Nada para exportar.', true); return; }
  const ind = AUD.indicadores;
  const simples = {
    totalImportadas:ind.totalImportadas, duplicidadesRemovidas:ind.duplicidadesRemovidas,
    considerNetSim:ind.considerNetSim, considerNetNao:ind.considerNetNao, itensUnicos:ind.itensUnicos,
    inventarios:ind.inventarios, enderecos:ind.enderecos, usuarios:ind.usuarios,
    qtdDivergente:ind.qtdDivergente, valorDivergente:ind.valorDivergente, qtdPositiva:ind.qtdPositiva,
    qtdNegativa:ind.qtdNegativa, saldoLiquido:ind.saldoLiquido, qtdAbsoluta:ind.qtdAbsoluta,
    valorAbsoluto:ind.valorAbsoluto, necessitaValidacao:ind.necessitaValidacao
  };
  const lines = ['Indicador;Valor', ...Object.entries(simples).map(([k,v])=>`${k};${v}`)];
  const csv = '﻿'+lines.join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'indicadores_'+AUD.currentAno+'.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
async function audFillHistory(){
  const el = document.getElementById('aud-history-body');
  if(!el) return;
  const metas = await audGetAllImportMeta();
  if(!metas.length){ el.outerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);">Sem processamentos</td></tr>'; return; }
  el.outerHTML = metas.sort((a,b)=>b.ano-a.ano).map(m=>`<tr>
    <td>${m.ano}</td><td class="mono">${audFmtInt(m.totalLinhas)}</td><td class="mono">${audFmtInt(m.necessitaValidacao)}</td>
    <td class="mono">${audFmtInt(m.duplicidadesRemovidas)}</td><td>${new Date(m.processedAt).toLocaleString('pt-BR')}</td>
  </tr>`).join('');
}
