/* ============================================================
   Web Worker — Auditoria de Divergências de Inventário
   Faz todo o parsing/cruzamento/diagnóstico fora da thread principal.
   Nenhuma chamada de rede além do CDN do SheetJS (carregado 1x).
   ============================================================ */
importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
importScripts('./audit-rules.js');
importScripts('./audit-db.js');

function parseNumber(v){
  if(v===undefined || v===null || v==='') return 0;
  if(typeof v === 'number') return v;
  let s = String(v).trim();
  if(!s) return 0;
  s = s.replace(/[^\d,.\-]/g,'');
  const hasComma = s.includes(','), hasDot = s.includes('.');
  if(hasComma && hasDot){
    if(s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',','.');
    else s = s.replace(/,/g,'');
  } else if(hasComma){
    s = s.replace(/\./g,'').replace(',','.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function parseDateVal(v){
  if(v===undefined || v===null || v==='') return null;
  if(v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if(typeof v === 'number'){
    const d = XLSX.SSF.parse_date_code(v);
    if(!d) return null;
    return new Date(d.y, d.m-1, d.d, d.H||0, d.M||0, d.S||0);
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(s);
  if(m){
    let [, dd, mm, yy] = m;
    yy = yy.length===2 ? ('20'+yy) : yy;
    const d = new Date(+yy, +mm-1, +dd);
    return isNaN(d.getTime()) ? null : d;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if(m) return new Date(+m[1], +m[2]-1, +m[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function isoDate(d){ return d ? d.toISOString().slice(0,10) : ''; }
function isLiquidado(situacao){
  return audNormKey(situacao).includes('liquidad');
}

function buildAliasResolver(headers, aliasMap){
  const resolved = {};
  const normHeaders = headers.map(h=>({raw:h, norm: audNormKey(h)}));
  for(const canon in aliasMap){
    const candidates = aliasMap[canon];
    let found = null;
    for(const cand of candidates){
      const nc = audNormKey(cand);
      const hit = normHeaders.find(h=>h.norm===nc);
      if(hit){ found = hit.raw; break; }
    }
    resolved[canon] = found;
  }
  return resolved;
}

function sheetToRows(wb){
  const wsname = wb.SheetNames[0];
  const ws = wb.Sheets[wsname];
  return XLSX.utils.sheet_to_json(ws, {defval:null, raw:true});
}

const ALIAS_0114 = {
  inventario: ['Inventário','Inventario'],
  local: ['Local'],
  endereco: ['Endereco','Endereço'],
  situacao: ['Situação','Situacao'],
  itemWms: ['Item WMS'],
  itemSige: ['Item SIGE'],
  descricao: ['Descricão','Descrição'],
  ean: ['EAN'],
  codTerceiro: ['Cod.Terceiro','Cod Terceiro'],
  qtdeLogica: ['Qtde. Lógica','Qtde. Logica','Qtde Logica'],
  qtdeFisica: ['Qtde. Fisica','Qtde. Física','Qtde Fisica'],
  diferenca: ['Diferença','Diferenca'],
  vlLogico: ['Vl. Lógico','Vl. Logico'],
  vlFisico: ['Vl. Físico','Vl. Fisico'],
  vlDivergencia: ['Vl. Divergência','Vl. Divergencia'],
  simulacao: ['Simulação','Simulacao'],
  dataInicio: ['Data inicio','Data Início','Data Inicio'],
  dataFim: ['Data Fim','Data fim'],
  usuario: ['Usuario','Usuário']
};
const ALIAS_845 = {
  inventario: ['Inventario','Inventário'],
  local: ['Local'],
  descricaoLocal: ['Descrição local','Descricao local'],
  dataSituacao: ['Data Situação','Data Situacao'],
  dataInicio: ['Data inicio','Data Início'],
  dataFim: ['Data fim','Data Fim'],
  obsInventario: ['Obs inventario','Obs Inventário','Obs Inventario'],
  nuEstoques: ['Nu. estoques','Nu estoques'],
  conferencias: ['Conferencias','Conferências'],
  usuarioConferencia: ['Usuario Conferencia','Usuário Conferência'],
  sitInventario: ['Sit. Inventario','Sit. Inventário'],
  sitLocal: ['Sit. Local']
};
const ALIAS_390 = {
  item: ['Item'],
  descricao: ['Descrição','Descricao'],
  codTerceiro: ['Cod Terceiro','Cod.Terceiro'],
  lote: ['Lote'],
  loteTerceiro: ['Lote terceiro'],
  dataValidade: ['Data de Validade'],
  tipoMistura: ['Tipo Mistura'],
  ean: ['EAN'],
  classeSku: ['Classe Sku'],
  classeLocal: ['Classe Local'],
  local: ['Local'],
  situacao: ['Situação','Situacao'],
  inventario: ['Inventário','Inventario'],
  restricao: ['Restrição','Restricao'],
  quantidade: ['Quantidade'],
  quantidadeRomaneada: ['Quantidade Romaneada'],
  picking: ['Picking'],
  predio: ['Predio','Prédio'],
  dataSituacao: ['Data Situação','Data Situacao']
};

function getVal(row, resolvedKey){ return resolvedKey ? row[resolvedKey] : null; }

function validateColumns(resolved, requiredKeys, fileLabel){
  const missing = requiredKeys.filter(k=>!resolved[k]);
  if(missing.length){
    throw new Error(`${fileLabel}: colunas obrigatórias não encontradas: ${missing.join(', ')}`);
  }
}

self.onmessage = async function(e){
  const msg = e.data;
  if(msg.type !== 'process') return;
  try{
    await runPipeline(msg);
  }catch(err){
    self.postMessage({type:'error', message: err.message || String(err)});
  }
};

async function runPipeline({buf0114, buf390, buf845, netConfig, anoFiltro}){
  post('progress', {stage:'Lendo planilhas...', pct:2});
  const wb0114 = XLSX.read(buf0114, {type:'array', cellDates:true});
  const wb390  = XLSX.read(buf390,  {type:'array', cellDates:true});
  const wb845  = XLSX.read(buf845,  {type:'array', cellDates:true});

  const rows0114raw = sheetToRows(wb0114);
  const rows390raw  = sheetToRows(wb390);
  const rows845raw  = sheetToRows(wb845);

  if(!rows0114raw.length) throw new Error('QUERY 0114: planilha vazia.');
  if(!rows390raw.length) throw new Error('QUERY 390: planilha vazia.');
  if(!rows845raw.length) throw new Error('QUERY 845: planilha vazia.');

  const headers0114 = Object.keys(rows0114raw[0]);
  const headers390  = Object.keys(rows390raw[0]);
  const headers845  = Object.keys(rows845raw[0]);

  const r0114 = buildAliasResolver(headers0114, ALIAS_0114);
  const r390  = buildAliasResolver(headers390, ALIAS_390);
  const r845  = buildAliasResolver(headers845, ALIAS_845);

  validateColumns(r0114, ['inventario','local','itemWms','diferenca','vlDivergencia'], 'QUERY 0114');
  validateColumns(r390, ['item','local','quantidade'], 'QUERY 390');
  validateColumns(r845, ['inventario','local','obsInventario'], 'QUERY 845');

  post('progress', {stage:'Indexando QUERY 845 (detalhe do inventário)...', pct:10});
  const map845 = new Map();
  for(const row of rows845raw){
    const inv = String(getVal(row, r845.inventario) ?? '').trim();
    const loc = String(getVal(row, r845.local) ?? '').trim();
    const key = inv+'|'+loc;
    map845.set(key, {
      obsInventario: getVal(row, r845.obsInventario),
      usuarioConferencia: getVal(row, r845.usuarioConferencia),
      sitInventario: getVal(row, r845.sitInventario),
      sitLocal: getVal(row, r845.sitLocal),
      conferencias: getVal(row, r845.conferencias),
      nuEstoques: getVal(row, r845.nuEstoques)
    });
  }

  post('progress', {stage:'Indexando QUERY 390 (estoque por local)...', pct:22});
  // Locais com Situação "Liquidado" já foram baixados/encerrados: não representam
  // estoque físico recuperável, então são contados à parte e não entram no saldo
  // usado para diagnosticar "sem localização" / "erro de posição".
  const map390 = new Map(); // item -> {total, enderecos:[{local,qtd}], totalLiquidado, enderecosLiquidados, classeSku, codTerceiro}
  for(const row of rows390raw){
    const item = String(getVal(row, r390.item) ?? '').trim();
    if(!item) continue;
    const local = String(getVal(row, r390.local) ?? '').trim();
    const qtd = parseNumber(getVal(row, r390.quantidade));
    const situacaoLocal = String(getVal(row, r390.situacao) ?? '').trim();
    let entry = map390.get(item);
    if(!entry){
      entry = {
        total:0, enderecos:[], totalLiquidado:0, enderecosLiquidados:[],
        classeSku: String(getVal(row, r390.classeSku) ?? '').trim(),
        codTerceiro: String(getVal(row, r390.codTerceiro) ?? '').trim()
      };
      map390.set(item, entry);
    }
    if(isLiquidado(situacaoLocal)){
      entry.totalLiquidado += qtd;
      entry.enderecosLiquidados.push({local, quantidade: qtd});
    } else {
      entry.total += qtd;
      entry.enderecos.push({local, quantidade: qtd});
    }
  }

  post('progress', {stage:'Normalizando e eliminando duplicidades...', pct:32});
  const netMap = new Map();
  (netConfig||[]).forEach(r=>netMap.set(r.cod, r));
  const codigosNovos = new Set();

  const seenHash = new Set();
  const enriched = [];
  let skippedDup = 0;
  const total = rows0114raw.length;
  let idx = 0;

  for(const row of rows0114raw){
    idx++;
    if(idx % 4000 === 0){
      post('progress', {stage:'Processando divergências...', pct: 32 + Math.round((idx/total)*40)});
    }
    const inventario = String(getVal(row, r0114.inventario) ?? '').trim();
    const local = String(getVal(row, r0114.local) ?? '').trim();
    const endereco = String(getVal(row, r0114.endereco) ?? '').trim();
    const itemWms = String(getVal(row, r0114.itemWms) ?? '').trim();
    const itemSige = String(getVal(row, r0114.itemSige) ?? '').trim();
    const descricao = String(getVal(row, r0114.descricao) ?? '').trim();
    const ean = String(getVal(row, r0114.ean) ?? '').trim();
    const codTerceiro = String(getVal(row, r0114.codTerceiro) ?? '').trim();
    const qtdeLogica = parseNumber(getVal(row, r0114.qtdeLogica));
    const qtdeFisica = parseNumber(getVal(row, r0114.qtdeFisica));
    const diferenca = parseNumber(getVal(row, r0114.diferenca));
    const vlLogico = parseNumber(getVal(row, r0114.vlLogico));
    const vlFisico = parseNumber(getVal(row, r0114.vlFisico));
    const vlDivergencia = parseNumber(getVal(row, r0114.vlDivergencia));
    const simulacao = String(getVal(row, r0114.simulacao) ?? '').trim();
    const dataInicio = parseDateVal(getVal(row, r0114.dataInicio));
    const dataFim = parseDateVal(getVal(row, r0114.dataFim));
    const usuario = String(getVal(row, r0114.usuario) ?? '').trim();
    const situacao = String(getVal(row, r0114.situacao) ?? '').trim();

    if(!itemWms && !diferenca) continue;

    const dupHash = [inventario, local, itemWms, itemSige, diferenca, isoDate(dataInicio), isoDate(dataFim), usuario].join('~');
    if(seenHash.has(dupHash)){ skippedDup++; continue; }
    seenHash.add(dupHash);

    const dataRef = dataFim || dataInicio;
    const ano = dataRef ? dataRef.getFullYear() : (new Date()).getFullYear();

    const det845 = map845.get(inventario+'|'+local) || null;
    const {codLegenda, descLegenda, classificada} = audExtractLegenda(det845 ? det845.obsInventario : '');

    let netCfg = codLegenda ? netMap.get(codLegenda) : null;
    if(codLegenda && !netCfg){
      codigosNovos.add(codLegenda);
      netCfg = {cod:codLegenda, descricao: descLegenda || '(não classificado)', net:false, origem:'auto'};
      netMap.set(codLegenda, netCfg);
    }
    const considerarNet = classificada && netCfg ? !!netCfg.net : false;

    const est390 = map390.get(itemWms) || {total:0, enderecos:[], totalLiquidado:0, enderecosLiquidados:[]};
    const noEndereco = est390.enderecos.filter(e=>e.local===endereco);
    const qtdNoEndereco = noEndereco.reduce((s,e)=>s+e.quantidade,0);
    const presenteNoEndereco = noEndereco.length>0 && qtdNoEndereco !== 0;
    const enderecosDistintos = new Set(est390.enderecos.map(e=>e.local)).size;
    const qtdOutrosEnderecos = est390.total - qtdNoEndereco;
    const enderecosLiquidadosDistintos = new Set(est390.enderecosLiquidados.map(e=>e.local)).size;

    const sitLocalDet = det845 ? (det845.sitLocal||'') : '';
    const sitInventarioDet = det845 ? (det845.sitInventario||'') : '';
    const situacaoLiquidada = isLiquidado(situacao) || isLiquidado(sitLocalDet) || isLiquidado(sitInventarioDet);

    enriched.push({
      inventario, local, endereco, situacao, itemWms, itemSige, descricao, ean, codTerceiro,
      qtdeLogica, qtdeFisica, diferenca, vlLogico, vlFisico, vlDivergencia, simulacao,
      dataInicio: isoDate(dataInicio), dataFim: isoDate(dataFim), usuario, ano,
      obsInventario: det845 ? (det845.obsInventario||'') : '',
      usuarioConferencia: det845 ? (det845.usuarioConferencia||'') : '',
      sitInventario: sitInventarioDet,
      sitLocal: sitLocalDet,
      situacaoLiquidada,
      codLegenda, descLegenda, legendaClassificada: classificada,
      considerarNet,
      classeSku: est390.classeSku || '',
      fornecedor: codTerceiro || est390.codTerceiro || '',
      estoqueTotal: est390.total,
      estoqueQtdNoEndereco: qtdNoEndereco,
      estoquePresenteNoEndereco: presenteNoEndereco,
      estoqueQtdOutrosEnderecos: qtdOutrosEnderecos,
      estoqueNumEnderecos: enderecosDistintos,
      estoqueEnderecos: est390.enderecos.slice(0, 30).map(e=>({local:e.local, quantidade:e.quantidade})),
      estoqueTotalLiquidado: est390.totalLiquidado,
      estoqueNumEnderecosLiquidados: enderecosLiquidadosDistintos,
      estoqueEnderecosLiquidados: est390.enderecosLiquidados.slice(0, 30).map(e=>({local:e.local, quantidade:e.quantidade}))
    });
  }

  post('progress', {stage:'Detectando compensações por item...', pct:74});
  const porItem = new Map();
  for(const r of enriched){
    if(!r.considerarNet) continue;
    const key = r.itemWms;
    let g = porItem.get(key);
    if(!g){ g = {soma:0, rows:[], pos:0, neg:0}; porItem.set(key, g); }
    g.soma += r.diferenca;
    g.rows.push(r);
    if(r.diferenca > 0) g.pos++; else if(r.diferenca < 0) g.neg++;
  }

  post('progress', {stage:'Classificando diagnósticos...', pct:82});
  let necessitaCount = 0;
  for(const r of enriched){
    diagnosticar(r, porItem.get(r.itemWms));
    if(r.necessitaValidacao) necessitaCount++;
  }

  post('progress', {stage:'Gravando base tratada no IndexedDB...', pct:90});
  const anosPresentes = Array.from(new Set(enriched.map(r=>r.ano)));
  for(const ano of anosPresentes){
    await audClearAno(ano);
  }
  const CHUNK = 1500;
  const rowsWithId = enriched.map((r,i)=>({id: r.inventario+'|'+r.local+'|'+r.itemWms+'|'+i, ...r}));
  for(let i=0;i<rowsWithId.length;i+=CHUNK){
    await audBulkPutDivergencias(rowsWithId.slice(i, i+CHUNK));
    post('progress', {stage:'Gravando base tratada no IndexedDB...', pct: 90 + Math.round((i/rowsWithId.length)*7)});
  }

  post('progress', {stage:'Calculando indicadores por ano...', pct:97});
  for(const ano of anosPresentes){
    const rowsAno = enriched.filter(r=>r.ano===ano);
    const indicadores = calcularIndicadores(rowsAno, ano===anosPresentes[0] ? skippedDup : 0);
    await audSaveIndicadores(ano, indicadores);
    await audSaveImportMeta(ano, {
      totalLinhas: rowsAno.length,
      necessitaValidacao: indicadores.necessitaValidacao,
      duplicidadesRemovidas: ano===anosPresentes[0] ? skippedDup : 0
    });
  }

  const novosCfg = Array.from(netMap.values()).filter(c=>c.origem==='auto');
  if(novosCfg.length) await audSaveNetConfig(novosCfg);

  post('progress', {stage:'Concluído.', pct:100});
  self.postMessage({
    type:'done',
    codigosNovos: Array.from(codigosNovos),
    anos: anosPresentes,
    total: enriched.length,
    necessitaValidacao: necessitaCount,
    duplicidadesRemovidas: skippedDup
  });
}

function aplicarAjusteLiquidado(r){
  // Local/inventário com Situação "Liquidado" já foi baixado/encerrado administrativamente.
  // A divergência já está com o ciclo fechado: mantém o diagnóstico, mas reduz a
  // necessidade de validação individual (exceto para valores altos) e explica o motivo.
  if(!r.situacaoLiquidada) return;
  r.justificativa += ' Local/inventário com situação "Liquidado" (já encerrado administrativamente).';
  if(Math.abs(r.vlDivergencia) < 1000){
    r.necessitaValidacao = false;
    r.prioridade = 'baixa';
  }
}

function diagnosticar(r, grupoItem){
  const abs = Math.abs(r.diferenca);
  const valorAbs = Math.abs(r.vlDivergencia);

  if(r.considerarNet && grupoItem && grupoItem.pos>0 && grupoItem.neg>0){
    const somaAbs = Math.abs(grupoItem.soma);
    const totalMovAbs = grupoItem.rows.reduce((s,x)=>s+Math.abs(x.diferenca),0);
    const proporcaoResidual = totalMovAbs>0 ? somaAbs/totalMovAbs : 1;
    if(proporcaoResidual <= 0.05){
      r.diagnostico = 'compensacao_historica';
      r.necessitaValidacao = false;
      r.prioridade = 'baixa';
      r.justificativa = `Item ${r.itemWms} teve ${grupoItem.pos} ajuste(s) positivo(s) e ${grupoItem.neg} negativo(s) no período, com saldo líquido residual de ${grupoItem.soma.toLocaleString('pt-BR')} (${(proporcaoResidual*100).toFixed(1)}% do total movimentado). Efeito líquido compensado, sem necessidade de validação individual.`;
      aplicarAjusteLiquidado(r);
      return;
    }
    if(proporcaoResidual <= 0.6){
      r.diagnostico = 'compensacao_parcial';
      r.necessitaValidacao = true;
      r.prioridade = valorAbs>=1000?'media':'baixa';
      r.justificativa = `Item ${r.itemWms} apresenta ajustes de sinais opostos (${grupoItem.pos} positivo(s), ${grupoItem.neg} negativo(s)) que compensam parte da divergência, mas resta saldo líquido de ${grupoItem.soma.toLocaleString('pt-BR')} não explicado. Validar o residual.`;
      aplicarAjusteLiquidado(r);
      return;
    }
  }

  if(!r.legendaClassificada || !r.codLegenda){
    r.diagnostico = 'divergencia_real';
    r.necessitaValidacao = true;
    r.prioridade = valorAbs>=1000?'alta':(valorAbs>=200?'media':'baixa');
    r.justificativa = 'Observação do inventário (QUERY 845) vazia ou fora do padrão "CÓDIGO - DESCRIÇÃO". Legenda não classificada, tratada como divergência real e fora do NET por padrão.';
    aplicarAjusteLiquidado(r);
    return;
  }

  if(r.estoqueTotal === 0){
    r.diagnostico = 'sem_localizacao';
    r.necessitaValidacao = true;
    r.prioridade = valorAbs>=1000?'alta':'media';
    r.justificativa = r.estoqueTotalLiquidado !== 0
      ? `Item ${r.itemWms} não possui saldo ativo na QUERY 390: só aparece em ${r.estoqueNumEnderecosLiquidados} endereço(s) já liquidado(s) (${r.estoqueTotalLiquidado.toLocaleString('pt-BR')} un.), que não conta como estoque físico recuperável. Diferença de ${r.diferenca.toLocaleString('pt-BR')} un. sem lastro ativo.`
      : `Item ${r.itemWms} não foi localizado em nenhum endereço da QUERY 390 (estoque atual). Diferença de ${r.diferenca.toLocaleString('pt-BR')} un. sem lastro físico identificado.`;
    aplicarAjusteLiquidado(r);
    return;
  }

  if(!r.estoquePresenteNoEndereco && r.estoqueQtdOutrosEnderecos !== 0){
    r.diagnostico = 'erro_posicao';
    r.necessitaValidacao = true;
    r.prioridade = valorAbs>=1000?'alta':'media';
    r.justificativa = `Item ${r.itemWms} não está no endereço auditado (${r.endereco||'—'}), mas foi localizado em ${r.estoqueNumEnderecos} outro(s) endereço(s) com saldo total de ${r.estoqueTotal.toLocaleString('pt-BR')} un. Possível erro de posição/endereçamento.`;
    aplicarAjusteLiquidado(r);
    return;
  }

  if(r.estoqueNumEnderecos >= 3 && abs > 0){
    r.diagnostico = 'estoque_fragmentado';
    r.necessitaValidacao = true;
    r.prioridade = valorAbs>=1000?'media':'baixa';
    r.justificativa = `Item ${r.itemWms} está fragmentado em ${r.estoqueNumEnderecos} endereços distintos (total ${r.estoqueTotal.toLocaleString('pt-BR')} un.). A dispersão do estoque dificulta a contagem e pode explicar a divergência de ${r.diferenca.toLocaleString('pt-BR')} un.`;
    aplicarAjusteLiquidado(r);
    return;
  }

  if(['AIN','AIT','TID','INV'].includes(r.codLegenda) && r.estoqueQtdOutrosEnderecos !== 0 && Math.abs(Math.abs(r.estoqueQtdOutrosEnderecos) - abs) <= Math.max(1, abs*0.1)){
    r.diagnostico = 'erro_movimentacao';
    r.necessitaValidacao = true;
    r.prioridade = valorAbs>=1000?'media':'baixa';
    r.justificativa = `Legenda "${r.codLegenda} - ${r.descLegenda}" indica movimentação/transferência. Quantidade encontrada em outros endereços (${r.estoqueQtdOutrosEnderecos.toLocaleString('pt-BR')} un.) é compatível com a diferença apurada (${r.diferenca.toLocaleString('pt-BR')} un.), sugerindo erro de movimentação.`;
    aplicarAjusteLiquidado(r);
    return;
  }

  r.diagnostico = 'divergencia_real';
  r.necessitaValidacao = r.considerarNet ? true : (valorAbs>=500);
  r.prioridade = valorAbs>=1000?'alta':(valorAbs>=200?'media':'baixa');
  r.justificativa = `Divergência de ${r.diferenca.toLocaleString('pt-BR')} un. (${r.vlDivergencia.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}) sem padrão de compensação, posição ou fragmentação identificado. Legenda "${r.codLegenda} - ${r.descLegenda}". Requer validação manual.`;
  aplicarAjusteLiquidado(r);
}

function topN(map, n){
  return Array.from(map.entries())
    .map(([chave, v])=>({chave, ...v}))
    .sort((a,b)=>b.valorAbs-a.valorAbs)
    .slice(0, n);
}

function calcularIndicadores(rows, duplicidadesRemovidas){
  const ind = {
    totalImportadas: rows.length,
    duplicidadesRemovidas,
    considerNetSim: 0, considerNetNao: 0,
    itensUnicos: new Set(), inventarios: new Set(), enderecos: new Set(), usuarios: new Set(),
    qtdDivergente: 0, valorDivergente: 0, qtdPositiva: 0, qtdNegativa: 0,
    valorAbsoluto: 0, qtdAbsoluta: 0,
    porDiagnostico: {}, necessitaValidacao: 0
  };
  const porItemRank = new Map(), porEnderecoRank = new Map(), porUsuarioRank = new Map(),
        porInventarioRank = new Map(), porFamiliaRank = new Map(), porFornecedorRank = new Map();
  const ganhos = [], perdas = [];

  function bump(map, chave, r){
    if(!chave) return;
    let g = map.get(chave);
    if(!g) g = {qtd:0, valor:0, valorAbs:0, ocorrencias:0}, map.set(chave, g);
    g.qtd += r.diferenca;
    g.valor += r.vlDivergencia;
    g.valorAbs += Math.abs(r.vlDivergencia);
    g.ocorrencias++;
  }

  for(const r of rows){
    if(r.considerarNet) ind.considerNetSim++; else ind.considerNetNao++;
    ind.itensUnicos.add(r.itemWms);
    ind.inventarios.add(r.inventario);
    if(r.endereco) ind.enderecos.add(r.endereco);
    if(r.usuario) ind.usuarios.add(r.usuario);
    ind.qtdDivergente += r.diferenca;
    ind.valorDivergente += r.vlDivergencia;
    ind.qtdAbsoluta += Math.abs(r.diferenca);
    ind.valorAbsoluto += Math.abs(r.vlDivergencia);
    if(r.diferenca>0) ind.qtdPositiva += r.diferenca;
    if(r.diferenca<0) ind.qtdNegativa += r.diferenca;
    ind.porDiagnostico[r.diagnostico] = (ind.porDiagnostico[r.diagnostico]||0)+1;
    if(r.necessitaValidacao) ind.necessitaValidacao++;

    bump(porItemRank, r.itemWms+' — '+r.descricao, r);
    bump(porEnderecoRank, r.endereco, r);
    bump(porUsuarioRank, r.usuario, r);
    bump(porInventarioRank, r.inventario, r);
    bump(porFamiliaRank, r.classeSku, r);
    bump(porFornecedorRank, r.fornecedor, r);

    if(r.vlDivergencia > 0) ganhos.push({item:r.itemWms, descricao:r.descricao, inventario:r.inventario, endereco:r.endereco, valor:r.vlDivergencia, diferenca:r.diferenca});
    if(r.vlDivergencia < 0) perdas.push({item:r.itemWms, descricao:r.descricao, inventario:r.inventario, endereco:r.endereco, valor:r.vlDivergencia, diferenca:r.diferenca});
  }

  ganhos.sort((a,b)=>b.valor-a.valor);
  perdas.sort((a,b)=>a.valor-b.valor);

  const perdasOrdenadasAbs = perdas.slice().sort((a,b)=>Math.abs(b.valor)-Math.abs(a.valor));
  const totalPerdasAbs = perdasOrdenadasAbs.reduce((s,x)=>s+Math.abs(x.valor),0);
  let acumulado = 0;
  const pareto = perdasOrdenadasAbs.slice(0,20).map(p=>{
    acumulado += Math.abs(p.valor);
    return {...p, pctAcumulado: totalPerdasAbs>0 ? (acumulado/totalPerdasAbs*100) : 0};
  });

  return {
    ...ind,
    itensUnicos: ind.itensUnicos.size,
    inventarios: ind.inventarios.size,
    enderecos: ind.enderecos.size,
    usuarios: ind.usuarios.size,
    saldoLiquido: ind.qtdDivergente,
    rankItens: topN(porItemRank, 20),
    rankEnderecos: topN(porEnderecoRank, 20),
    rankUsuarios: topN(porUsuarioRank, 20),
    rankInventarios: topN(porInventarioRank, 20),
    rankFamilias: topN(porFamiliaRank, 20),
    rankFornecedores: topN(porFornecedorRank, 20),
    top20Ganhos: ganhos.slice(0,20),
    top20Perdas: perdas.slice(0,20),
    maiorGanho: ganhos[0] || null,
    maiorPerda: perdas[0] || null,
    pareto
  };
}

function post(type, data){ self.postMessage({type, ...data}); }
