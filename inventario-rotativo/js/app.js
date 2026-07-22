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
  files:{f390:null, f114:null, f843:null, fCong:null},
  processing:false, progress:{stage:'', pct:0},
  divergencias:[], locais:[], contagens:[],
  divFilters:{search:'', local:''},
  auditFilters:{minPrioridade:0},
  prodFilters:{de:'', ate:''},
  compararA:null, compararB:null,
  novoCiclo:false
};

function irEsc(v){ if(v===undefined||v===null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function irFmtInt(n){ return Math.round(n||0).toLocaleString('pt-BR'); }
function irFmtNum(n, dec){ return (n||0).toLocaleString('pt-BR', {minimumFractionDigits:dec||0, maximumFractionDigits:dec===undefined?2:dec}); }
function irFmtMoney(n){ return (n||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
function irFmtPct(n){ return ((n||0)*100).toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1})+'%'; }
function irFmtDate(s){ if(!s) return '—'; const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR'); }
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
  irUpdateThemeLabel();

  try{
    IR.prioridadeConfig = await irSeedPrioridadeConfigIfEmpty();
    IR.ciclos = await irGetAllCiclos();
    if(IR.ciclos.length){
      IR.cicloAtivo = IR.ciclos.find(c=>c.status==='aberto') || IR.ciclos[0];
      await irLoadCicloData(IR.cicloAtivo.id);
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
function irToggleSidebar(){ document.getElementById('sidebar').classList.toggle('collapsed'); }
function irToggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
  const next = cur==='dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ir-theme', next);
  irUpdateThemeLabel();
}
function irUpdateThemeLabel(){
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
  const label = document.getElementById('themeToggleLabel');
  if(label) label.textContent = cur==='dark' ? 'Modo escuro' : 'Modo claro';
}

const IR_TAB_LABELS = {
  dashboard:['Dashboard Executivo','Visão geral do ciclo ativo.'],
  ciclo:['Gestão do Ciclo','Locais congelados, andamento e encerramento do ciclo.'],
  produtividade:['Produtividade','Ranking e desempenho dos colaboradores.'],
  divergencias:['Divergências','Itens com saldo final diferente do sistêmico.'],
  auditoria:['Auditoria Inteligente','Fila priorizada automaticamente para conferência.'],
  historico:['Histórico','Linha do tempo de todos os ciclos.'],
  comparativo:['Comparativo entre Ciclos','Compare acurácia, produtividade e tendências.'],
  indicadores:['Indicadores','Todos os KPIs, com a fórmula de cada um.'],
  importacao:['Importação','Importe as 4 planilhas e abra ou atualize um ciclo.'],
  configuracoes:['Configurações','Pesos do Índice de Prioridade de Auditoria.']
};
function irSwitchTab(tab){
  IR.currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  const [title, sub] = IR_TAB_LABELS[tab] || [tab, ''];
  document.getElementById('tabTitle').textContent = title;
  document.getElementById('tabSubtitle').textContent = sub;
  const badge = document.getElementById('cycleBadge');
  badge.textContent = IR.cicloAtivo ? `Ciclo ${IR.cicloAtivo.numero} — ${IR.cicloAtivo.status==='aberto'?'Aberto':'Encerrado'}` : 'Nenhum ciclo ativo';
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
  {key:'f390', label:'QRY0390', desc:'Estoque por Local', pattern:/0390/i},
  {key:'f114', label:'QRY0114', desc:'Divergências de Inventário (final)', pattern:/0114/i},
  {key:'f843', label:'QRY0843', desc:'Produtividade', pattern:/0843/i},
  {key:'fCong', label:'Base Congelada', desc:'Locais congelados do ciclo (planilha manual)', pattern:/congelad/i}
];
function irRenderImportacao(){
  const f = IR.files;
  const allSelected = f.f390 && f.f114 && f.f843 && f.fCong;
  const dz = (t)=>{
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
      <p class="field-hint" style="margin-bottom:14px;">Arraste as 4 planilhas de uma vez aqui em cima (o sistema identifica cada uma pelo nome do arquivo), ou selecione individualmente abaixo.</p>
      <div class="dz-grid">${IR_FILE_TYPES.map(dz).join('')}</div>
      <div class="two-col" style="margin-top:16px;">
        <div><label>Número do ciclo</label><input type="number" id="ir-inp-ciclo" min="1" value="${IR.cicloAtivo ? IR.cicloAtivo.numero : (IR.ciclos.length?Math.max(...IR.ciclos.map(c=>c.numero))+1:1)}"></div>
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
          : `<p class="field-hint" style="margin-top:14px;">Selecione as 4 planilhas para habilitar o processamento.</p>`
      }
    </div>
    ${IR.importMeta ? irRenderUltimoProcessamento() : ''}
  `;
}
function irRenderUltimoProcessamento(){
  const m = IR.importMeta;
  return `<div class="panel"><h3>Último processamento — Ciclo ${IR.cicloAtivo.numero}</h3>
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
function irOnDropSingle(e, key){
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if(file) irOnFile(key, file);
}
function irOnDropMulti(e){
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files || []);
  if(!files.length) return;
  let matched = 0, unmatched = [];
  for(const file of files){
    const key = irClassifyFile(file);
    if(key){ IR.files[key] = file; matched++; }
    else unmatched.push(file.name);
  }
  irRenderView();
  if(matched) irShowToast(matched+' arquivo(s) reconhecido(s) automaticamente.');
  if(unmatched.length) irShowToast('Não consegui identificar: '+unmatched.join(', ')+'. Selecione manualmente.', true);
}
async function irProcessar(){
  if(IR.processing) return;
  const f = IR.files;
  if(!(f.f390 && f.f114 && f.f843 && f.fCong)) return;
  const numero = parseInt(document.getElementById('ir-inp-ciclo').value, 10);
  const dataAbertura = document.getElementById('ir-inp-abertura').value;
  const dataPrevistaTermino = document.getElementById('ir-inp-termino').value;
  if(!numero || !dataAbertura){ irShowToast('Informe o número do ciclo e a data de abertura.', true); return; }

  const existente = IR.ciclos.find(c=>c.numero===numero);
  const cicloId = existente ? existente.id : 'ciclo-'+numero+'-'+Date.now().toString(36);
  const ciclo = {
    id: cicloId, numero, dataAbertura, dataPrevistaTermino: dataPrevistaTermino||null,
    dataEncerramento: existente ? existente.dataEncerramento : null,
    status: existente ? existente.status : 'aberto'
  };

  IR.processing = true; IR.progress = {stage:'Lendo arquivos...', pct:0};
  irRenderView();
  try{
    const [buf390, buf114, buf843, bufCongelada] = await Promise.all([
      f.f390.arrayBuffer(), f.f114.arrayBuffer(), f.f843.arrayBuffer(), f.fCong.arrayBuffer()
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
        IR.files = {f390:null, f114:null, f843:null, fCong:null};
        IR.ciclos = await irGetAllCiclos();
        IR.cicloAtivo = IR.ciclos.find(c=>c.id===cicloId);
        await irLoadCicloData(cicloId);
        irShowToast('✓ Ciclo '+numero+' processado: '+irFmtInt(msg.totalLocais)+' locais, '+irFmtInt(msg.totalDivergencias)+' itens divergentes.');
        irSwitchTab('dashboard');
      }
    };
    worker.onerror = (err)=>{ IR.processing=false; irShowToast('Erro no worker: '+err.message, true); irRenderView(); };
    worker.postMessage({
      type:'process', buf390, buf114, buf843, bufCongelada,
      cicloId, cicloNumero:numero, dataAbertura, dataPrevistaTermino,
      prioridadeConfig: IR.prioridadeConfig
    }, [buf390, buf114, buf843, bufCongelada]);
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

/* ============================================================
   DASHBOARD EXECUTIVO
   ============================================================ */
function irRenderDashboard(){
  const ind = IR.indicadores;
  if(!ind) return irEmptyState('Sem indicadores', 'Processe o ciclo na Importação.', "irSwitchTab('importacao')", 'Ir para Importação');
  const kpis = [
    ['Acurácia Peças', irFmtPct(ind.acuraciaPecas), ind.acuraciaPecas>=ind.meta?'good':'bad', ind.acuraciaPecas],
    ['Acurácia Local', irFmtPct(ind.acuraciaLocal), ind.acuraciaLocal>=ind.meta?'good':'bad', ind.acuraciaLocal],
    ['Acurácia Valor', irFmtPct(ind.acuraciaValor), ind.acuraciaValor>=ind.meta?'good':'bad', ind.acuraciaValor],
    ['Meta', irFmtPct(ind.meta), '', null],
    ['Andamento do Ciclo', irFmtPct(ind.andamentoCiclo), '', ind.andamentoCiclo],
    ['Locais Concluídos', irFmtInt(ind.locaisConcluidos), '', null],
    ['Locais Pendentes', irFmtInt(ind.locaisPendentes), 'orange', null],
    ['Itens Divergentes', irFmtInt(ind.itensDivergentes), 'orange', null],
    ['Valor Financeiro Divergente', irFmtMoney(ind.valorDivergenteAbsoluto), 'bad', null],
    ['Qtd. de Recontagens', irFmtInt(ind.qtdRecontagens), '', null],
    ['Tempo Médio (min/contagem)', irFmtNum(ind.tempoMedioContagemMin,1), '', null],
    ['Dias Restantes', ind.diasRestantes===null?'—':irFmtInt(ind.diasRestantes), '', null],
    ['Eficiência', irFmtPct(ind.eficiencia), ind.eficiencia>=0.8?'good':(ind.eficiencia>=0.5?'orange':'bad'), null]
  ];
  const ringRow = (label, val, meta)=>`<div class="panel">
    <h3>${label}</h3>
    <div class="num mono" style="font-size:28px;">${irFmtPct(val)}</div>
    <div class="progress-track"><div class="progress-fill ${val>=meta?'good':'orange'}" style="width:${Math.min(100,val*100)}%;"></div></div>
    <div class="field-hint" style="margin-top:6px;">Meta: ${irFmtPct(meta)}</div>
  </div>`;
  return `
    <div class="kpi-grid">
      ${kpis.map(([label,val,cls])=>`<div class="kpi-card ${cls||''}"><div class="num mono">${val}</div><div class="label">${label}</div></div>`).join('')}
    </div>
    <div class="bi-grid-3">
      ${ringRow('Acurácia Peças', ind.acuraciaPecas, ind.meta)}
      ${ringRow('Acurácia Local', ind.acuraciaLocal, ind.meta)}
      ${ringRow('Acurácia Valor', ind.acuraciaValor, ind.meta)}
    </div>
    ${irRenderPorRuaPanel(ind)}
    <div class="bi-grid-2">
      ${irRenderPorLogPanel(ind)}
      ${irRenderContadosPorDiaPanel(ind)}
    </div>
    <div class="bi-grid-2">
      ${irRenderRuasMaisDivergentesPanel(ind)}
      ${irRenderTopItensPanel(ind)}
    </div>
    <div class="panel">
      <h3>Locais em andamento agora</h3>
      ${irLocaisEmAndamentoTable()}
    </div>
  `;
}
function irHeatStyle(val, meta){
  const t = Math.max(0, Math.min(1, meta>0 ? val/meta : val));
  const r = Math.round(200 + (31-200)*t), g = Math.round(56 + (138-56)*t), b = Math.round(18 + (82-18)*t);
  return `background:rgba(${r},${g},${b},.14); color:rgb(${r},${g},${b});`;
}
function irRenderPorRuaPanel(ind){
  const rows = (ind.porRua||[]).filter(r=>r.chave!=='(sem rua)').slice().sort((a,b)=>a.chave.localeCompare(b.chave));
  if(!rows.length) return '';
  const meta = ind.meta;
  return `<div class="panel">
    <h3>Divergência por Rua</h3>
    <p class="panel-sub">Locais orçados x contados e acurácias por rua (coluna X1 da base congelada).</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Rua</th><th>Locais Orçados</th><th>Locais Contados</th><th>% Contado</th><th>Acurácia Peças</th><th>Posições</th><th>Valores</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td class="mono">${irEsc(r.chave)}</td>
        <td class="mono">${irFmtInt(r.locaisOrcados)}</td>
        <td class="mono">${irFmtInt(r.locaisContados)}</td>
        <td class="mono">${irFmtPct(r.pctContado)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaPecas, meta)}">${irFmtPct(r.acuraciaPecas)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaPosicoes, meta)}">${irFmtPct(r.acuraciaPosicoes)}</td>
        <td class="mono" style="${irHeatStyle(r.acuraciaValor, meta)}">${irFmtPct(r.acuraciaValor)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
function irRenderPorLogPanel(ind){
  const rows = (ind.porLog||[]).filter(r=>r.chave!=='(sem log)' && r.locaisContados>0).slice().sort((a,b)=>a.chave.localeCompare(b.chave));
  if(!rows.length) return `<div class="panel"><h3>Acurácias e NET por Log</h3><p class="field-hint">Nenhum log com locais contados ainda.</p></div>`;
  return `<div class="panel">
    <h3>Acurácias e NET por Log</h3>
    <p class="panel-sub">Grupo Classe da base congelada · barras: peças / posições / valores.</p>
    <div class="bi-vbars">
      ${rows.map(r=>`<div class="bi-vbar-col">
        <div class="bi-vbar-val">${irFmtMoney(r.valorDivergenteLiquido)}</div>
        <div class="bi-cluster" style="height:100px;">
          <div class="bi-vbar" style="height:${Math.round(r.acuraciaPecas*100)}%;" title="Peças: ${irFmtPct(r.acuraciaPecas)}"></div>
          <div class="bi-vbar orange" style="height:${Math.round(r.acuraciaPosicoes*100)}%;" title="Posições: ${irFmtPct(r.acuraciaPosicoes)}"></div>
          <div class="bi-vbar" style="height:${Math.round(r.acuraciaValor*100)}%;background:var(--blue-soft);" title="Valores: ${irFmtPct(r.acuraciaValor)}"></div>
        </div>
        <div class="bi-vbar-label">${irEsc(r.chave)}</div>
      </div>`).join('')}
    </div>
    <p class="field-hint" style="margin-top:8px;">
      <span class="mono" style="color:var(--blue);">■</span> Peças &nbsp;
      <span class="mono" style="color:var(--orange);">■</span> Posições &nbsp;
      <span class="mono" style="color:var(--blue-soft);">■</span> Valores
    </p>
  </div>`;
}
function irRenderContadosPorDiaPanel(ind){
  const rows = ind.contadosPorDia||[];
  if(!rows.length) return `<div class="panel"><h3>Contados por Dia</h3><p class="field-hint">Nenhuma contagem registrada ainda.</p></div>`;
  const max = Math.max(1, ...rows.map(r=>r.total));
  return `<div class="panel">
    <h3>Contados por Dia</h3>
    <p class="panel-sub">Volume de posições contadas por dia (exclui a contagem de abertura).</p>
    <div class="bi-vbars">
      ${rows.map(r=>`<div class="bi-vbar-col">
        <div class="bi-vbar-val">${irFmtInt(r.total)}</div>
        <div class="bi-vbar orange" style="height:${Math.round(r.total/max*100)}%;"></div>
        <div class="bi-vbar-label">${new Date(r.dia+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</div>
      </div>`).join('')}
    </div>
  </div>`;
}
function irRenderRuasMaisDivergentesPanel(ind){
  const rows = (ind.porRua||[]).filter(r=>r.chave!=='(sem rua)' && r.valorDivergenteAbsoluto>0).slice().sort((a,b)=>b.valorDivergenteAbsoluto-a.valorDivergenteAbsoluto).slice(0,8);
  if(!rows.length) return `<div class="panel"><h3>Ruas mais divergentes</h3><p class="field-hint">Nenhuma divergência registrada ainda.</p></div>`;
  const max = Math.max(...rows.map(r=>r.valorDivergenteAbsoluto));
  return `<div class="panel">
    <h3>Ruas mais divergentes</h3>
    <p class="panel-sub">Ranking por valor financeiro divergente absoluto.</p>
    ${rows.map(r=>`<div class="bi-hbar-row">
      <div class="bi-hbar-label mono">${irEsc(r.chave)}</div>
      <div class="bi-hbar-track"><div class="bi-hbar-fill" style="width:${Math.round(r.valorDivergenteAbsoluto/max*100)}%;"></div></div>
      <div class="bi-hbar-val">${irFmtMoney(r.valorDivergenteAbsoluto)}</div>
    </div>`).join('')}
  </div>`;
}
function irRenderTopItensPanel(ind){
  const pos = ind.topItensPositivos||[], neg = ind.topItensNegativos||[];
  if(!pos.length && !neg.length) return `<div class="panel"><h3>Maiores saldos por item</h3><p class="field-hint">Nenhuma divergência registrada ainda.</p></div>`;
  const maxAbs = Math.max(1, ...pos.map(i=>i.saldoQtd), ...neg.map(i=>Math.abs(i.saldoQtd)));
  const list = (items, cls)=>items.length ? items.map(i=>`<div class="bi-hbar-row">
      <div class="bi-hbar-label" title="${irEsc(i.descricao)}">${irEsc(i.descricao||i.item)}</div>
      <div class="bi-hbar-track"><div class="bi-hbar-fill ${cls}" style="width:${Math.round(Math.abs(i.saldoQtd)/maxAbs*100)}%;"></div></div>
      <div class="bi-hbar-val">${i.saldoQtd>0?'+':''}${irFmtInt(i.saldoQtd)}</div>
    </div>`).join('') : '<p class="field-hint">Nenhum.</p>';
  return `<div class="panel">
    <h3>Maiores saldos por item (sobra x falta)</h3>
    <p class="panel-sub">Soma líquida da diferença de quantidade por item, no ciclo.</p>
    <div class="bi-grid-2">
      <div><p class="field-hint" style="margin-bottom:6px;font-weight:700;color:var(--success);">MAIS SOBRA (saldo positivo)</p>${list(pos,'pos')}</div>
      <div><p class="field-hint" style="margin-bottom:6px;font-weight:700;color:var(--danger);">MAIS FALTA (saldo negativo)</p>${list(neg,'neg')}</div>
    </div>
  </div>`;
}
function irLocaisEmAndamentoTable(){
  const porLocal = new Map();
  for(const c of IR.contagens){
    if(!porLocal.has(c.local)) porLocal.set(c.local, {local:c.local, desc:c.descricaoLocal, rodadas:0, usuario:c.usuario, ultimaData:''});
    const g = porLocal.get(c.local);
    g.rodadas = Math.max(g.rodadas, c.idConferencia);
    if(c.dataFimContagem > g.ultimaData){ g.ultimaData = c.dataFimContagem; g.usuario = c.usuario; }
  }
  const rows = Array.from(porLocal.values()).sort((a,b)=>b.ultimaData.localeCompare(a.ultimaData)).slice(0,30);
  if(!rows.length) return '<p class="field-hint">Nenhuma contagem registrada ainda.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Local</th><th>Descrição</th><th>Rodada atual</th><th>Colaborador</th><th>Última atualização</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td class="mono">${irEsc(r.local)}</td><td>${irEsc(r.desc)}</td><td class="mono">${r.rodadas}</td><td>${irEsc(r.usuario)}</td><td>${r.ultimaData?new Date(r.ultimaData).toLocaleString('pt-BR'):'—'}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

/* ============================================================
   GESTÃO DO CICLO
   ============================================================ */
function irRenderGestaoCiclo(){
  const c = IR.cicloAtivo, ind = IR.indicadores;
  const statusPorLocal = irComputeStatusPorLocal();
  const congelados = IR.locais.filter(l=>l.isCongelado);
  return `
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <h3 style="margin-bottom:4px;">Ciclo ${c.numero} — ${c.status==='aberto'?'Aberto':'Encerrado'}</h3>
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
    <div class="panel">
      <h3>Locais congelados (${congelados.length})</h3>
      <div class="table-wrap"><table><thead><tr><th>Local</th><th>Descrição</th><th>Rua/Bloco</th><th>Status</th><th>Rodadas</th></tr></thead>
      <tbody>${congelados.slice(0,300).map(l=>{
        const st = statusPorLocal.get(l.idLocal) || {status:'nao_iniciado', rodadas:0};
        const info = IR_STATUS_LOCAL[st.status] || IR_STATUS_LOCAL.nao_iniciado;
        return `<tr><td class="mono">${irEsc(l.idLocal)}</td><td>${irEsc(l.descricao)}</td><td>${irEsc(l.x1)} / ${irEsc(l.x2)}</td>
        <td><span class="tag" style="background:${info.cor}22;color:${info.cor};">${info.label}</span></td><td class="mono">${st.rodadas}</td></tr>`;
      }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);">Nenhum local congelado</td></tr>'}</tbody>
      </table></div>
      ${congelados.length>300 ? `<p class="field-hint" style="margin-top:8px;">Mostrando 300 de ${congelados.length} locais.</p>` : ''}
    </div>
  `;
}
function irComputeStatusPorLocal(){
  const porLocal = new Map();
  for(const c of IR.contagens){
    if(!porLocal.has(c.local)) porLocal.set(c.local, []);
    porLocal.get(c.local).push(c);
  }
  const out = new Map();
  for(const [local, lista] of porLocal){
    const rodadas = Array.from(new Set(lista.map(c=>c.idConferencia))).sort((a,b)=>a-b);
    const maxRodada = rodadas[rodadas.length-1] || 0;
    let status = 'em_contagem';
    if(maxRodada<=1) status = 'em_contagem';
    else{
      const atual = lista.filter(c=>c.idConferencia===maxRodada);
      const anterior = lista.filter(c=>c.idConferencia===maxRodada-1);
      const mA = new Map(atual.map(c=>[c.item,c.qtFis])), mB = new Map(anterior.map(c=>[c.item,c.qtFis]));
      const todos = new Set([...mA.keys(),...mB.keys()]);
      let bateu = todos.size>0;
      for(const it of todos) if((mA.get(it)??null)!==(mB.get(it)??null)){ bateu=false; break; }
      status = bateu ? 'convergido' : (maxRodada>=5 ? 'encerrado_sem_convergencia' : 'em_contagem');
    }
    out.set(local, {status, rodadas:maxRodada});
  }
  return out;
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

/* ============================================================
   PRODUTIVIDADE
   ============================================================ */
function irProdSetFilter(key, val){ IR.prodFilters[key] = val; irRenderView(); }
function irProdToggleAbertura(){ IR.prodFilters.incluirAbertura = !IR.prodFilters.incluirAbertura; irRenderView(); }
function irProdContagensFiltradas(){
  const {de, ate, incluirAbertura} = IR.prodFilters;
  return IR.contagens.filter(c=>{
    if((incluirAbertura ? c.idConferencia<1 : c.idConferencia<=1) || !c.usuario || !c.dataInicioContagem) return false;
    const dia = c.dataInicioContagem.slice(0,10);
    if(de && dia<de) return false;
    if(ate && dia>ate) return false;
    return true;
  });
}
/* Calcula ranking, hora-a-hora e homem-hora a partir de um conjunto de contagens já filtrado.
   "Hora-homem" = nº de blocos de hora distintos em que cada colaborador registrou ao menos
   1 contagem, somado entre todos — aproximação simples (sem ponto eletrônico), sinalizada na tela. */
function irCalcProdutividade(contagens){
  const porUsuario = new Map();
  const porHora = new Map();
  const horasPorUsuario = new Map();
  const matrizLocais = new Map(); // usuario -> Map(hora -> Set(locais))
  for(const c of contagens){
    const hora = c.dataInicioContagem.slice(0,13); // YYYY-MM-DDTHH
    if(!porUsuario.has(c.usuario)) porUsuario.set(c.usuario, {usuario:c.usuario, locais:new Set(), itens:0, contagens:0, minutos:0, nMin:0, horas:new Set()});
    const gu = porUsuario.get(c.usuario);
    gu.locais.add(c.local); gu.itens++; gu.contagens++; gu.horas.add(hora);
    if(c.dataInicioContagem && c.dataFimContagem){
      const ini=new Date(c.dataInicioContagem).getTime(), fim=new Date(c.dataFimContagem).getTime();
      if(fim>ini){ gu.minutos += (fim-ini)/60000; gu.nMin++; }
    }
    if(!porHora.has(hora)) porHora.set(hora, {hora, locais:new Set(), pecas:0, itens:0});
    const gh = porHora.get(hora);
    gh.locais.add(c.local); gh.pecas += (c.qtFis||0); gh.itens++;
    if(!horasPorUsuario.has(c.usuario)) horasPorUsuario.set(c.usuario, new Set());
    horasPorUsuario.get(c.usuario).add(hora);
    if(!matrizLocais.has(c.usuario)) matrizLocais.set(c.usuario, new Map());
    const mu = matrizLocais.get(c.usuario);
    if(!mu.has(hora)) mu.set(hora, new Set());
    mu.get(hora).add(c.local);
  }
  const ranking = Array.from(porUsuario.values()).map(g=>({
    usuario:g.usuario, locais:g.locais.size, itens:g.itens, contagens:g.contagens,
    tempoMedioMin: g.nMin>0 ? g.minutos/g.nMin : 0, horasAtivas: g.horas.size
  })).sort((a,b)=>b.locais-a.locais);
  const horaAHora = Array.from(porHora.values()).map(g=>({hora:g.hora, locais:g.locais.size, pecas:g.pecas, itens:g.itens})).sort((a,b)=>a.hora.localeCompare(b.hora));
  const horasOrdenadas = horaAHora.map(h=>h.hora);
  const matrizColaboradorHora = ranking.map(r=>({
    usuario: r.usuario,
    porHora: horasOrdenadas.map(h=>{
      const set = matrizLocais.get(r.usuario).get(h);
      return set ? set.size : 0;
    }),
    total: r.locais
  }));
  let horasHomem = 0;
  for(const set of horasPorUsuario.values()) horasHomem += set.size;
  const totalItens = contagens.length;
  const totalPecas = contagens.reduce((s,c)=>s+(c.qtFis||0),0);
  const totalLocais = new Set(contagens.map(c=>c.local)).size;
  return {
    ranking, horaAHora, horasOrdenadas, matrizColaboradorHora, horasHomem,
    itensPorHomemHora: horasHomem>0 ? totalItens/horasHomem : 0,
    pecasPorHomemHora: horasHomem>0 ? totalPecas/horasHomem : 0,
    totalItens, totalPecas, totalLocais
  };
}
function irRenderProdMatriz(p){
  if(!p.horasOrdenadas.length) return '<p class="field-hint">Nenhuma contagem no período selecionado.</p>';
  const horaLabel = h => new Date(h+':00:00').toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit'})+'h';
  const totalPorHora = p.horasOrdenadas.map((h,i)=>p.matrizColaboradorHora.reduce((s,r)=>s+r.porHora[i],0));
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Colaborador</th>
      ${p.horasOrdenadas.map(h=>`<th class="mono">${horaLabel(h)}</th>`).join('')}
      <th>Total</th>
    </tr></thead>
    <tbody>
      ${p.matrizColaboradorHora.map(r=>`<tr>
        <td>${irEsc(r.usuario)}</td>
        ${r.porHora.map(v=>`<td class="mono">${v>0?irFmtInt(v):'—'}</td>`).join('')}
        <td class="mono" style="font-weight:700;">${irFmtInt(r.total)}</td>
      </tr>`).join('')}
      <tr>
        <td style="font-weight:700;">Total</td>
        ${totalPorHora.map(v=>`<td class="mono" style="font-weight:700;">${irFmtInt(v)}</td>`).join('')}
        <td class="mono" style="font-weight:700;">${irFmtInt(p.totalLocais)}</td>
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
      <p class="panel-sub">Cada célula é o número de locais distintos que o colaborador contou naquele bloco de hora.</p>
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
      const hay = (d.item+' '+d.ean+' '+d.descricao+' '+d.local).toLowerCase();
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
      <input type="text" placeholder="Buscar por item, EAN, descrição ou local..." value="${irEsc(IR.divFilters.search)}" oninput="irDivSetSearch(this.value)">
      <select onchange="irDivSetFilter('local', this.value)">
        <option value="">Todos os locais</option>${locais.map(l=>`<option value="${irEsc(l)}" ${IR.divFilters.local===l?'selected':''}>${irEsc(l)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary" onclick="irExportDivergenciasCsv()">Exportar CSV</button>
    </div>
    <p class="field-hint" id="ir-div-count" style="margin-bottom:8px;">${irFmtInt(irDivergenciasFiltered().length)} itens divergentes</p>
    <div class="table-wrap">
      <div class="table-scroll" id="ir-div-scroll" style="height:calc(100vh - 300px);">
        <table><thead><tr><th>Item</th><th>EAN</th><th>Descrição</th><th>Local</th><th>Qtde Lógica</th><th>Qtde Física</th><th>Diferença</th><th>Valor</th></tr></thead>
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
  if(!rows.length){ winEl.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--ink-soft);padding:20px;">Nenhum item encontrado.</td></tr>`; return; }
  const viewH = el.clientHeight||400, scrollTop = el.scrollTop, buffer=8;
  const start = Math.max(0, Math.floor(scrollTop/IR_DIV_ROW_H)-buffer);
  const end = Math.min(rows.length, start+Math.ceil(viewH/IR_DIV_ROW_H)+buffer*2);
  const top=start*IR_DIV_ROW_H, bottom=(rows.length-end)*IR_DIV_ROW_H;
  winEl.innerHTML = `<tr style="height:${top}px;"><td colspan="8" style="padding:0;border:none;"></td></tr>`
    + rows.slice(start,end).map(d=>`<tr style="height:${IR_DIV_ROW_H}px;">
        <td class="mono">${irEsc(d.item)}</td><td>${irEsc(d.ean)}</td><td>${irEsc(d.descricao)}</td><td>${irEsc(d.local)}</td>
        <td class="mono">${irFmtInt(d.qtdeLogica)}</td><td class="mono">${irFmtInt(d.qtdeFisica)}</td>
        <td class="mono ${d.diferenca>=0?'pos':'neg'}">${d.diferenca>0?'+':''}${irFmtInt(d.diferenca)}</td>
        <td class="mono ${d.vlDivergencia>=0?'pos':'neg'}">${irFmtMoney(d.vlDivergencia)}</td>
      </tr>`).join('')
    + `<tr style="height:${bottom}px;"><td colspan="8" style="padding:0;border:none;"></td></tr>`;
}
function irExportDivergenciasCsv(){
  const rows = irDivergenciasFiltered();
  if(!rows.length){ irShowToast('Nada para exportar.', true); return; }
  const cols = ['item','ean','descricao','local','qtdeLogica','qtdeFisica','diferenca','vlLogico','vlFisico','vlDivergencia','usuario','dataFim'];
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
        <td class="mono">${irEsc(d.item)}</td><td>${irEsc(d.descricao)}</td><td>${irEsc(d.local)}</td>
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
      <td class="mono">${c.numero}</td>
      <td><span class="tag ${c.status==='aberto'?'tag-orange':'tag-good'}">${c.status==='aberto'?'Aberto':'Encerrado'}</span></td>
      <td>${irFmtDate(c.dataAbertura)}</td><td>${irFmtDate(c.dataPrevistaTermino)}</td><td>${irFmtDate(c.dataEncerramento)}</td>
      <td><button class="btn-link" onclick="irSelecionarCiclo('${c.id}')">Ver indicadores</button></td>
    </tr>`).join('')}</tbody></table></div>
  </div>`;
}
async function irSelecionarCiclo(cicloId){
  IR.cicloAtivo = IR.ciclos.find(c=>c.id===cicloId);
  await irLoadCicloData(cicloId);
  irSwitchTab('dashboard');
}

/* ============================================================
   COMPARATIVO ENTRE CICLOS
   ============================================================ */
function irRenderComparativo(){
  if(IR.ciclos.length<2) return irEmptyState('Precisa de ao menos 2 ciclos', 'Processe outro ciclo para poder comparar.', "irSwitchTab('importacao')", 'Ir para Importação');
  const opts = IR.ciclos.map(c=>`<option value="${c.id}">Ciclo ${c.numero}</option>`).join('');
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
  el.innerHTML = `<div class="panel"><h3>Ciclo ${ciA.numero} vs. Ciclo ${ciB.numero}</h3>
    <div class="table-wrap"><table><thead><tr><th>Indicador</th><th>Ciclo ${ciA.numero}</th><th>Ciclo ${ciB.numero}</th><th>Tendência</th></tr></thead>
    <tbody>${linhas.map(([label,a,b,delta])=>`<tr><td>${label}</td><td class="mono">${a}</td><td class="mono">${b}</td>
      <td><span class="tag ${delta>0?'tag-good':(delta<0?'tag-bad':'tag-muted')}">${delta>0?'▲ melhora':(delta<0?'▼ piora':'= igual')}</span></td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
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
  return `<div class="panel">
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
