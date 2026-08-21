/* ============================================================
   Gestão de Transitórios — UI principal
   App independente (SheetJS + IndexedDB), 100% client-side.

   O dado é uma MATRIZ transitório x faixa de aging (Valor e Peças),
   no mesmo formato da planilha de origem. A leitura do módulo é
   sempre a mesma: não interessa o saldo, interessa quanto do saldo
   envelheceu — e em qual transitório.
   ============================================================ */
const TR = {
  currentTab:'dashboard',
  matriz:[], historico:[], base:null,
  demo:false, hoje:new Date().toISOString(),
  matrizMetrica:'valor',   // 'valor' | 'pecas'
  matrizOrdem:'velho',     // 'velho' | 'total' | 'cod'
  busca:'',
  importFile:null, importando:false
};

/* A busca do topo filtra a matriz e a lista por código ou descrição. O campo
   fica na topbar, fora do #viewRoot, então re-renderizar a view não tira o
   foco de quem está digitando. */
function trOnBusca(v){
  TR.busca = String(v||'').trim().toLowerCase();
  if(TR.currentTab==='aging' || TR.currentTab==='lista') trRenderView();
}
function trMatrizFiltrada(){
  if(!TR.busca) return TR.matriz;
  return TR.matriz.filter(c=>
    (c.transitorio+' '+trNomeTransitorio(c.transitorio)+' '+trFamiliaTransitorio(c.transitorio))
      .toLowerCase().includes(TR.busca));
}

function trEsc(v){ if(v===undefined||v===null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function trFmtInt(n){ return Math.round(n||0).toLocaleString('pt-BR'); }
function trFmtNum(n, dec){ return (n||0).toLocaleString('pt-BR', {minimumFractionDigits:dec||0, maximumFractionDigits:dec===undefined?2:dec}); }
function trFmtMoney(n){ return (n||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
/* Valores grandes em KPI e célula de matriz: "R$ 167,4 mil" lê melhor que
   "R$ 167.395,98" e não estoura a largura da coluna. */
function trFmtMoneyCurto(n){
  n = n||0;
  if(Math.abs(n) >= 1e6) return 'R$ '+trFmtNum(n/1e6, 1)+' mi';
  if(Math.abs(n) >= 1e3) return 'R$ '+trFmtNum(n/1e3, 1)+' mil';
  return 'R$ '+trFmtNum(n, 0);
}
function trFmtPct(n, dec){ return ((n||0)*100).toLocaleString('pt-BR', {minimumFractionDigits:dec===undefined?1:dec, maximumFractionDigits:dec===undefined?1:dec})+'%'; }
function trFmtDate(s){ if(!s) return '—'; const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR'); }
function trShowToast(msg, isError){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast'+(isError?' error':'');
  clearTimeout(window.__trToastTimer);
  window.__trToastTimer = setTimeout(()=>{ t.className='toast hidden'; }, 3200);
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

  const corteSalvo = localStorage.getItem('tr-corte');
  if(corteSalvo) trSetCorte(corteSalvo);

  try{
    const salva = await trGetConfig('matriz');
    if(salva && salva.matriz && salva.matriz.length){
      TR.matriz = salva.matriz;
      TR.base = {referencia: salva.referencia, arquivo: salva.arquivo};
    }
  }catch(e){ console.warn('Não foi possível ler a base salva', e); }

  // Sem base importada, o app sobe em modo demo pra que o desenho possa ser
  // avaliado. A primeira importação real desliga isso.
  if(!TR.matriz.length && typeof trGerarMatrizDemo === 'function'){
    TR.demo = true;
    TR.matriz = trGerarMatrizDemo();
    TR.base = {referencia: TR.hoje, arquivo:'(base demo)'};
  }
  trAtualizarHistorico();
  trSwitchTab('dashboard');
}
function trAtualizarHistorico(){
  const k = trKpis(TR.matriz);
  TR.historico = (typeof trGerarHistoricoDemo === 'function')
    ? trGerarHistoricoDemo(TR.hoje, k.valor, k.pctVelho) : [];
}

const TR_MOBILE_QUERY = '(max-width:640px)'; // precisa bater com o breakpoint do CSS (theme.css)
// No mobile o menu é um overlay (aberto/fechado); no desktop é o modo compacto de 56px.
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
  trRenderView();
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
  dashboard:['Dashboard Executivo','Onde está o dinheiro parado e há quanto tempo.'],
  aging:['Matriz de Aging','Transitório x faixa de envelhecimento, em valor e peças.'],
  lista:['Transitórios','Resumo por transitório, com envelhecimento e concentração.'],
  lancamento:['Lançamento manual','Cadastro e tratativa de transitórios direto no app.'],
  importacao:['Importação','Importe a planilha da matriz de transitórios.'],
  exportacao:['Exportação','Exporte a matriz em Excel ou gere o boletim.'],
  configuracoes:['Configurações','Corte de envelhecimento, nomes dos transitórios e aparência.']
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
  if(!TR.matriz.length){ badge.textContent = 'Nenhuma base carregada'; return; }
  const k = trKpis(TR.matriz);
  badge.textContent = (TR.demo ? 'Base demo' : 'Base de '+trFmtDate(TR.base && TR.base.referencia))
    + ' — ' + trFmtInt(k.transitorios) + ' transitórios';
}

const TR_RENDERERS = {};
function trRenderView(){
  const root = document.getElementById('viewRoot');
  const render = TR_RENDERERS[TR.currentTab];
  const [title] = TR_TAB_LABELS[TR.currentTab] || [TR.currentTab];
  root.innerHTML = render ? render()
    : trEmptyState(`${title} em construção`, 'Esta tela ainda não foi implementada neste módulo.');
}

function trBlocoDemo(){
  if(!TR.demo) return '';
  return `<div class="panel" style="border-left:3px solid var(--orange); display:flex; align-items:center; gap:12px;">
    <div style="font-size:22px;">🧪</div>
    <div style="flex:1">
      <div style="font-weight:800; font-size:13px;">Modo demonstração — dados fictícios</div>
      <div class="field-hint">Mesmo formato da planilha real (transitório × faixa), com números inventados. Importe a sua planilha para ver os números de verdade.</div>
    </div>
    <button class="btn btn-primary" onclick="trSwitchTab('importacao')">Importar planilha</button>
  </div>`;
}

/* ============================================================
   MATRIZ DE AGING — a tela central
   Mesma leitura da planilha (transitório na linha, faixa na coluna),
   com o que a planilha não dá: heatmap, ordenação por criticidade,
   totais nos dois eixos e a linha de corte do envelhecimento.
   ============================================================ */
function trCorCelula(faixa, intensidade){
  // Intensidade relativa ao maior valor da matriz, com piso pra célula pequena
  // não sumir e raiz pra não achatar tudo (distribuição é muito desigual).
  const a = 0.10 + 0.75*Math.sqrt(Math.max(0, Math.min(1, intensidade)));
  const hex = faixa.cor.replace('#','');
  const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
function trSetMatrizMetrica(m){ TR.matrizMetrica = m; trRenderView(); }
function trSetMatrizOrdem(o){ TR.matrizOrdem = o; trRenderView(); }
function trSetCorteUI(key){
  trSetCorte(key);
  localStorage.setItem('tr-corte', key);
  trAtualizarHistorico();
  trRenderView();
}

function trRenderMatriz(){
  const metrica = TR.matrizMetrica, ehValor = metrica==='valor';
  const base = trMatrizFiltrada();
  let linhas = trLinhas(base);
  if(TR.matrizOrdem==='velho')      linhas.sort((a,b)=> (ehValor? b.valorVelho-a.valorVelho : b.pecasVelhas-a.pecasVelhas));
  else if(TR.matrizOrdem==='total') linhas.sort((a,b)=> (ehValor? b.valor-a.valor : b.pecas-a.pecas));
  else                              linhas.sort((a,b)=> a.cod.localeCompare(b.cod));

  const totaisFaixa = trTotaisPorFaixa(base);
  const maxCel = Math.max(...base.map(c=> ehValor ? c.valor : c.pecas), 1);
  const corte = trCorteIdx();
  const fmt = (n)=> ehValor ? trFmtMoneyCurto(n) : trFmtInt(n);
  const totalGeral = linhas.reduce((s,l)=> s + (ehValor? l.valor : l.pecas), 0);

  const cabecalho = TR_FAIXAS.map((f,i)=>
    `<th class="${i===corte?'tr-corte':''}" style="text-align:right">${trEsc(f.curto)}</th>`).join('');

  const corpo = linhas.map(l=>{
    const celulas = TR_FAIXAS.map((f,i)=>{
      const cel = l.celulas[f.key];
      const v = cel ? (ehValor ? cel.valor : cel.pecas) : 0;
      const sub = cel ? (ehValor ? trFmtInt(cel.pecas)+' pç' : trFmtMoneyCurto(cel.valor)) : '';
      if(!v) return `<td class="cel vazia ${i===corte?'tr-corte':''}">–</td>`;
      return `<td class="cel ${i===corte?'tr-corte':''}" style="background:${trCorCelula(f, v/maxCel)}">
        ${fmt(v)}<span class="cel-sub">${sub}</span></td>`;
    }).join('');
    const tot = ehValor ? l.valor : l.pecas;
    const pct = ehValor ? l.pctVelho : (l.pecas ? l.pecasVelhas/l.pecas : 0);
    return `<tr>
      <td class="tr-cod"><div class="tr-cod-cod">${trEsc(l.cod)}</div><div class="tr-cod-nome">${trEsc(l.nome)}</div></td>
      ${celulas}
      <td class="cel tr-total">${fmt(tot)}</td>
      <td class="cel tr-total">
        <div class="tr-pct-bar">
          <div class="tr-pct-track"><div class="tr-pct-fill" style="width:${(pct*100).toFixed(0)}%; background:${pct>=.5?'#A8200D':(pct>=.2?'#D9531E':'#1F8A52')}"></div></div>
          <span>${trFmtPct(pct,0)}</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  const rodape = TR_FAIXAS.map((f,i)=>{
    const t = totaisFaixa[i];
    const v = ehValor ? t.valor : t.pecas;
    return `<td class="cel ${i===corte?'tr-corte':''}">${v?fmt(v):'–'}
      <span class="cel-sub">${totalGeral? trFmtPct(v/totalGeral,0) : '—'}</span></td>`;
  }).join('');

  return `<div class="panel">
    <h3>Matriz de Aging</h3>
    <p class="panel-sub">Transitório × faixa de envelhecimento. A linha vertical marca o corte:
      tudo à direita dela está parado além de <strong>${trEsc(TR_FAIXA_MAP[TR_CORTE].label)}</strong>.</p>

    <div class="filter-bar">
      <span class="field-hint">Mostrar</span>
      <button class="chip ${ehValor?'active':''}" onclick="trSetMatrizMetrica('valor')">Valor (R$)</button>
      <button class="chip ${!ehValor?'active':''}" onclick="trSetMatrizMetrica('pecas')">Peças</button>
      <span class="field-hint" style="margin-left:10px">Ordenar por</span>
      <button class="chip ${TR.matrizOrdem==='velho'?'active':''}" onclick="trSetMatrizOrdem('velho')">Mais envelhecido</button>
      <button class="chip ${TR.matrizOrdem==='total'?'active':''}" onclick="trSetMatrizOrdem('total')">Maior total</button>
      <button class="chip ${TR.matrizOrdem==='cod'?'active':''}" onclick="trSetMatrizOrdem('cod')">Código</button>
      <span class="field-hint" style="margin-left:10px">Corte</span>
      <select onchange="trSetCorteUI(this.value)" style="width:auto">
        ${TR_FAIXAS.slice(1).map(f=>`<option value="${f.key}" ${TR_CORTE===f.key?'selected':''}>${trEsc(f.label)}</option>`).join('')}
      </select>
    </div>

    <div class="tr-matriz-wrap">
      <table class="tr-matriz">
        <thead><tr><th>Transitório</th>${cabecalho}<th style="text-align:right">Total</th><th style="text-align:right">% velho</th></tr></thead>
        <tbody>${corpo}</tbody>
        <tfoot><tr><td class="tr-cod">TOTAL</td>${rodape}<td class="cel">${fmt(totalGeral)}</td><td class="cel"></td></tr></tfoot>
      </table>
    </div>

    <div class="tr-legenda">
      <span>Intensidade da cor = tamanho da célula.</span>
      ${TR_FAIXAS.map(f=>`<span><i style="background:${f.cor}"></i>${trEsc(f.curto)}</span>`).join('')}
    </div>
  </div>`;
}
TR_RENDERERS.aging = function(){
  if(!TR.matriz.length) return trEmptyState('Nenhuma base carregada', 'Importe a planilha da matriz de transitórios.', "trSwitchTab('importacao')", 'Ir para Importação');
  return trBlocoDemo() + trRenderMatriz();
};

/* ============================================================
   DASHBOARD EXECUTIVO
   De cima pra baixo: quanto está parado -> quanto envelheceu ->
   estou piorando -> onde está concentrado -> o que fazer hoje.
   ============================================================ */
function trRenderKpiBlocks(k){
  const corteLabel = TR_FAIXA_MAP[TR_CORTE].label;
  return `<div class="kpi-blocks">
    <div class="kpi-block theme-orange">
      <div class="kpi-block-header"><span class="bh-icon">📦</span>Parado agora</div>
      <div class="kpi-block-body">
        <div class="kpi-tile"><div class="kt-icon">💰</div><div class="num">${trFmtMoneyCurto(k.valor)}</div><div class="label">Valor em transitório</div><div class="meta-hint">todas as faixas</div></div>
        <div class="kpi-tile"><div class="kt-icon">🔩</div><div class="num">${trFmtInt(k.pecas)}</div><div class="label">Peças</div><div class="meta-hint">${trFmtInt(k.transitorios)} transitórios ativos</div></div>
        <div class="kpi-tile"><div class="kt-icon">⏱️</div><div class="num">${trFmtNum(k.idadeEstimada,1)}</div><div class="label">Idade méd. (dias)</div><div class="meta-hint">estimada pela faixa</div></div>
      </div>
    </div>
    <div class="kpi-block theme-black">
      <div class="kpi-block-header"><span class="bh-icon">🚨</span>Envelhecido — além de ${trEsc(corteLabel)}</div>
      <div class="kpi-block-body">
        <div class="kpi-tile"><div class="kt-icon">💸</div><div class="num bad">${trFmtMoneyCurto(k.valorVelho)}</div><div class="label">Valor parado</div><div class="meta-hint">alvo da tratativa</div></div>
        <div class="kpi-tile"><div class="kt-icon">📊</div><div class="num ${k.pctVelho>=.3?'bad':''}">${trFmtPct(k.pctVelho,1)}</div><div class="label">Do valor total</div><div class="meta-hint">quanto virou depósito</div></div>
        <div class="kpi-tile"><div class="kt-icon">🔩</div><div class="num bad">${trFmtInt(k.pecasVelhas)}</div><div class="label">Peças paradas</div><div class="meta-hint">em ${trFmtInt(k.transitoriosComVelho)} transitórios</div></div>
      </div>
    </div>
    <div class="kpi-block theme-blue">
      <div class="kpi-block-header"><span class="bh-icon">🎯</span>Concentração</div>
      <div class="kpi-block-body">
        <div class="kpi-tile"><div class="kt-icon">🥇</div><div class="num" style="font-size:15px">${trEsc(k.pior?k.pior.cod:'—')}</div><div class="label">Maior ofensor</div><div class="meta-hint">${trEsc(k.pior?k.pior.nome:'')}</div></div>
        <div class="kpi-tile"><div class="kt-icon">💰</div><div class="num bad">${trFmtMoneyCurto(k.pior?k.pior.valorVelho:0)}</div><div class="label">Parado nele</div><div class="meta-hint">${k.valorVelho? trFmtPct((k.pior?k.pior.valorVelho:0)/k.valorVelho,0):'—'} do envelhecido</div></div>
        <div class="kpi-tile"><div class="kt-icon">📉</div><div class="num">${trFmtPct(k.pior?k.pior.pctVelho:0,0)}</div><div class="label">Dele que é velho</div><div class="meta-hint">saúde do transitório</div></div>
      </div>
    </div>
  </div>`;
}

/* A foto do dia não distingue pico normal de degradação. A barra é o valor
   total; a parte escura, o pedaço já envelhecido. */
function trRenderEvolucao(){
  const h = TR.historico;
  if(!h.length) return '';
  const max = Math.max(...h.map(p=>p.valor)) || 1;
  const prim = h[0], ult = h[h.length-1];
  const dValor = prim.valor ? (ult.valor-prim.valor)/prim.valor : 0;
  const dPct = ult.pctVelho - prim.pctVelho;
  return `<div class="panel">
    <h3>Evolução — 8 semanas</h3>
    <p class="panel-sub">Estou piorando ou melhorando? Barra = valor em transitório; a parte escura é o que já passou do corte.</p>
    <div class="bi-vbars">
      ${h.map(p=>`<div class="bi-vbar-col">
        <div class="bi-vbar-val">${trFmtMoneyCurto(p.valor)}</div>
        <div class="bi-vbar" style="height:${Math.max(4,(p.valor/max)*100)}%; position:relative;">
          <div style="position:absolute; left:0; right:0; bottom:0; height:${(p.pctVelho*100).toFixed(0)}%; background:#A8200D; border-radius:0 0 4px 4px;"></div>
        </div>
        <div class="bi-vbar-label">${trEsc(p.semana)}</div>
        <div class="bi-vbar-sub">${trFmtPct(p.pctVelho,0)}</div>
      </div>`).join('')}
    </div>
    <div style="display:flex; gap:18px; margin-top:14px; padding-top:12px; border-top:1px solid var(--line);">
      <div><span class="field-hint">Valor em transitório</span><br>
        <strong class="${dValor>0?'neg':'pos'}">${dValor>0?'+':''}${trFmtPct(dValor,1)}</strong></div>
      <div><span class="field-hint">% envelhecido</span><br>
        <strong class="${dPct>0?'neg':'pos'}">${dPct>0?'+':''}${trFmtPct(dPct,1)}</strong></div>
    </div>
  </div>`;
}

function trRenderAgingBarras(){
  const totais = trTotaisPorFaixa(TR.matriz);
  const max = Math.max(...totais.map(t=>t.valor)) || 1;
  const total = totais.reduce((s,t)=>s+t.valor,0) || 1;
  const corte = trCorteIdx();
  const velho = totais.slice(corte).reduce((s,t)=>s+t.valor,0);
  return `<div class="panel">
    <h3>Distribuição por faixa</h3>
    <p class="panel-sub">Onde o valor está concentrado. Barra = R$; a contagem de peças vem abaixo.</p>
    ${totais.map((t,i)=>`<div class="bi-hbar-row bi-hbar-row-money">
      <div class="bi-hbar-label">${trEsc(t.faixa.label)}${i===corte?' ◀':''}</div>
      <div class="bi-hbar-track"><div class="bi-hbar-fill" style="width:${(t.valor/max)*100}%; background:${t.faixa.cor};"></div></div>
      <div class="bi-hbar-val">${t.valor?trFmtMoneyCurto(t.valor):'–'}</div>
    </div>
    <div class="field-hint" style="margin:-2px 0 6px 128px;">${trFmtInt(t.pecas)} peças · ${trFmtPct(t.valor/total,0)} do valor</div>`).join('')}
    <div style="margin-top:10px; padding-top:12px; border-top:1px solid var(--line);">
      <span class="field-hint">Além de ${trEsc(TR_FAIXA_MAP[TR_CORTE].label)}</span><br>
      <strong class="neg">${trFmtMoneyCurto(velho)}</strong>
      <span class="field-hint">— ${trFmtPct(velho/total,0)} do valor em transitório</span>
    </div>
  </div>`;
}

function trRenderRanking(){
  const linhas = trLinhas(TR.matriz).filter(l=>l.valorVelho>0).sort((a,b)=>b.valorVelho-a.valorVelho).slice(0,12);
  const max = Math.max(...linhas.map(l=>l.valorVelho), 1);
  return `<div class="panel">
    <h3>Ofensores — valor envelhecido por transitório</h3>
    <p class="panel-sub">Quem está segurando o dinheiro além de ${trEsc(TR_FAIXA_MAP[TR_CORTE].label)}.</p>
    ${linhas.map(l=>`<div class="bi-hbar-row bi-hbar-row-money">
      <div class="bi-hbar-label" title="${trEsc(l.nome)}">${trEsc(l.cod)}</div>
      <div class="bi-hbar-track"><div class="bi-hbar-fill" style="width:${(l.valorVelho/max)*100}%; background:${l.pctVelho>=.5?'#A8200D':'#D9531E'};"></div></div>
      <div class="bi-hbar-val">${trFmtMoneyCurto(l.valorVelho)}</div>
    </div>
    <div class="field-hint" style="margin:-2px 0 6px 128px;">${trEsc(l.nome)} · ${trFmtInt(l.pecasVelhas)} peças · ${trFmtPct(l.pctVelho,0)} do transitório</div>`).join('')}
  </div>`;
}

/* Fila de tratativa: a menor unidade acionável que a planilha permite é a
   célula transitório × faixa. Ordenada por valor × idade, não por "o mais
   caro" nem "o mais velho". */
function trRenderFila(){
  const corte = trCorteIdx();
  const candidatas = TR.matriz.filter(c=>TR_FAIXA_KEYS.indexOf(c.faixa) >= corte && c.valor > 0);
  const maxPeso = Math.max(...candidatas.map(trPesoCelula), 1);
  const fila = candidatas
    .map(c=>({...c, p:trPrioridadeCelula(c, maxPeso)}))
    .sort((a,b)=>b.p-a.p).slice(0,12);
  const soma = fila.reduce((s,c)=>s+c.valor, 0);
  const totalVelho = trKpis(TR.matriz).valorVelho || 1;
  if(!fila.length) return `<div class="panel"><h3>Fila de tratativa</h3>
    <p class="panel-sub">Nada além do corte de ${trEsc(TR_FAIXA_MAP[TR_CORTE].label)}. Transitório limpo.</p></div>`;
  return `<div class="panel">
    <h3>Fila de tratativa — o que resolver primeiro</h3>
    <p class="panel-sub">Priorizado por valor parado × idade. Estas ${fila.length} células concentram
      ${trFmtMoneyCurto(soma)} — ${trFmtPct(soma/totalVelho,0)} de todo o valor envelhecido.</p>
    <div class="table-wrap">
      <table class="table-wide">
        <thead><tr><th>Prio.</th><th>Transitório</th><th>Descrição</th><th>Faixa</th><th>Valor</th><th>Peças</th><th>R$/peça</th></tr></thead>
        <tbody>
          ${fila.map(c=>{
            const f = TR_FAIXA_MAP[c.faixa];
            return `<tr>
              <td><span class="priority-badge" style="background:${trCorPrioridade(c.p)}">${c.p}</span></td>
              <td class="mono">${trEsc(c.transitorio)}</td>
              <td>${trEsc(trNomeTransitorio(c.transitorio))}</td>
              <td><span class="tag" style="background:${f.cor}22; color:${f.cor}">${trEsc(f.label)}</span></td>
              <td class="mono">${trFmtMoney(c.valor)}</td>
              <td class="mono">${trFmtInt(c.pecas)}</td>
              <td class="mono">${trFmtMoney(c.pecas ? c.valor/c.pecas : 0)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

TR_RENDERERS.dashboard = function(){
  if(!TR.matriz.length){
    return trEmptyState('Nenhuma base carregada', 'Importe a planilha da matriz de transitórios para ver os indicadores.', "trSwitchTab('importacao')", 'Ir para Importação');
  }
  const k = trKpis(TR.matriz);
  return trBlocoDemo()
    + trRenderKpiBlocks(k)
    + `<div class="bi-grid-2">${trRenderEvolucao()}${trRenderAgingBarras()}</div>`
    + `<div class="bi-grid-2">${trRenderRanking()}${trRenderAgingResumoTipo()}</div>`
    + trRenderFila();
};

/* Resumo por família (AVA, CAN, DEV, REC...) — o prefixo do código já é uma
   classificação natural e agrupa o ruído de 20+ linhas em poucos blocos. */
function trRenderAgingResumoTipo(){
  const linhas = trLinhas(TR.matriz);
  const mapa = {};
  linhas.forEach(l=>{
    const f = mapa[l.familia] || (mapa[l.familia] = {familia:l.familia, valor:0, valorVelho:0, pecas:0, n:0});
    f.valor += l.valor; f.valorVelho += l.valorVelho; f.pecas += l.pecas; f.n++;
  });
  const fam = Object.values(mapa).sort((a,b)=>b.valorVelho-a.valorVelho);
  return `<div class="panel">
    <h3>Por família de transitório</h3>
    <p class="panel-sub">Agrupado pelo prefixo do código — onde a operação precisa atacar.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Família</th><th>Cód.</th><th>Valor</th><th>Envelhecido</th><th>%</th></tr></thead>
        <tbody>
          ${fam.map(f=>{
            const pct = f.valor ? f.valorVelho/f.valor : 0;
            return `<tr>
              <td>${trEsc(f.familia)}</td>
              <td class="mono">${trFmtInt(f.n)}</td>
              <td class="mono">${trFmtMoneyCurto(f.valor)}</td>
              <td class="mono">${f.valorVelho?trFmtMoneyCurto(f.valorVelho):'–'}</td>
              <td><span class="tag ${pct>=.5?'tag-bad':(pct>=.2?'tag-orange':'tag-good')}">${trFmtPct(pct,0)}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ============================================================
   LISTA — resumo por transitório
   ============================================================ */
TR_RENDERERS.lista = function(){
  if(!TR.matriz.length) return trEmptyState('Nenhuma base carregada', 'Importe a planilha da matriz de transitórios.', "trSwitchTab('importacao')", 'Ir para Importação');
  const linhas = trLinhas(trMatrizFiltrada()).sort((a,b)=>b.valorVelho-a.valorVelho);
  return trBlocoDemo() + `<div class="panel">
    <h3>Transitórios</h3>
    <p class="panel-sub">Um por linha, do mais crítico para o mais limpo.</p>
    <div class="table-wrap">
      <table class="table-wide">
        <thead><tr><th>Código</th><th>Descrição</th><th>Família</th><th>Valor</th><th>Peças</th><th>Idade méd.</th><th>Envelhecido</th><th>% velho</th></tr></thead>
        <tbody>
          ${linhas.map(l=>`<tr>
            <td class="mono">${trEsc(l.cod)}</td>
            <td>${trEsc(l.nome)}</td>
            <td><span class="tag tag-muted">${trEsc(l.familia)}</span></td>
            <td class="mono">${trFmtMoney(l.valor)}</td>
            <td class="mono">${trFmtInt(l.pecas)}</td>
            <td class="mono">${trFmtNum(l.idadeEstimada,1)} d</td>
            <td class="mono">${l.valorVelho?trFmtMoney(l.valorVelho):'–'}</td>
            <td><span class="tag ${l.pctVelho>=.5?'tag-bad':(l.pctVelho>=.2?'tag-orange':'tag-good')}">${trFmtPct(l.pctVelho,0)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
};

/* ============================================================
   IMPORTAÇÃO
   Lê a planilha no formato de origem: duas linhas de cabeçalho
   (faixa mesclada em cima, Valor/Peças embaixo) e uma linha por
   transitório. Nada é enviado pra fora — tudo processa no browser.
   ============================================================ */
function trNormFaixa(label){
  const s = String(label||'').toLowerCase().replace(/\s+/g,' ').trim();
  if(!s) return null;
  const h = s.match(/(\d+)\s*(hrs?|horas?|h)\b/);
  if(h) return ({'24':'24h','48':'48h','72':'72h','96':'96h','120':'120h'})[h[1]] || null;
  const sem = s.match(/(\d+)\s*semanas?/);
  if(sem){ const n = parseInt(sem[1],10); return n>=5 ? '+4sem' : (n+'sem'); }
  if(/(m[êe]s|mais de 4|acima de 4|\+ ?4)/.test(s)) return '+4sem';
  return null;
}
function trEhColunaValor(s){ return /valor|r\$/i.test(String(s||'')); }
function trEhColunaPecas(s){ return /pe[çc]as?|qtd|quant/i.test(String(s||'')); }

function trOnPickFile(input){
  const f = input.files && input.files[0];
  if(!f) return;
  TR.importFile = f;
  trRenderView();
}
function trOnDropFile(ev){
  ev.preventDefault();
  const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if(!f) return;
  TR.importFile = f;
  trRenderView();
}

function trParseMatrizAoA(aoa){
  // Acha a linha de cabeçalho: a que tem "Valor"/"Peças" repetidos.
  let hIdx = -1;
  for(let i=0; i<Math.min(aoa.length, 15); i++){
    const row = aoa[i] || [];
    if(row.filter(trEhColunaValor).length >= 2 && row.filter(trEhColunaPecas).length >= 2){ hIdx = i; break; }
  }
  if(hIdx < 0) throw new Error('Não encontrei a linha de cabeçalho com "Valor" e "Peças".');

  // Linha de cima traz a faixa, mesclada — só a primeira célula do grupo vem
  // preenchida, então propaga o último rótulo visto para a direita.
  const grupos = aoa[hIdx-1] || [];
  const colFaixa = [];
  let atual = null;
  for(let c=0; c<Math.max(grupos.length, (aoa[hIdx]||[]).length); c++){
    const g = trNormFaixa(grupos[c]);
    if(g) atual = g;
    colFaixa[c] = atual;
  }

  const mapaCol = [];
  (aoa[hIdx]||[]).forEach((cel, c)=>{
    if(!colFaixa[c]) return;
    if(trEhColunaValor(cel)) mapaCol.push({col:c, faixa:colFaixa[c], tipo:'valor'});
    else if(trEhColunaPecas(cel)) mapaCol.push({col:c, faixa:colFaixa[c], tipo:'pecas'});
  });
  if(!mapaCol.length) throw new Error('Não consegui casar as colunas Valor/Peças com as faixas de aging.');

  const acc = {};
  let linhasLidas = 0;
  for(let r=hIdx+1; r<aoa.length; r++){
    const row = aoa[r] || [];
    const cod = String(row[0]||'').trim();
    if(!cod) continue;
    if(/^total/i.test(cod)) continue; // ignora a linha de total da planilha
    linhasLidas++;
    mapaCol.forEach(m=>{
      const chave = cod+'|'+m.faixa;
      const c = acc[chave] || (acc[chave] = {transitorio:cod, faixa:m.faixa, valor:0, pecas:0});
      c[m.tipo] += trParseNum(row[m.col]);
    });
  }
  const matriz = Object.values(acc).filter(c=>c.valor>0 || c.pecas>0);
  if(!matriz.length) throw new Error('A planilha foi lida, mas todas as células vieram vazias.');
  const faixas = [...new Set(mapaCol.map(m=>m.faixa))];
  return {matriz, linhasLidas, faixas};
}

async function trProcessarImportacao(){
  if(!TR.importFile || TR.importando) return;
  if(typeof XLSX === 'undefined'){
    trShowToast('A biblioteca de leitura de planilha não carregou. Verifique a conexão e recarregue.', true);
    return;
  }
  TR.importando = true; trRenderView();
  try{
    const buf = await TR.importFile.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:''});
    const {matriz, linhasLidas, faixas} = trParseMatrizAoA(aoa);

    TR.matriz = matriz;
    TR.demo = false;
    TR.base = {referencia:new Date().toISOString(), arquivo:TR.importFile.name};
    TR.importFile = null;
    trAtualizarHistorico();
    await trSaveConfig('matriz', {matriz, referencia:TR.base.referencia, arquivo:TR.base.arquivo});
    trShowToast(`Base importada: ${linhasLidas} transitórios, ${faixas.length} faixas.`);
    TR.importando = false;
    trSwitchTab('dashboard');
    return;
  }catch(e){
    console.error(e);
    trShowToast('Falha ao ler a planilha: '+e.message, true);
  }
  TR.importando = false;
  trRenderView();
}

async function trLimparBase(){
  TR.matriz = []; TR.base = null; TR.demo = false;
  await trSaveConfig('matriz', null);
  trAtualizarHistorico();
  trShowToast('Base removida.');
  trRenderView();
}

TR_RENDERERS.importacao = function(){
  const f = TR.importFile;
  return `<div class="panel">
    <h3>Importar matriz de transitórios</h3>
    <p class="panel-sub">A planilha no formato de origem: faixas de aging no cabeçalho (24 hrs, 48 hrs, …, 4 semanas),
      cada uma com as colunas <strong>Valor</strong> e <strong>Peças</strong>, e um transitório por linha.</p>

    <div class="dropzone ${f?'has-file':''}" ondragover="event.preventDefault()" ondrop="trOnDropFile(event)">
      <div class="dz-icon">📄</div>
      <div class="dz-title">${f ? 'Arquivo selecionado' : 'Arraste a planilha aqui'}</div>
      <div class="dz-desc">.xlsx, .xlsm ou .csv — o arquivo não sai do seu computador</div>
      ${f ? `<div class="dz-file">${trEsc(f.name)}</div>` : ''}
      <label class="btn btn-secondary" style="margin-top:8px; text-transform:none; letter-spacing:0;">
        Escolher arquivo
        <input type="file" accept=".xlsx,.xlsm,.xls,.csv" onchange="trOnPickFile(this)" style="display:none">
      </label>
    </div>

    <div class="form-actions">
      ${TR.base && !TR.demo ? `<button class="btn-danger-text" onclick="trLimparBase()">Remover base atual</button>` : ''}
      <button class="btn btn-primary" onclick="trProcessarImportacao()" ${(!f||TR.importando)?'disabled style="opacity:.5"':''}>
        ${TR.importando ? 'Processando…' : 'Processar planilha'}
      </button>
    </div>
  </div>

  <div class="panel">
    <h3>Como a leitura funciona</h3>
    <p class="panel-sub">Pra você conferir se a sua planilha vai ser entendida.</p>
    <ul style="font-size:12.5px; line-height:1.9; padding-left:18px; color:var(--ink-soft);">
      <li>Procura a linha de cabeçalho que tem <strong>Valor</strong> e <strong>Peças</strong> repetidos.</li>
      <li>A linha acima traz as faixas. Célula mesclada é resolvida propagando o rótulo para a direita.</li>
      <li>Faixas reconhecidas: <span class="mono">24/48/72/96/120 hrs</span> e <span class="mono">1 a 4 semanas</span>. Qualquer coisa acima de 4 semanas ou "mês" cai em <span class="mono">+4 semanas</span>.</li>
      <li>A primeira coluna é o código do transitório. Linhas que começam com "Total" são ignoradas.</li>
      <li><span class="mono">R$ 26.271,10</span>, <span class="mono">1.699,98</span> e <span class="mono">-</span> são lidos corretamente.</li>
      <li>Códigos novos que não estejam na lista conhecida são aceitos e agrupados pelo prefixo.</li>
    </ul>
  </div>`;
};

/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */
TR_RENDERERS.configuracoes = function(){
  const atual = document.documentElement.getAttribute('data-app-theme') || 'padrao';
  return `<div class="panel">
    <h3>Corte de envelhecimento</h3>
    <p class="panel-sub">A linha que separa fluxo normal de dinheiro parado. Tudo desta faixa em diante
      conta como envelhecido em todos os indicadores do módulo.</p>
    <div class="filter-bar">
      ${TR_FAIXAS.slice(1).map(f=>`<button class="chip ${TR_CORTE===f.key?'active':''}" onclick="trSetCorteUI('${f.key}')">${trEsc(f.label)}</button>`).join('')}
    </div>
    <p class="field-hint">Subir o corte afrouxa a cobrança; descer aperta. Fica salvo neste navegador.</p>
  </div>

  <div class="panel">
    <h3>Aparência</h3>
    <p class="panel-sub">Tema visual do módulo.</p>
    <div class="theme-picker-grid">
      ${TR_APP_THEMES.map(t=>`<button class="theme-picker-card ${atual===t.key?'active':''}" onclick="trSetAppTheme('${t.key}')">
        ${atual===t.key?'<span class="theme-picker-check">✓</span>':''}
        <span class="theme-picker-swatch" style="background:${t.swatch}"></span>
        <span class="theme-picker-label">${trEsc(t.label)}</span>
      </button>`).join('')}
    </div>
  </div>`;
};
