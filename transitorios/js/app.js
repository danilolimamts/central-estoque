/* ============================================================
   Gestão de Transitórios — UI principal
   App independente (SheetJS + IndexedDB), 100% client-side.

   Este arquivo tem, por enquanto, só o SHELL do módulo: tema,
   zoom, menu lateral, navegação entre abas e toast. As telas de
   domínio (dashboard, aging, lista, lançamento, importação e
   exportação) são renderizadas a partir de TR_RENDERERS — cada
   uma entra aqui junto com a regra de negócio dos transitórios.
   ============================================================ */
const TR = {
  currentTab:'dashboard',
  registros:[], base:null,
  filtros:{search:'', local:'', status:''}
};

function trEsc(v){ if(v===undefined||v===null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function trFmtInt(n){ return Math.round(n||0).toLocaleString('pt-BR'); }
function trFmtNum(n, dec){ return (n||0).toLocaleString('pt-BR', {minimumFractionDigits:dec||0, maximumFractionDigits:dec===undefined?2:dec}); }
function trFmtMoney(n){ return (n||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
function trFmtPct(n){ return ((n||0)*100).toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1})+'%'; }
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
  badge.textContent = TR.base ? `Base de ${trFmtDate(TR.base.referencia)} — ${trFmtInt(TR.registros.length)} registros`
                              : 'Nenhuma base carregada';
}

/* Cada aba de domínio registra seu renderizador aqui conforme for implementada.
   Enquanto uma aba não tem renderizador, o shell mostra o estado "em construção"
   em vez de uma tela em branco. */
const TR_RENDERERS = {};

function trRenderView(){
  const root = document.getElementById('viewRoot');
  const render = TR_RENDERERS[TR.currentTab];
  const [title] = TR_TAB_LABELS[TR.currentTab] || [TR.currentTab];
  root.innerHTML = render ? render()
    : trEmptyState(`${title} em construção`, 'Esta tela ainda não foi implementada neste módulo.');
}
