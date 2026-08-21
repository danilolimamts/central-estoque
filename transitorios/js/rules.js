/* ============================================================
   Gestão de Transitórios — Regras de negócio
   Tipos de transitório, SLA por tipo, faixas de aging e o
   cálculo de prioridade da fila de tratativa.

   O princípio do módulo: transitório é FLUXO, não estoque.
   O que se mede é o TEMPO DE PERMANÊNCIA, não o saldo — por isso
   todo indicador daqui parte da idade do registro, e o SLA é por
   tipo (staging vive horas, laudo de avaria vive semanas).
   ============================================================ */

/* Cada tipo tem um prazo natural muito diferente. SLA único achataria
   tudo: ou gera alarme falso no staging, ou dá passe livre pra avaria
   apodrecer. Os valores abaixo são o padrão — ajustáveis em Configurações. */
const TR_TIPOS = [
  {key:'staging',      label:'Staging de expedição',    slaDias:1,  dono:'Expedição'},
  {key:'enderecamento',label:'Aguardando endereçamento',slaDias:1,  dono:'Endereçamento'},
  {key:'recebimento',  label:'Recebimento / conferência',slaDias:2, dono:'Recebimento'},
  {key:'devolucao',    label:'Devolução / triagem',     slaDias:5,  dono:'Logística Reversa'},
  {key:'qualidade',    label:'Bloqueio de qualidade',   slaDias:7,  dono:'Qualidade'},
  {key:'avaria',       label:'Avaria / laudo',          slaDias:15, dono:'Qualidade'}
];
const TR_TIPO_MAP = Object.fromEntries(TR_TIPOS.map(t=>[t.key, t]));
function trTipoLabel(key){ return (TR_TIPO_MAP[key]||{}).label || key; }
function trTipoSla(key){ const t = TR_TIPO_MAP[key]; return t ? t.slaDias : 3; }

/* Faixas de aging. A cor vai do verde ao vermelho de propósito: a leitura
   correta do gráfico é "a faixa mais velha é a mais importante, mesmo sendo
   a menor em volume" — item parado há 30+ dias não se resolve sozinho. */
const TR_FAIXAS = [
  {key:'0-1',  label:'0–1 dia',    min:0,  max:1,        cor:'#1F8A52'},
  {key:'2-3',  label:'2–3 dias',   min:2,  max:3,        cor:'#7FB069'},
  {key:'4-7',  label:'4–7 dias',   min:4,  max:7,        cor:'#E9B949'},
  {key:'8-15', label:'8–15 dias',  min:8,  max:15,       cor:'#E8843C'},
  {key:'16-30',label:'16–30 dias', min:16, max:30,       cor:'#D9531E'},
  {key:'30+',  label:'+30 dias',   min:31, max:Infinity, cor:'#A8200D'}
];
function trFaixa(dias){
  return TR_FAIXAS.find(f=>dias>=f.min && dias<=f.max) || TR_FAIXAS[TR_FAIXAS.length-1];
}

const TR_MS_DIA = 24*60*60*1000;
/* A idade conta da ENTRADA no transitório, nunca da data da planilha.
   Se a extração de origem não trouxer a data de entrada, o módulo precisa
   derivá-la do histórico de bases importadas (primeira base em que o
   registro apareceu) — e o aging só passa a valer a partir daí. */
function trIdadeDias(reg, hoje){
  const ref = hoje ? new Date(hoje) : new Date();
  const ent = new Date(reg.dataEntrada);
  if(isNaN(ent.getTime())) return 0;
  return Math.max(0, Math.floor((ref - ent)/TR_MS_DIA));
}
function trForaSla(reg, hoje){
  return trIdadeDias(reg, hoje) > trTipoSla(reg.tipo);
}
/* Quantas vezes o item já passou do prazo do seu tipo — permite comparar
   um staging parado há 3 dias (3x o SLA) com uma avaria parada há 20
   dias (1,3x o SLA). Sem isso, a lista de "mais antigos" seria sempre
   dominada por avaria, que legitimamente demora mais. */
function trRazaoSla(reg, hoje){
  return trIdadeDias(reg, hoje) / trTipoSla(reg.tipo);
}

/* Prioridade da fila de tratativa: valor parado x atraso relativo ao SLA.
   Não é "o mais caro" nem "o mais antigo" — é o que resolve mais dinheiro
   por unidade de esforço. Resultado de 0 a 100. */
const TR_PESOS = {valor:0.55, atraso:0.45};
function trPrioridade(reg, maxValor, hoje){
  const pValor  = maxValor > 0 ? (reg.valor / maxValor) : 0;
  const pAtraso = Math.min(1, trRazaoSla(reg, hoje) / 4); // 4x o SLA satura a escala
  return Math.round((TR_PESOS.valor*pValor + TR_PESOS.atraso*pAtraso) * 100);
}
function trCorPrioridade(p){
  if(p>=70) return '#A8200D';
  if(p>=45) return '#D9531E';
  if(p>=25) return '#E9B949';
  return '#6B7280';
}

/* Percentil sobre uma lista de números — usado pro P90 de idade.
   A média de idade mente (é puxada pra baixo pelo volume novo); o que
   dói é a cauda, então o dashboard mostra os dois lado a lado. */
function trPercentil(valores, p){
  if(!valores.length) return 0;
  const ord = valores.slice().sort((a,b)=>a-b);
  const idx = Math.min(ord.length-1, Math.floor((p/100)*ord.length));
  return ord[idx];
}
