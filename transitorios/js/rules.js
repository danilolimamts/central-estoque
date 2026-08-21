/* ============================================================
   Gestão de Transitórios — Regras de negócio

   A base é uma MATRIZ: transitório (linha) x faixa de aging
   (coluna), com Valor (R$) e Peças em cada célula — exatamente
   o formato da planilha de origem.

   O princípio do módulo: transitório é FLUXO, não estoque. O que
   se monitora não é o saldo total, é quanto do saldo ENVELHECEU.
   Um transitório com R$ 200 mil todo em 24h é fluxo normal; um
   com R$ 50 mil parado há 4 semanas é dinheiro preso.
   ============================================================ */

/* Faixas de aging, na mesma quebra da planilha (24/48/72/96/120 horas,
   depois semanas). `horas` é o limite superior da faixa; `meio` é o ponto
   médio em dias, usado pra estimar idade média ponderada — a planilha não
   traz a data de entrada de cada peça, só a faixa em que ela caiu. */
const TR_FAIXAS = [
  {key:'24h',  label:'24 hrs',     curto:'24h',  horas:24,   meio:0.5,  cor:'#1F8A52'},
  {key:'48h',  label:'48 hrs',     curto:'48h',  horas:48,   meio:1.5,  cor:'#4E9E4A'},
  {key:'72h',  label:'72 hrs',     curto:'72h',  horas:72,   meio:2.5,  cor:'#7FB069'},
  {key:'96h',  label:'96 hrs',     curto:'96h',  horas:96,   meio:3.5,  cor:'#C7B44E'},
  {key:'120h', label:'120 hrs',    curto:'120h', horas:120,  meio:4.5,  cor:'#E9B949'},
  {key:'1sem', label:'1 semana',   curto:'1 sem',horas:168,  meio:6,    cor:'#E8843C'},
  {key:'2sem', label:'2 semanas',  curto:'2 sem',horas:336,  meio:10.5, cor:'#D9531E'},
  {key:'3sem', label:'3 semanas',  curto:'3 sem',horas:504,  meio:17.5, cor:'#BE3312'},
  {key:'4sem', label:'4 semanas',  curto:'4 sem',horas:672,  meio:24.5, cor:'#A8200D'},
  {key:'+4sem',label:'+4 semanas', curto:'+4 sem',horas:Infinity, meio:45, cor:'#6E1108'}
];
const TR_FAIXA_KEYS = TR_FAIXAS.map(f=>f.key);
const TR_FAIXA_MAP = Object.fromEntries(TR_FAIXAS.map(f=>[f.key, f]));

/* CORTE DE ENVELHECIMENTO — a linha que separa "fluxo normal" de "parado".
   Tudo desta faixa em diante conta como envelhecido. É o parâmetro mais
   importante do módulo e fica editável em Configurações: subir o corte
   afrouxa a cobrança, descer aperta. */
let TR_CORTE = '1sem';
function trCorteIdx(){ return Math.max(0, TR_FAIXA_KEYS.indexOf(TR_CORTE)); }
function trFaixaEnvelhecida(faixaKey){
  return TR_FAIXA_KEYS.indexOf(faixaKey) >= trCorteIdx();
}
function trSetCorte(key){ if(TR_FAIXA_MAP[key]) TR_CORTE = key; }

/* Códigos de transitório da planilha. A lista NÃO é fechada — a importação
   aceita qualquer código que vier no arquivo. Ela serve pra (a) semear a base
   demo e (b) dar nome e família aos códigos conhecidos, já que "AVA OUT" não
   diz muita coisa num relatório executivo.
   Os nomes abaixo são a leitura provável do código e devem ser conferidos —
   ficam editáveis em Configurações. */
const TR_TRANSITORIOS = [
  {cod:'ANE INB', nome:'Anexo — entrada',            familia:'Recebimento'},
  {cod:'AVA INB', nome:'Avaria — entrada',           familia:'Avaria'},
  {cod:'AVA OUT', nome:'Avaria — saída',             familia:'Avaria'},
  {cod:'AVA TRA', nome:'Avaria — tratativa',         familia:'Avaria'},
  {cod:'AVA TSF', nome:'Avaria — transferência',     familia:'Avaria'},
  {cod:'BCK LOG', nome:'Backlog logístico',          familia:'Operação'},
  {cod:'CAN 001', nome:'Cancelamento',               familia:'Cancelamento'},
  {cod:'CAN MCL', nome:'Cancelamento — MCL',         familia:'Cancelamento'},
  {cod:'CAN PAR', nome:'Cancelamento parcial',       familia:'Cancelamento'},
  {cod:'CAN SAC', nome:'Cancelamento — SAC',         familia:'Cancelamento'},
  {cod:'DEV 001', nome:'Devolução',                  familia:'Devolução'},
  {cod:'DEV 002', nome:'Devolução — 002',            familia:'Devolução'},
  {cod:'INS REC', nome:'Inspeção de recebimento',    familia:'Recebimento'},
  {cod:'LIT GIO', nome:'Litígio',                    familia:'Litígio'},
  {cod:'OPE AUX', nome:'Operação auxiliar',          familia:'Operação'},
  {cod:'QBR LIQ', nome:'Quebra / liquidação',        familia:'Perda'},
  {cod:'REC LIT', nome:'Recebimento — litígio',      familia:'Recebimento'},
  {cod:'REC STK', nome:'Recebimento — estoque',      familia:'Recebimento'},
  {cod:'RES FUL', nome:'Reserva — fulfillment',      familia:'Operação'},
  {cod:'ROT ATI', nome:'Rota ativa',                 familia:'Expedição'},
  {cod:'SEG URO', nome:'Seguro',                     familia:'Litígio'},
  {cod:'UMA 01',  nome:'UMA 01',                     familia:'Operação'}
];
const TR_TRANSITORIO_MAP = Object.fromEntries(TR_TRANSITORIOS.map(t=>[t.cod, t]));
function trNomeTransitorio(cod){ const t = TR_TRANSITORIO_MAP[cod]; return t ? t.nome : cod; }
function trFamiliaTransitorio(cod){
  const t = TR_TRANSITORIO_MAP[cod];
  if(t) return t.familia;
  // Código desconhecido: agrupa pelo prefixo, que é como a nomenclatura funciona.
  return (String(cod).trim().split(/\s+/)[0] || '—');
}

/* ============================================================
   AGREGAÇÕES SOBRE A MATRIZ
   TR.matriz é uma lista de células {transitorio, faixa, valor, pecas}.
   ============================================================ */
function trCelula(matriz, cod, faixaKey){
  return matriz.find(c=>c.transitorio===cod && c.faixa===faixaKey) || {valor:0, pecas:0};
}
/* Uma linha por transitório, já com total, envelhecido e idade estimada —
   é a estrutura que a matriz, o ranking e os KPIs consomem. */
function trLinhas(matriz){
  const mapa = {};
  matriz.forEach(c=>{
    const l = mapa[c.transitorio] || (mapa[c.transitorio] = {
      cod:c.transitorio, nome:trNomeTransitorio(c.transitorio), familia:trFamiliaTransitorio(c.transitorio),
      celulas:{}, valor:0, pecas:0, valorVelho:0, pecasVelhas:0, valorDias:0
    });
    l.celulas[c.faixa] = {valor:c.valor, pecas:c.pecas};
    l.valor += c.valor; l.pecas += c.pecas;
    l.valorDias += c.valor * (TR_FAIXA_MAP[c.faixa] ? TR_FAIXA_MAP[c.faixa].meio : 0);
    if(trFaixaEnvelhecida(c.faixa)){ l.valorVelho += c.valor; l.pecasVelhas += c.pecas; }
  });
  return Object.values(mapa).map(l=>({
    ...l,
    pctVelho: l.valor ? l.valorVelho/l.valor : 0,
    // Idade média ponderada por valor, estimada pelo ponto médio de cada faixa.
    // Não é a idade real (a planilha não traz data de entrada) — é a melhor
    // aproximação possível com a granularidade que existe.
    idadeEstimada: l.valor ? l.valorDias/l.valor : 0
  }));
}
function trTotaisPorFaixa(matriz){
  return TR_FAIXAS.map(f=>{
    const cs = matriz.filter(c=>c.faixa===f.key);
    return {faixa:f, valor:cs.reduce((s,c)=>s+c.valor,0), pecas:cs.reduce((s,c)=>s+c.pecas,0)};
  });
}
function trKpis(matriz){
  const linhas = trLinhas(matriz);
  const valor = linhas.reduce((s,l)=>s+l.valor, 0);
  const pecas = linhas.reduce((s,l)=>s+l.pecas, 0);
  const valorVelho = linhas.reduce((s,l)=>s+l.valorVelho, 0);
  const pecasVelhas = linhas.reduce((s,l)=>s+l.pecasVelhas, 0);
  const comVelho = linhas.filter(l=>l.valorVelho>0);
  const pior = linhas.slice().sort((a,b)=>b.valorVelho-a.valorVelho)[0] || null;
  const idade = valor ? linhas.reduce((s,l)=>s+l.valorDias, 0)/valor : 0;
  return {
    valor, pecas, valorVelho, pecasVelhas,
    pctVelho: valor ? valorVelho/valor : 0,
    transitorios: linhas.length,
    transitoriosComVelho: comVelho.length,
    pior, idadeEstimada: idade
  };
}

/* Prioridade da célula na fila de tratativa.

   O peso é o VALOR multiplicado por um fator de idade — não uma soma de
   valor e idade. A soma tinha um defeito grave: uma célula de R$ 3 parada
   há 5 semanas ganhava a pontuação cheia da idade e subia na fila, quando
   resolvê-la não devolve dinheiro nenhum. Multiplicando, o valor manda e a
   idade só amplifica — é o que a fila precisa responder ("o que resolver
   primeiro" é sempre uma pergunta sobre dinheiro). */
function trPesoCelula(cel){
  const f = TR_FAIXA_MAP[cel.faixa];
  return cel.valor * (1 + (f ? f.meio : 0)/7);
}
/* A escala 0-100 é relativa ao topo da fila, com raiz pra não achatar tudo
   quando um único transitório domina a base (o caso normal). */
function trPrioridadeCelula(cel, maxPeso){
  if(!maxPeso) return 0;
  return Math.max(1, Math.round(100*Math.sqrt(trPesoCelula(cel)/maxPeso)));
}
function trCorPrioridade(p){
  if(p>=70) return '#A8200D';
  if(p>=45) return '#D9531E';
  if(p>=25) return '#E9B949';
  return '#6B7280';
}

/* Converte "R$ 26.271,10", "1.699,98", "-", 26271.1 -> número.
   A planilha vem com traço no lugar de zero e R$ dentro da célula. */
function trParseNum(v){
  if(v===null || v===undefined) return 0;
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim();
  if(!s || s==='-' || s==='—') return 0;
  s = s.replace(/R\$/gi,'').replace(/\s/g,'').replace(/\./g,'').replace(',', '.');
  const n = parseFloat(s.replace(/[^0-9.\-]/g,''));
  return isFinite(n) ? n : 0;
}
