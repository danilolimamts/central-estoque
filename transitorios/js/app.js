/* ============================================================
   Gestão de Transitórios — UI principal
   App independente (SheetJS + IndexedDB), 100% client-side.

   Telas de domínio são registradas em TR_RENDERERS. O Dashboard
   Executivo já está implementado; as demais entram na sequência.
   Enquanto não existe importação real, o app roda em MODO DEMO
   com base fictícia (js/demo.js) só pra validar o desenho.
   ============================================================ */
const TR = {
  currentTab:'dashboard',
  registros:[], historico:[], base:null,
  demo:false, hoje:new Date().toISOString(),
  estoqueTotal:0,
  filtros:{search:'', local:'', status:''}
};

function trEsc(v){ if(v===undefined||v===null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function trFmtInt(n){ return Math.round(n||0).toLocaleString('pt-BR'); }
function trFmtNum(n, dec){ return (n||0).toLocaleString('pt-BR', {minimumFractionDigits:dec||0, maximumFractionDigits:dec===undefined?2:dec}); }
function trFmtMoney(n){ return (n||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
/* Valores grandes em KPI e eixo de gráfico: "R$ 1,4 mi" lê melhor que
   "R$ 1.412.870,00" e não quebra a linha do cartão. */
function trFmtMoneyCurto(n){
  n = n||0;
  if(Math.abs(n) >= 1e6) return 'R$ '+trFmtNum(n/1e6, 1)+' mi';
  if(Math.abs(n) >= 1e3) return 'R$ '+trFmtNum(n/1e3, 0)+' mil';
  return trFmtMoney(n);
}
function trFmtPct(n, dec){ return ((n||0)*100).toLocaleString('pt-BR', {minimumFractionDigits:dec===undefined?1:dec, maximumFractionDigits:dec===undefined?1:dec})+'%'; }
function trFmtDate(s){ if(!s) return '—'; const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR'); }
function trShowToast(msg, isError){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast'+(isError?' error':'');
  clearTimeout(window.__trToastTimer);
  window.__trToastTimer = setTimeout(()=>{ t.className='toast hidden'; }, 2600);
}
function trEmptyState(title, desc, onclickFn, btnLabel){
  return `<div class="empty-state panel"><div class="eicon">📦</div><h3>${trEsc(title)}</h3><p>${trEsc(desc)}</p>
    ${onclickFn ? `<button class="btn btn-primary" onclick="${onclickFn}">${trEsc(btnLabel)}</button>` : ''}</div>`;
}

/* ============================================================
   INIT / TEMA / NAVEGAÇÃO
   ============================================================ */
async function trInit(){
  const savedTheme = localStorage.getItem('tr-theme');
  if(savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  const savedAppTheme = localStorage.getItem('tr-app-theme');
  if(savedAppTheme && savedAppTheme!=='padrao') document.documentElement.setAttribute('data-app-theme', savedAppTheme);
  trUpdateThemeLabel();
  trApplyZoom(parseInt(localStorage.getItem('tr-zoom'), 10) || 100);

  // Sem base importada, o app sobe em modo demo pra que o desenho das telas
  // possa ser avaliado. A primeira importação real desliga isso.
  if(!TR.registros.length && typeof trGerarBaseDemo === 'function'){
    TR.demo = true;
    TR.registros = trGerarBaseDemo(TR.hoje);
    TR.estoqueTotal = TR_DEMO_ESTOQUE_TOTAL;
    TR.base = {referencia: TR.hoje};
    const k = trCalcKpis();
    TR.historico = trGerarHistoricoDemo(TR.hoje, k.valorTotal, k.idadeMedia);
  }

  trSwitchTab('dashboard');
}

const TR_MOBILE_QUERY = '(max-width:640px)'; // precisa bater com o breakpoint do CSS (theme.css)
// No mobile o menu é um overlay (aberto/fechado); no desktop é o modo compacto de 56px.
// Cada um usa sua própria classe pra não haver estado intermediário entre os dois.
function trToggleSidebar(){
  const el = document.getElementById('sidebar');
  if(matchMedia(TR_MOBILE_QUERY).matches) el.classList.toggle('mobile-open');
  else el.classList.toggle('collapsed');
}
function trCloseSidebarMobile(){
  if(matchMedia(TR_MOBILE_QUERY).matches) document.getElementById('sidebar').classList.remove('mobile-open');
}
function trToggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
  const next = cur==='dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('tr-theme', next);
  trUpdateThemeLabel();
}
const TR_APP_THEMES = [
  {key:'padrao', label:'Padrão (Loja do Mecânico)', swatch:'linear-gradient(90deg,#001A72,#FA4616)'},
  {key:'aurora', label:'Aurora Glass', swatch:'linear-gradient(90deg,#4B3F9E,#12B4D6)'},
  {key:'ember', label:'Ember Flow', swatch:'linear-gradient(90deg,#241209,#FF6A00)'},
  {key:'carbon', label:'Carbon Red', swatch:'linear-gradient(90deg,#1A1A1C,#E0142C)'}
];
function trSetAppTheme(theme){
  if(theme==='padrao') document.documentElement.removeAttribute('data-app-theme');
  else document.documentElement.setAttribute('data-app-theme', theme);
  localStorage.setItem('tr-app-theme', theme);
  trRenderView();
}
function trUpdateThemeLabel(){
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
  const label = document.getElementById('themeToggleLabel');
  if(label) label.textContent = cur==='dark' ? 'Modo escuro' : 'Modo claro';
}
const TR_ZOOM_MIN = 70, TR_ZOOM_MAX = 150, TR_ZOOM_STEP = 10;
function trApplyZoom(pct){
  pct = Math.max(TR_ZOOM_MIN, Math.min(TR_ZOOM_MAX, pct));
  document.body.style.zoom = (pct/100);
  const label = document.getElementById('zoomLabel');
  if(label) label.textContent = pct+'%';
  localStorage.setItem('tr-zoom', pct);
}
function trZoomIn(){ trApplyZoom((parseInt(localStorage.getItem('tr-zoom'),10)||100) + TR_ZOOM_STEP); }
function trZoomOut(){ trApplyZoom((parseInt(localStorage.getItem('tr-zoom'),10)||100) - TR_ZOOM_STEP); }

const TR_TAB_LABELS = {
  dashboard:['Dashboard Executivo','Visão geral dos transitórios do CD.'],
  aging:['Aging','Distribuição por faixa de envelhecimento e itens mais antigos.'],
  lista:['Transitórios','Base detalhada, com filtros, busca e ordenação.'],
  lancamento:['Lançamento manual','Cadastro e tratativa de transitórios direto no app.'],
  importacao:['Importação','Importe a planilha para carregar ou atualizar a base.'],
  exportacao:['Exportação','Exporte a base filtrada em Excel ou gere o boletim.'],
  configuracoes:['Configurações','Faixas de aging, SLA e aparência do app.']
};
function trSwitchTab(tab){
  TR.currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  const [title, sub] = TR_TAB_LABELS[tab] || [tab, ''];
  document.getElementById('tabTitle').textContent = title;
  document.getElementById('tabSubtitle').textContent = sub;
  trRenderBaseBadge();
  trRenderView();
  trCloseSidebarMobile();
}
function trRenderBaseBadge(){
  const badge = document.getElementById('baseBadge');
  if(!badge) return;
  if(!TR.registros.length){ badge.textContent = 'Nenhuma base carregada'; return; }
  badge.textContent = (TR.demo ? 'Base demo' : 'Base de '+trFmtDate(TR.base && TR.base.referencia))
    + ' — ' + trFmtInt(TR.registros.length) + ' registros';
}

const TR_RENDERERS = {};

function trRenderView(){
  const root = document.getElementById('viewRoot');
  const render = TR_RENDERERS[TR.currentTab];
  const [title] = TR_TAB_LABELS[TR.currentTab] || [TR.currentTab];
  root.innerHTML = render ? render()
    : trEmptyState(`${title} em construção`, 'Esta tela ainda não foi implementada neste módulo.');
}

/* ============================================================
   DASHBOARD EXECUTIVO

   A leitura é de cima pra baixo, respondendo cinco perguntas:
   1. Estou piorando?            -> evolução das 8 semanas
   2. Quanto está sequestrado?   -> bloco "Parado agora"
   3. Há quanto tempo?           -> bloco "Tempo" + aging por faixa
   4. De quem é?                 -> tipo e responsável
   5. O que eu faço agora?       -> fila priorizada de tratativa
   ============================================================ */
function trCalcKpis(){
  const regs = TR.registros, hoje = TR.hoje;
  const idades = regs.map(r=>trIdadeDias(r, hoje));
  const fora = regs.filter(r=>trForaSla(r, hoje));
  const valorTotal = regs.reduce((s,r)=>s+r.valor, 0);
  const ruptura = regs.filter(r=>r.rupturaVenda);
  return {
    itens: regs.length,
    pecas: regs.reduce((s,r)=>s+r.qtd, 0),
    valorTotal,
    pctEstoque: TR.estoqueTotal ? valorTotal/TR.estoqueTotal : 0,
    idadeMedia: idades.length ? idades.reduce((s,d)=>s+d,0)/idades.length : 0,
    idadeP90: trPercentil(idades, 90),
    idadeMax: idades.length ? Math.max(...idades) : 0,
    foraQtd: fora.length,
    foraPct: regs.length ? fora.length/regs.length : 0,
    foraValor: fora.reduce((s,r)=>s+r.valor, 0),
    rupturaSkus: new Set(ruptura.map(r=>r.item)).size,
    rupturaValor: ruptura.reduce((s,r)=>s+r.valor, 0)
  };
}

function trBlocoDemo(){
  if(!TR.demo) return '';
  return `<div class="panel" style="border-left:3px solid var(--orange); display:flex; align-items:center; gap:12px;">
    <div style="font-size:22px;">🧪</div>
    <div>
      <div style="font-weight:800; font-size:13px;">Modo demonstração — dados fictícios</div>
      <div class="field-hint">Base gerada localmente só para validar o desenho das telas. A primeira importação real substitui tudo e desliga este modo.</div>
    </div>
  </div>`;
}

function trRenderKpiBlocks(k){
  return `<div class="kpi-blocks">
    <div class="kpi-block theme-orange">
      <div class="kpi-block-header"><span class="bh-icon">📦</span>Parado agora</div>
      <div class="kpi-block-body">
        <div class="kpi-tile"><div class="kt-icon">🔩</div><div class="num">${trFmtInt(k.pecas)}</div><div class="label">Peças paradas</div><div class="meta-hint">${trFmtInt(k.itens)} registros</div></div>
        <div class="kpi-tile"><div class="kt-icon">💰</div><div class="num">${trFmtMoneyCurto(k.valorTotal)}</div><div class="label">Valor parado</div><div class="meta-hint">custo de aquisição</div></div>
        <div class="kpi-tile"><div class="kt-icon">📊</div><div class="num">${trFmtPct(k.pctEstoque, 2)}</div><div class="label">Do estoque do CD</div><div class="meta-hint">capital sem girar</div></div>
      </div>
    </div>
    <div class="kpi-block theme-blue">
      <div class="kpi-block-header"><span class="bh-icon">⏱️</span>Tempo de permanência</div>
      <div class="kpi-block-body">
        <div class="kpi-tile"><div class="kt-icon">📈</div><div class="num">${trFmtNum(k.idadeMedia,1)}</div><div class="label">Idade média (dias)</div><div class="meta-hint">puxada pelo volume novo</div></div>
        <div class="kpi-tile"><div class="kt-icon">🎯</div><div class="num ${k.idadeP90>15?'bad':''}">${trFmtInt(k.idadeP90)}</div><div class="label">P90 (dias)</div><div class="meta-hint">a cauda que dói</div></div>
        <div class="kpi-tile"><div class="kt-icon">🕰️</div><div class="num ${k.idadeMax>30?'bad':''}">${trFmtInt(k.idadeMax)}</div><div class="label">Mais antigo (dias)</div><div class="meta-hint">não sai sozinho</div></div>
      </div>
    </div>
    <div class="kpi-block theme-black">
      <div class="kpi-block-header"><span class="bh-icon">🚨</span>Risco</div>
      <div class="kpi-block-body">
        <div class="kpi-tile"><div class="kt-icon">⚠️</div><div class="num bad">${trFmtInt(k.foraQtd)}</div><div class="label">Fora do SLA</div><div class="meta-hint">${trFmtPct(k.foraPct,0)} dos registros</div></div>
        <div class="kpi-tile"><div class="kt-icon">💸</div><div class="num bad">${trFmtMoneyCurto(k.foraValor)}</div><div class="label">Valor fora do SLA</div><div class="meta-hint">alvo da tratativa</div></div>
        <div class="kpi-tile"><div class="kt-icon">🛒</div><div class="num bad">${trFmtInt(k.rupturaSkus)}</div><div class="label">SKUs em ruptura</div><div class="meta-hint">tem no CD e falta pra venda</div></div>
      </div>
    </div>
  </div>`;
}

/* Evolução: a foto do dia não distingue pico normal de degradação crônica.
   A barra é o valor parado; a legenda embaixo, a idade média da semana. */
function trRenderEvolucao(){
  const h = TR.historico;
  if(!h.length) return '';
  const max = Math.max(...h.map(p=>p.valor)) || 1;
  const prim = h[0], ult = h[h.length-1];
  const deltaValor = prim.valor ? (ult.valor-prim.valor)/prim.valor : 0;
  const deltaIdade = ult.idadeMedia - prim.idadeMedia;
  return `<div class="panel">
    <h3>Evolução — 8 semanas</h3>
    <p class="panel-sub">Estou piorando ou melhorando? Barra = valor parado. Número abaixo = idade média da semana.</p>
    <div class="bi-vbars">
      ${h.map(p=>`<div class="bi-vbar-col">
        <div class="bi-vbar-val">${trFmtMoneyCurto(p.valor)}</div>
        <div class="bi-vbar ${p.idadeMedia>7?'orange':''}" style="height:${Math.max(4,(p.valor/max)*100)}%"></div>
        <div class="bi-vbar-label">${trEsc(p.semana)}</div>
        <div class="bi-vbar-sub">${trFmtNum(p.idadeMedia,1)} d</div>
      </div>`).join('')}
    </div>
    <div style="display:flex; gap:18px; margin-top:14px; padding-top:12px; border-top:1px solid var(--line);">
      <div><span class="field-hint">Valor parado no período</span><br>
        <strong class="${deltaValor>0?'neg':'pos'}">${deltaValor>0?'+':''}${trFmtPct(deltaValor,1)}</strong></div>
      <div><span class="field-hint">Idade média no período</span><br>
        <strong class="${deltaIdade>0?'neg':'pos'}">${deltaIdade>0?'+':''}${trFmtNum(deltaIdade,1)} dias</strong></div>
    </div>
  </div>`;
}

/* Aging: a faixa mais velha é a mais importante mesmo sendo a menor em
   volume — por isso a barra mostra valor (R$), não contagem, e a contagem
   vira legenda. É o valor que justifica a ação. */
function trRenderAging(){
  const hoje = TR.hoje;
  const dados = TR_FAIXAS.map(f=>{
    const regs = TR.registros.filter(r=>{ const d = trIdadeDias(r, hoje); return d>=f.min && d<=f.max; });
    return {faixa:f, qtd:regs.length, valor:regs.reduce((s,r)=>s+r.valor,0)};
  });
  const max = Math.max(...dados.map(d=>d.valor)) || 1;
  const velhos = dados.filter(d=>d.faixa.min>=16).reduce((s,d)=>s+d.valor, 0);
  const total = dados.reduce((s,d)=>s+d.valor, 0) || 1;
  return `<div class="panel">
    <h3>Aging por faixa</h3>
    <p class="panel-sub">Há quanto tempo está parado. Barra = valor em R$; a contagem de registros vem ao lado.</p>
    ${dados.map(d=>`<div class="bi-hbar-row bi-hbar-row-money">
      <div class="bi-hbar-label">${trEsc(d.faixa.label)}</div>
      <div class="bi-hbar-track"><div class="bi-hbar-fill" style="width:${(d.valor/max)*100}%; background:${d.faixa.cor};"></div></div>
      <div class="bi-hbar-val">${trFmtMoneyCurto(d.valor)}</div>
    </div>
    <div class="field-hint" style="margin:-2px 0 6px 128px;">${trFmtInt(d.qtd)} registros</div>`).join('')}
    <div style="margin-top:10px; padding-top:12px; border-top:1px solid var(--line);">
      <span class="field-hint">Parado há mais de 15 dias</span><br>
      <strong class="neg">${trFmtMoneyCurto(velhos)}</strong>
      <span class="field-hint">— ${trFmtPct(velhos/total,0)} do valor parado</span>
    </div>
  </div>`;
}

/* Por tipo: cada tipo tem SLA próprio, então a comparação justa não é
   "quem está mais velho" e sim "quem está mais longe do próprio prazo". */
function trRenderPorTipo(){
  const hoje = TR.hoje;
  const linhas = TR_TIPOS.map(t=>{
    const regs = TR.registros.filter(r=>r.tipo===t.key);
    const fora = regs.filter(r=>trForaSla(r, hoje));
    const idades = regs.map(r=>trIdadeDias(r, hoje));
    return {
      tipo:t, qtd:regs.length,
      valor:regs.reduce((s,r)=>s+r.valor,0),
      foraQtd:fora.length,
      foraPct: regs.length ? fora.length/regs.length : 0,
      idadeMedia: idades.length ? idades.reduce((s,d)=>s+d,0)/idades.length : 0
    };
  }).filter(l=>l.qtd>0).sort((a,b)=>b.foraPct-a.foraPct);
  return `<div class="panel">
    <h3>Por tipo de transitório</h3>
    <p class="panel-sub">Cada tipo tem prazo próprio — staging vive horas, laudo de avaria vive semanas.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Tipo</th><th>SLA</th><th>Registros</th><th>Idade méd.</th><th>Fora do SLA</th><th>Valor</th></tr></thead>
        <tbody>
          ${linhas.map(l=>`<tr>
            <td>${trEsc(l.tipo.label)}</td>
            <td class="mono">${l.tipo.slaDias} d</td>
            <td class="mono">${trFmtInt(l.qtd)}</td>
            <td class="mono">${trFmtNum(l.idadeMedia,1)} d</td>
            <td><span class="tag ${l.foraPct>=0.3?'tag-bad':(l.foraPct>0?'tag-orange':'tag-good')}">${trFmtInt(l.foraQtd)} · ${trFmtPct(l.foraPct,0)}</span></td>
            <td class="mono">${trFmtMoneyCurto(l.valor)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* Por responsável: sem dono na linha, o dash vira relatório e ninguém trata. */
function trRenderPorResponsavel(){
  const hoje = TR.hoje;
  const mapa = {};
  TR.registros.forEach(r=>{
    const m = mapa[r.responsavel] || (mapa[r.responsavel] = {valor:0, fora:0, qtd:0});
    m.qtd++; m.valor += r.valor;
    if(trForaSla(r, hoje)) m.fora++;
  });
  const linhas = Object.entries(mapa).map(([nome,m])=>({nome, ...m})).sort((a,b)=>b.valor-a.valor);
  const max = Math.max(...linhas.map(l=>l.valor)) || 1;
  return `<div class="panel">
    <h3>Por responsável</h3>
    <p class="panel-sub">Quem precisa agir. Barra = valor parado sob responsabilidade da área.</p>
    ${linhas.map(l=>`<div class="bi-hbar-row bi-hbar-row-money">
      <div class="bi-hbar-label" title="${trEsc(l.nome)}">${trEsc(l.nome)}</div>
      <div class="bi-hbar-track"><div class="bi-hbar-fill ${l.fora>0?'orange':''}" style="width:${(l.valor/max)*100}%"></div></div>
      <div class="bi-hbar-val">${trFmtMoneyCurto(l.valor)}</div>
    </div>
    <div class="field-hint" style="margin:-2px 0 6px 128px;">${trFmtInt(l.qtd)} registros · <span class="${l.fora?'neg':''}">${trFmtInt(l.fora)} fora do SLA</span></div>`).join('')}
  </div>`;
}

/* Fila de tratativa: o teste final do módulo. Não é a base inteira —
   são as linhas que resolvem mais dinheiro por unidade de esforço. */
function trRenderFila(){
  const hoje = TR.hoje;
  const maxValor = Math.max(...TR.registros.map(r=>r.valor)) || 1;
  const fila = TR.registros
    .map(r=>({...r, dias:trIdadeDias(r,hoje), razao:trRazaoSla(r,hoje), p:trPrioridade(r,maxValor,hoje)}))
    .filter(r=>r.razao>1)
    .sort((a,b)=>b.p-a.p)
    .slice(0,12);
  const valorFila = fila.reduce((s,r)=>s+r.valor, 0);
  return `<div class="panel">
    <h3>Fila de tratativa — o que resolver hoje</h3>
    <p class="panel-sub">Priorizado por valor parado × atraso relativo ao SLA do tipo. Top 12 concentra ${trFmtMoneyCurto(valorFila)}.</p>
    <div class="table-wrap">
      <table class="table-wide">
        <thead><tr><th>Prio.</th><th>Item</th><th>Descrição</th><th>Tipo</th><th>Local</th><th>Qtd</th><th>Valor</th><th>Dias</th><th>× SLA</th><th>Responsável</th></tr></thead>
        <tbody>
          ${fila.map(r=>`<tr>
            <td><span class="priority-badge" style="background:${trCorPrioridade(r.p)}">${r.p}</span></td>
            <td class="mono">${trEsc(r.item)}</td>
            <td>${trEsc(r.descricao)}</td>
            <td><span class="tag tag-muted">${trEsc(trTipoLabel(r.tipo))}</span></td>
            <td class="mono">${trEsc(r.local)}</td>
            <td class="mono">${trFmtInt(r.qtd)}</td>
            <td class="mono">${trFmtMoney(r.valor)}</td>
            <td class="mono">${trFmtInt(r.dias)}</td>
            <td class="mono neg">${trFmtNum(r.razao,1)}×</td>
            <td>${trEsc(r.responsavel)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

TR_RENDERERS.dashboard = function(){
  if(!TR.registros.length){
    return trEmptyState('Nenhuma base carregada', 'Importe a planilha de transitórios para ver os indicadores.', "trSwitchTab('importacao')", 'Ir para Importação');
  }
  const k = trCalcKpis();
  return trBlocoDemo()
    + trRenderKpiBlocks(k)
    + `<div class="bi-grid-2">${trRenderEvolucao()}${trRenderAging()}</div>`
    + `<div class="bi-grid-2">${trRenderPorTipo()}${trRenderPorResponsavel()}</div>`
    + trRenderFila();
};
