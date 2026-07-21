/* ============================================================
   Definições compartilhadas do motor de diagnóstico
   (usadas tanto pelo Web Worker quanto pela UI principal)
   ============================================================ */
const AUD_DIAG = {
  sem_localizacao:      {label:'Sem localização',       cor:'#C83812', prioridade:3},
  erro_posicao:          {label:'Erro de posição',       cor:'#FA4616', prioridade:2},
  erro_movimentacao:     {label:'Erro de movimentação',  cor:'#F8592D', prioridade:2},
  estoque_fragmentado:   {label:'Estoque fragmentado',   cor:'#FB6B45', prioridade:2},
  compensacao_parcial:   {label:'Compensação parcial',   cor:'#33488E', prioridade:1},
  compensacao_historica: {label:'Compensação histórica', cor:'#1A3180', prioridade:0},
  divergencia_real:      {label:'Divergência real',      cor:'#E13F14', prioridade:3}
};

const AUD_LEGEND_RE = /^\s*([A-Za-zÀ-ÿ]{2,4})\s*-\s*(.+)$/;

function audNormKey(s){
  if(s===undefined || s===null) return '';
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'')
    .trim();
}

function audExtractLegenda(obs){
  if(!obs || !String(obs).trim()) return {codLegenda:'', descLegenda:'', classificada:false};
  const m = AUD_LEGEND_RE.exec(String(obs).trim());
  if(!m) return {codLegenda:'', descLegenda: String(obs).trim(), classificada:false};
  return {codLegenda: m[1].toUpperCase(), descLegenda: m[2].trim(), classificada:true};
}
