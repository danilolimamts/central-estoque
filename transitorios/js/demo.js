/* ============================================================
   Gestão de Transitórios — Base de demonstração
   Dados FICTÍCIOS, gerados localmente com semente fixa (a mesma
   base sai igual em qualquer máquina). Servem só pra mostrar o
   desenho do módulo antes de existir importação real — assim que
   uma base de verdade for importada, o modo demo é desligado.
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

const TR_DEMO_PRODUTOS = [
  ['Elevador automotivo 2 colunas 2.5t', 12480], ['Elevador de alinhamento 4 colunas', 28900],
  ['Compressor de ar 20 pés 200L', 3890],        ['Balanceadora de rodas digital', 7450],
  ['Alinhador de direção 3D', 21600],            ['Prensa hidráulica 30t', 4120],
  ['Lavadora alta pressão 2200 PSI', 1890],      ['Máquina de solda MIG 250A', 2760],
  ['Torquímetro de estalo 1/2" 210Nm', 486],     ['Chave de impacto pneumática 1/2"', 620],
  ['Jogo de soquetes 150 peças', 380],           ['Macaco jacaré 3t rebaixado', 745],
  ['Parafusadeira de impacto 20V', 890],         ['Esmerilhadeira angular 7"', 430],
  ['Cavalete de 6t (par)', 290],                 ['Scanner automotivo profissional', 5640],
  ['Desmontadora de pneus automática', 9870],    ['Carrinho de ferramentas 7 gavetas', 2340],
  ['Bomba de óleo pneumática 50:1', 1580],       ['Recolhedor de óleo 80L', 1240],
  ['Cabine de pintura compacta', 15900],         ['Aspirador industrial 80L', 1120],
  ['Multímetro digital true RMS', 312],          ['Coletor de fluido de freio', 680]
];
const TR_DEMO_LOCAIS = {
  recebimento:  ['TRANS-REC-01','TRANS-REC-02','DOCA-A03','DOCA-A04'],
  enderecamento:['TRANS-END-01','TRANS-END-02','PULM-B12'],
  staging:      ['STG-EXP-01','STG-EXP-02','STG-EXP-03','DOCA-E07'],
  devolucao:    ['TRANS-REV-01','TRANS-REV-02'],
  qualidade:    ['BLQ-QUA-01','BLQ-QUA-02'],
  avaria:       ['TRANS-AVA-01','TRANS-AVA-02','AVA-SUC-01']
};
/* Mix realista. `mediaDias` é a média de uma exponencial: o grosso do volume
   sai rápido e a quantidade cai suave conforme a idade sobe — é assim que um
   aging saudável se parece. Por cima disso, `pctEsquecido` dos registros caem
   na cauda longa (o que o módulo existe pra caçar). */
const TR_DEMO_MIX = [
  {tipo:'staging',       n:34, mediaDias:0.6, maxDias:6,  pctEsquecido:0.03},
  {tipo:'enderecamento', n:43, mediaDias:0.8, maxDias:8,  pctEsquecido:0.05},
  {tipo:'recebimento',   n:50, mediaDias:1.2, maxDias:10, pctEsquecido:0.05},
  {tipo:'devolucao',     n:29, mediaDias:3.5, maxDias:26, pctEsquecido:0.08},
  {tipo:'qualidade',     n:18, mediaDias:5.0, maxDias:34, pctEsquecido:0.10},
  {tipo:'avaria',        n:24, mediaDias:9.0, maxDias:62, pctEsquecido:0.14}
];

/* Quantidade x preço andam em sentidos opostos no mundo real: ninguém tem 20
   elevadores parados no transitório, mas tem 40 jogos de soquete. Sem isso a
   base demo estourava o valor parado e o "% do estoque" saía irreal. */
function trDemoQtd(valorUnit, rnd){
  let teto;
  if(valorUnit >= 10000) teto = 2;
  else if(valorUnit >= 3000) teto = 5;
  else if(valorUnit >= 1000) teto = 10;
  else if(valorUnit >= 400) teto = 22;
  else teto = 40;
  return 1 + Math.floor(Math.pow(rnd(), 1.7)*teto);
}

function trGerarBaseDemo(hoje){
  const rnd = trMulberry32(20260821);
  const ref = hoje ? new Date(hoje) : new Date();
  const regs = [];
  let seq = 1;

  TR_DEMO_MIX.forEach(bloco=>{
    const tipo = TR_TIPO_MAP[bloco.tipo];
    const locais = TR_DEMO_LOCAIS[bloco.tipo];
    for(let i=0;i<bloco.n;i++){
      const prod = TR_DEMO_PRODUTOS[Math.floor(rnd()*TR_DEMO_PRODUTOS.length)];
      let dias;
      if(rnd() < bloco.pctEsquecido){
        dias = Math.round(18 + rnd()*(bloco.maxDias*1.4)); // cauda esquecida
      }else{
        // Exponencial: decaimento suave, sem o degrau artificial de um sorteio uniforme.
        dias = Math.min(bloco.maxDias, Math.floor(-Math.log(1-rnd())*bloco.mediaDias));
      }
      const valorUnit = Math.round(prod[1] * (0.9 + rnd()*0.2));
      const qtd = trDemoQtd(valorUnit, rnd);
      const entrada = new Date(ref.getTime() - dias*TR_MS_DIA);
      regs.push({
        id: 'TR'+String(seq).padStart(5,'0'),
        item: String(100000 + Math.floor(rnd()*899999)),
        descricao: prod[0],
        tipo: bloco.tipo,
        local: locais[Math.floor(rnd()*locais.length)],
        qtd,
        valorUnit,
        valor: qtd*valorUnit,
        dataEntrada: entrada.toISOString(),
        responsavel: tipo.dono,
        // "Ruptura fantasma": o item está no CD e mesmo assim falta pra venda,
        // porque não está disponível pra separação. É o dano mais caro e o
        // menos visível — por isso vira KPI de primeira linha.
        rupturaVenda: rnd() < (dias > 7 ? 0.34 : 0.09),
        status: 'aberto'
      });
      seq++;
    }
  });

  return regs;
}

/* Série histórica das últimas 8 semanas, pra responder a pergunta que a foto
   do dia não responde: estou piorando? É construída DE TRÁS PRA FRENTE a
   partir dos números de hoje, pra que a última barra bata exatamente com o
   valor parado que os KPIs mostram — gráfico e cartão contando a mesma coisa. */
function trGerarHistoricoDemo(hoje, valorAtual, idadeAtual){
  const rnd = trMulberry32(77021);
  const ref = hoje ? new Date(hoje) : new Date();
  const out = [];
  let valor = valorAtual || 900000;
  let idade = idadeAtual || 5;
  for(let s=0; s<=7; s++){
    const d = new Date(ref.getTime() - s*7*TR_MS_DIA);
    out.unshift({
      semana: d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}),
      valor: Math.round(valor),
      idadeMedia: Math.round(idade*10)/10
    });
    // Andando pra trás no tempo os números eram menores: a base demo conta a
    // história de um transitório que vem se deteriorando ao longo do trimestre.
    valor = valor * (0.90 + rnd()*0.06);
    idade = Math.max(1.5, idade * (0.90 + rnd()*0.07));
  }
  return out;
}

/* Valor total do estoque do CD — só pra calcular "% do estoque sequestrado".
   Na versão real vem da base de estoque ou de Configurações. */
const TR_DEMO_ESTOQUE_TOTAL = 47600000;
