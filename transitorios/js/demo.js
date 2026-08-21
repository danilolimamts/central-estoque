/* ============================================================
   Gestão de Transitórios — Base de demonstração
   Dados FICTÍCIOS com semente fixa (a mesma base sai igual em
   qualquer máquina). Reproduzem o FORMATO da planilha real —
   matriz transitório x faixa, com Valor e Peças — só pra validar
   o desenho das telas. A primeira importação real desliga o modo
   demo e substitui tudo.
   ============================================================ */

/* PRNG com semente (mulberry32) — sem isso a base mudaria a cada F5
   e ninguém conseguiria discutir os números da tela. */
function trMulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Perfil por transitório:
   `total`  = valor total parado nele (escala, em R$);
   `cauda`  = o quanto ele deixa envelhecer. 0 = limpa tudo em 24-48h;
              1 = espalha o valor por semanas e vira depósito;
   `ticket` = valor médio por peça, que separa os de peça cara (elevador em
              avaria) dos de peça barata e volume alto (cancelamento). */
const TR_DEMO_PERFIS = {
  'ANE INB':{total:26300,  cauda:0.02, ticket:100},
  'AVA INB':{total:5200,   cauda:0.85, ticket:280},
  'AVA OUT':{total:17100,  cauda:0.90, ticket:900},
  'AVA TRA':{total:0,      cauda:0.00, ticket:200},
  'AVA TSF':{total:120,    cauda:0.55, ticket:30},
  'BCK LOG':{total:6600,   cauda:0.05, ticket:170},
  'CAN 001':{total:300,    cauda:0.03, ticket:260},
  'CAN MCL':{total:1830,   cauda:0.15, ticket:210},
  'CAN PAR':{total:2740,   cauda:0.08, ticket:22},
  'CAN SAC':{total:8000,   cauda:0.06, ticket:250},
  'DEV 001':{total:390000, cauda:0.95, ticket:45},  // o grande ofensor, como na planilha
  'DEV 002':{total:420,    cauda:0.40, ticket:170},
  'INS REC':{total:15100,  cauda:0.10, ticket:1400},
  'LIT GIO':{total:7300,   cauda:0.70, ticket:150},
  'OPE AUX':{total:3100,   cauda:0.35, ticket:10},
  'QBR LIQ':{total:1500,   cauda:0.75, ticket:32},
  'REC LIT':{total:12400,  cauda:0.60, ticket:55},
  'REC STK':{total:46000,  cauda:0.65, ticket:300},
  'RES FUL':{total:22300,  cauda:0.02, ticket:275},
  'ROT ATI':{total:0,      cauda:0.00, ticket:100},
  'SEG URO':{total:8100,   cauda:0.80, ticket:900},
  'UMA 01' :{total:320,    cauda:0.20, ticket:120}
};

function trGerarMatrizDemo(){
  const rnd = trMulberry32(20260821);
  const matriz = [];

  TR_TRANSITORIOS.forEach(t=>{
    const p = TR_DEMO_PERFIS[t.cod] || {total:1000, cauda:0.2, ticket:150};
    if(p.total === 0) return; // transitório zerado — existe na lista e não aparece na matriz

    // Distribui o total entre as faixas por peso exponencial: quanto maior a
    // cauda, mais devagar o peso cai e mais valor sobra nas faixas velhas.
    // Trabalhar com o total (e não com o valor da primeira faixa) é o que dá
    // controle sobre a escala — antes os totais saíam pequenos demais.
    const meiaVida = 1 + 6*p.cauda;
    const pesos = TR_FAIXAS.map((f,i)=>{
      const base = Math.exp(-i/meiaVida) * (0.5 + rnd());
      // Célula vazia (o "-" da planilha): transitório de giro rápido tem
      // muitos buracos nas faixas velhas.
      const presenca = i===0 ? 0.95 : (0.30 + 0.62*p.cauda);
      return rnd() < presenca ? base : 0;
    });
    const soma = pesos.reduce((s,w)=>s+w, 0);
    if(soma <= 0) return;

    TR_FAIXAS.forEach((f,i)=>{
      if(!pesos[i]) return;
      const valor = Math.round(p.total * (pesos[i]/soma) * 100)/100;
      if(valor < 1) return;
      const pecas = Math.max(1, Math.round(valor / (p.ticket * (0.5 + rnd()))));
      matriz.push({transitorio:t.cod, faixa:f.key, valor, pecas});
    });
  });

  return matriz;
}

/* Série das últimas 8 semanas, construída DE TRÁS PRA FRENTE a partir dos
   números de hoje, pra que a última barra bata com o KPI. Responde a
   pergunta que a foto do dia não responde: estou piorando? */
function trGerarHistoricoDemo(hoje, valorAtual, pctVelhoAtual){
  const rnd = trMulberry32(77021);
  const ref = hoje ? new Date(hoje) : new Date();
  const MS_SEM = 7*24*60*60*1000;
  const out = [];
  let valor = valorAtual || 300000;
  let pct = pctVelhoAtual || 0.3;
  for(let s=0; s<=7; s++){
    const d = new Date(ref.getTime() - s*MS_SEM);
    out.unshift({
      semana: d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}),
      valor: Math.round(valor),
      valorVelho: Math.round(valor*pct),
      pctVelho: Math.round(pct*1000)/1000
    });
    // Andando pra trás, os números eram melhores: a base demo conta a história
    // de um transitório que vem envelhecendo ao longo do trimestre.
    valor = valor * (0.93 + rnd()*0.05);
    pct = Math.max(0.05, pct * (0.88 + rnd()*0.08));
  }
  return out;
}
