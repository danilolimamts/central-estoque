/* ============================================================
   Auditoria de Divergências de Inventário — UI principal
   Módulo independente: importação, motor de regras, diagnóstico,
   dashboards, tela de auditoria, configurações e relatórios.
   Toda a persistência é local (IndexedDB) — sem servidor, sem API.
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
  list:[],
  filtered:[],
  showAll:false,
  filtersOpen:false,
  dashTab:'executivo',
  filters:{search:'', inventario:'', usuario:'', diagnostico:'', necessita:'', valorMin:'', valorMax:'', qtdMin:'', qtdMax:'', dataIni:'', dataFim:'', legenda:'', prioridade:''},
  scrollHandler:null
};

const AUD_ROW_H = 272;

function audFmtInt(n){ return Math.round(n||0).toLocaleString('pt-BR'); }
function audFmtNum(n, dec){ return (n||0).toLocaleString('pt-BR', {minimumFractionDigits:dec||0, maximumFractionDigits:dec||2}); }
function audFmtMoney(n){ return (n||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }

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
}
async function audLoadLista(){
  AUD.list = await audGetDivergenciasByAno(AUD.currentAno);
  audApplyFilters();
}

/* ============================================================
   DISPATCH — chamado pelo renderView() do app principal
   ============================================================ */
function audRenderTab(tab){
  if(tab==='aud-import') return audRenderImport();
  if(tab==='aud-audit') return audRenderAuditoria();
  if(tab==='aud-dash') return audRenderDashboards();
  if(tab==='aud-config') return audRenderConfig();
  if(tab==='aud-reports') return audRenderRelatorios();
  return '';
}
function audOnRender(tab){
  if(tab==='aud-audit') audMountCardsScroll();
  if(tab==='aud-reports') audFillHistory();
}

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
    <p class="field-hint">Processado em ${new Date(m.processedAt).toLocaleString('pt-BR')}. <a href="#" onclick="switchTab('aud-audit');return false;">Ir para a auditoria &rarr;</a></p>
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
        showToast('✓ Auditoria processada: '+audFmtInt(msg.total)+' divergências, '+audFmtInt(msg.necessitaValidacao)+' precisam de validação.');
        if(msg.codigosNovos && msg.codigosNovos.length){
          setTimeout(()=>showToast('Atenção: '+msg.codigosNovos.length+' código(s) de legenda novo(s) — revise em Configurações NET.', true), 2600);
        }
        switchTab('aud-audit');
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
   TELA DE AUDITORIA
   ============================================================ */
function audRenderAuditoria(){
  if(!AUD.list.length){
    return emptyState('Nenhuma divergência carregada', 'Processe uma auditoria na aba Importação para ver a lista priorizada aqui.', "switchTab('aud-import')", 'Ir para Importação');
  }
  const uniq = (field)=>Array.from(new Set(AUD.list.map(r=>r[field]).filter(Boolean))).sort();
  const invs = uniq('inventario'), users = uniq('usuario'), legendas = uniq('codLegenda');

  return `
    ${audAnoSelector()}
    <div class="aud-toolbar">
      <div class="aud-search-wrap">
        <input type="text" id="aud-search" placeholder="Buscar por item, descrição, EAN, endereço, inventário, usuário ou fornecedor..." value="${esc(AUD.filters.search)}" oninput="audOnSearch(this.value)">
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

function audAnoSelector(){
  if(AUD.anos.length<=1) return '';
  return `<div class="aud-ano-selector">
    <label>Ano:</label>
    <select onchange="audChangeAno(this.value)">
      ${AUD.anos.map(a=>`<option value="${a}" ${a===AUD.currentAno?'selected':''}>${a}</option>`).join('')}
    </select>
  </div>`;
}
async function audChangeAno(ano){
  AUD.currentAno = parseInt(ano,10);
  await audLoadMetaAndIndicadores(AUD.currentAno);
  await audLoadLista();
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
  AUD.filtered = AUD.list.filter(r=>{
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
      const hay = (r.itemWms+' '+r.descricao+' '+r.ean+' '+r.endereco+' '+r.inventario+' '+r.usuario+' '+r.fornecedor).toLowerCase();
      if(!hay.includes(search)) return false;
    }
    return true;
  });
  AUD.filtered.sort((a,b)=> (AUD_DIAG[b.diagnostico]?.prioridade||0) - (AUD_DIAG[a.diagnostico]?.prioridade||0) || Math.abs(b.vlDivergencia) - Math.abs(a.vlDivergencia));
}

/* ---- Virtual scroll ---- */
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
  if(!total){ winEl.innerHTML = `<div class="empty-state"><div class="eicon">&#128269;</div><h3>Nenhuma divergência encontrada</h3><p>Ajuste a busca ou os filtros.</p></div>`; return; }
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
   DASHBOARDS
   ============================================================ */
function audRenderDashboards(){
  if(!AUD.indicadores) return emptyState('Nenhum indicador disponível', 'Processe uma auditoria na aba Importação para ver os dashboards.', "switchTab('aud-import')", 'Ir para Importação');
  const ind = AUD.indicadores;
  const tabs = [['executivo','Executivo'],['financeiro','Financeiro'],['operacional','Operacional']];
  return `
    ${audAnoSelector()}
    <div class="aud-subtabs">
      ${tabs.map(([k,l])=>`<button class="aud-subtab ${AUD.dashTab===k?'active':''}" onclick="audSetDashTab('${k}')">${l}</button>`).join('')}
    </div>
    ${AUD.dashTab==='executivo' ? audDashExecutivo(ind) : ''}
    ${AUD.dashTab==='financeiro' ? audDashFinanceiro(ind) : ''}
    ${AUD.dashTab==='operacional' ? audDashOperacional(ind) : ''}
  `;
}
function audSetDashTab(t){ AUD.dashTab = t; renderView(); }

function audDashExecutivo(ind){
  const diagRows = Object.entries(AUD_DIAG).map(([k,v])=>({label:v.label, cor:v.cor, count: ind.porDiagnostico[k]||0}));
  const maxCount = Math.max(1, ...diagRows.map(d=>d.count));
  return `
    <div class="stat-grid">
      <div class="stat-card"><div class="num mono">${audFmtInt(ind.totalImportadas)}</div><div class="label">Total de divergências</div></div>
      <div class="stat-card accent"><div class="num mono">${audFmtInt(ind.necessitaValidacao)}</div><div class="label">Pendentes de validação</div></div>
      <div class="stat-card blue"><div class="num mono">${audFmtInt(ind.considerNetSim)}</div><div class="label">Consideradas no NET</div></div>
      <div class="stat-card"><div class="num mono">${audFmtInt(ind.considerNetNao)}</div><div class="label">Fora do NET</div></div>
    </div>
    <div class="panel">
      <h3>Divergências por diagnóstico</h3>
      ${diagRows.map(d=>`<div class="bar-row">
        <div class="bar-label" style="width:170px;">${d.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(d.count/maxCount*100).toFixed(1)}%;background:${d.cor};"></div></div>
        <div class="bar-value" style="width:56px;">${audFmtInt(d.count)}</div>
      </div>`).join('')}
    </div>
    <div class="two-col">
      <div class="panel"><h3>Volumes</h3>
        <div class="panel-row"><span>Itens únicos</span><b class="mono">${audFmtInt(ind.itensUnicos)}</b></div>
        <div class="panel-row"><span>Inventários</span><b class="mono">${audFmtInt(ind.inventarios)}</b></div>
        <div class="panel-row"><span>Endereços</span><b class="mono">${audFmtInt(ind.enderecos)}</b></div>
        <div class="panel-row"><span>Usuários</span><b class="mono">${audFmtInt(ind.usuarios)}</b></div>
      </div>
      <div class="panel"><h3>Saldos</h3>
        <div class="panel-row"><span>Quantidade positiva</span><b class="mono aud-pos">+${audFmtInt(ind.qtdPositiva)}</b></div>
        <div class="panel-row"><span>Quantidade negativa</span><b class="mono aud-neg">${audFmtInt(ind.qtdNegativa)}</b></div>
        <div class="panel-row"><span>Saldo líquido</span><b class="mono">${audFmtInt(ind.saldoLiquido)}</b></div>
        <div class="panel-row"><span>Quantidade absoluta</span><b class="mono">${audFmtInt(ind.qtdAbsoluta)}</b></div>
      </div>
    </div>
  `;
}

function audDashFinanceiro(ind){
  const topTable = (title, rows)=>`<div class="panel">
    <h3>${title}</h3>
    <div class="table-wrap"><table><thead><tr><th>Item</th><th>Descrição</th><th>Inventário</th><th>Endereço</th><th>Valor</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td class="mono">${esc(r.item)}</td><td>${esc(r.descricao||'—')}</td><td>${esc(r.inventario)}</td><td>${esc(r.endereco||'—')}</td><td class="mono ${r.valor>0?'aud-pos':'aud-neg'}">${audFmtMoney(r.valor)}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);">Sem registros</td></tr>'}</tbody></table></div>
  </div>`;
  return `
    <div class="stat-grid">
      <div class="stat-card blue"><div class="num mono">${ind.maiorGanho?audFmtMoney(ind.maiorGanho.valor):'—'}</div><div class="label">Maior ganho</div></div>
      <div class="stat-card accent"><div class="num mono">${ind.maiorPerda?audFmtMoney(ind.maiorPerda.valor):'—'}</div><div class="label">Maior perda</div></div>
      <div class="stat-card"><div class="num mono">${audFmtMoney(ind.valorDivergente)}</div><div class="label">Valor líquido divergente</div></div>
      <div class="stat-card"><div class="num mono">${audFmtMoney(ind.valorAbsoluto)}</div><div class="label">Valor absoluto total</div></div>
    </div>
    <div class="two-col">
      ${topTable('Top 20 perdas', ind.top20Perdas)}
      ${topTable('Top 20 ganhos', ind.top20Ganhos)}
    </div>
    <div class="panel">
      <h3>Pareto de perdas (top 20)</h3>
      <div class="table-wrap"><table><thead><tr><th>Item</th><th>Inventário</th><th>Valor</th><th>% Acumulado</th></tr></thead>
      <tbody>${ind.pareto.map(p=>`<tr><td class="mono">${esc(p.item)}</td><td>${esc(p.inventario)}</td><td class="mono aud-neg">${audFmtMoney(p.valor)}</td><td class="mono">${p.pctAcumulado.toFixed(1)}%</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);">Sem registros</td></tr>'}</tbody></table></div>
    </div>
  `;
}

function audDashOperacional(ind){
  const rankTable = (title, rows)=>`<div class="panel">
    <h3>${title}</h3>
    <div class="table-wrap"><table><thead><tr><th>Chave</th><th>Ocorrências</th><th>Qtde</th><th>Valor</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${esc(r.chave||'—')}</td><td class="mono">${audFmtInt(r.ocorrencias)}</td><td class="mono">${audFmtInt(r.qtd)}</td><td class="mono ${r.valor>=0?'aud-pos':'aud-neg'}">${audFmtMoney(r.valor)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);">Sem registros</td></tr>'}</tbody></table></div>
  </div>`;
  return `
    <div class="two-col">
      ${rankTable('Ranking de itens', ind.rankItens)}
      ${rankTable('Ranking de endereços', ind.rankEnderecos)}
    </div>
    <div class="two-col">
      ${rankTable('Ranking de usuários', ind.rankUsuarios)}
      ${rankTable('Ranking de inventários', ind.rankInventarios)}
    </div>
    <div class="two-col">
      ${rankTable('Ranking de famílias (classe SKU)', ind.rankFamilias)}
      ${rankTable('Ranking de fornecedores (cod. terceiro)', ind.rankFornecedores)}
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
          ${rows.map(r=>`<tr ${r.origem==='auto'?'style="background:rgba(250,70,22,.06);"':''}>
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
   RELATÓRIOS
   ============================================================ */
function audRenderRelatorios(){
  return `
    ${audAnoSelector()}
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
      <h3>Histórico de processamentos</h3>
      <div class="table-wrap"><table><thead><tr><th>Ano</th><th>Linhas</th><th>Pendentes</th><th>Duplicidades removidas</th><th>Processado em</th></tr></thead>
      <tbody id="aud-history-tbody">
      <tr id="aud-history-body"><td colspan="5" style="text-align:center;color:var(--ink-soft);">Carregando...</td></tr>
      </tbody></table></div>
    </div>
  `;
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
