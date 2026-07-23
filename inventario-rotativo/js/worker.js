/* ============================================================
   Web Worker — Inventário Rotativo
   Parsing (SheetJS) + cruzamento + cálculo de convergência,
   indicadores e prioridade de auditoria. Tudo fora da thread
   principal. Grava direto no IndexedDB (Workers têm acesso).
   ============================================================ */
importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
importScripts('./rules.js');
importScripts('./db.js');

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
  let m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if(m){
    let [, dd, mm, yy, H, M, S] = m;
    yy = yy.length===2 ? ('20'+yy) : yy;
    const d = new Date(+yy, +mm-1, +dd, +(H||0), +(M||0), +(S||0));
    return isNaN(d.getTime()) ? null : d;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if(m) return new Date(+m[1], +m[2]-1, +m[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function isoDate(d){ return d ? d.toISOString().slice(0,10) : ''; }
function isSim(v){ return String(v||'').trim().toUpperCase()==='SIM'; }

function buildAliasResolver(headers, aliasMap){
  const resolved = {};
  const normHeaders = headers.map(h=>({raw:h, norm: irNormKey(h)}));
  for(const canon in aliasMap){
    let found = null;
    for(const cand of aliasMap[canon]){
      const nc = irNormKey(cand);
      const hit = normHeaders.find(h=>h.norm===nc);
      if(hit){ found = hit.raw; break; }
    }
    resolved[canon] = found;
  }
  return resolved;
}
function sheetToRows(wb){
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {defval:null, raw:true});
}
function getVal(row, key){ return key ? row[key] : null; }
function validateColumns(resolved, required, label){
  const missing = required.filter(k=>!resolved[k]);
  if(missing.length) throw new Error(`${label}: colunas obrigatórias não encontradas: ${missing.join(', ')}`);
}

const ALIAS_390 = {
  item: ['Item'], descricao: ['Descrição','Descricao'], codTerceiro: ['Cod Terceiro'],
  local: ['Local'], situacao: ['Situação','Situacao'], quantidade: ['Quantidade'], classeSku: ['Classe Sku']
};
const ALIAS_114 = {
  inventario: ['Inventário','Inventario'], local: ['Local'], endereco: ['Endereco','Endereço'],
  situacao: ['Situação','Situacao'], itemWms: ['Item WMS'], itemSige: ['Item SIGE'],
  descricao: ['Descricão','Descrição'], ean: ['EAN'], codTerceiro: ['Cod.Terceiro'],
  qtdeLogica: ['Qtde. Lógica','Qtde. Logica'], qtdeFisica: ['Qtde. Fisica','Qtde. Física'],
  diferenca: ['Diferença','Diferenca'], vlLogico: ['Vl. Lógico'], vlFisico: ['Vl. Físico'],
  vlDivergencia: ['Vl. Divergência'], dataInicio: ['Data inicio'], dataFim: ['Data Fim'], usuario: ['Usuario','Usuário']
};
const ALIAS_843 = {
  inventario: ['Inventario','Inventário'], local: ['Local'], descricaoLocal: ['Descrição Local'],
  dataInicioContagem: ['Data Inicio Contagem','Data Início Contagem'], dataFimContagem: ['Data Fim Contagem'],
  obsInventario: ['Obs Inventario','Obs Inventário'], usuario: ['Usuário Conferencia','Usuario Conferencia'],
  situacaoInventario: ['Situação Inventario'], situacaoLocal: ['Situação Local'],
  idConferencia: ['Id Conferencia'], item: ['Id Item'], itemNome: ['Item Nome'], qtFis: ['QT_FIS']
};
const ALIAS_CONGELADA = {
  idLocal: ['Id Local'], descricao: ['Descrição','Descricao'], x1: ['X1'], x2: ['X2'],
  grupoClasse: ['Grupo Classe'], classeLocal: ['Classe Local'], regiao: ['Região','Regiao'],
  habilitado: ['Habilitado?','Habilitado'], estado: ['Estado'], noInventario: ['Inventario?','Inventário?'],
  qtdPecas: ['Qtd Peças','Qtd Pecas'], qtdItens: ['Qtd Itens'], pesoTotal: ['Peso Total'],
  filial: ['Filial'], predio: ['Predio','Prédio']
};

self.onmessage = async (e)=>{
  const msg = e.data;
  if(msg.type !== 'process') return;
  try{ await runPipeline(msg); }
  catch(err){ self.postMessage({type:'error', message: err.message||String(err)}); }
};
function post(type, data){ self.postMessage({type, ...data}); }

async function runPipeline({buf390, buf114, buf843, bufCongelada, cicloId, cicloNumero, dataAbertura, dataPrevistaTermino, prioridadeConfig}){
  post('progress', {stage:'Lendo planilhas...', pct:2});
  const wb390 = XLSX.read(buf390, {type:'array', cellDates:true});
  const wb114 = XLSX.read(buf114, {type:'array', cellDates:true});
  const wb843 = XLSX.read(buf843, {type:'array', cellDates:true});
  const wbCong = XLSX.read(bufCongelada, {type:'array', cellDates:true});

  const rows390 = sheetToRows(wb390);
  const rows114 = sheetToRows(wb114);
  const rows843 = sheetToRows(wb843);
  const rowsCong = sheetToRows(wbCong);

  if(!rows390.length) throw new Error('QRY0390: planilha vazia.');
  if(!rows114.length) throw new Error('QRY0114: planilha vazia.');
  if(!rows843.length) throw new Error('QRY0843: planilha vazia.');
  if(!rowsCong.length) throw new Error('Base congelada: planilha vazia.');

  const r390 = buildAliasResolver(Object.keys(rows390[0]), ALIAS_390);
  const r114 = buildAliasResolver(Object.keys(rows114[0]), ALIAS_114);
  const r843 = buildAliasResolver(Object.keys(rows843[0]), ALIAS_843);
  const rCong = buildAliasResolver(Object.keys(rowsCong[0]), ALIAS_CONGELADA);

  validateColumns(r390, ['item','local','quantidade'], 'QRY0390');
  validateColumns(r114, ['inventario','local','itemWms','diferenca','vlDivergencia'], 'QRY0114');
  validateColumns(r843, ['local','item','idConferencia','qtFis','usuario'], 'QRY0843');
  validateColumns(rCong, ['idLocal','noInventario'], 'Base congelada');

  post('progress', {stage:'Indexando estoque atual (QRY0390)...', pct:10});
  const map390 = new Map();
  for(const row of rows390){
    const item = String(getVal(row, r390.item) ?? '').trim();
    if(!item) continue;
    const qtd = parseNumber(getVal(row, r390.quantidade));
    map390.set(item, (map390.get(item)||0) + qtd);
  }

  post('progress', {stage:'Processando base congelada...', pct:20});
  const locais = rowsCong.map(row=>{
    const idLocal = String(getVal(row, rCong.idLocal) ?? '').trim();
    return {
      id: cicloId+'|'+idLocal, cicloId, idLocal,
      descricao: String(getVal(row, rCong.descricao) ?? '').trim(),
      x1: String(getVal(row, rCong.x1) ?? '').trim(),
      x2: String(getVal(row, rCong.x2) ?? '').trim(),
      grupoClasse: String(getVal(row, rCong.grupoClasse) ?? '').trim(),
      classeLocal: String(getVal(row, rCong.classeLocal) ?? '').trim(),
      regiao: String(getVal(row, rCong.regiao) ?? '').trim(),
      habilitado: isSim(getVal(row, rCong.habilitado)),
      estado: String(getVal(row, rCong.estado) ?? '').trim(),
      isCongelado: true,
      qtdPecas: parseNumber(getVal(row, rCong.qtdPecas)),
      qtdItens: parseNumber(getVal(row, rCong.qtdItens)),
      pesoTotal: parseNumber(getVal(row, rCong.pesoTotal)),
      filial: String(getVal(row, rCong.filial) ?? '').trim(),
      predio: String(getVal(row, rCong.predio) ?? '').trim()
    };
  }).filter(l=>l.idLocal);
  // "Locais Orçados" = universo inteiro da Base Congelada (todo o CD), não um flag
  // específico dela — a coluna "Inventário?" é usada pelo usuário para outra finalidade.

  post('progress', {stage:'Processando contagens (QRY0843)...', pct:35});
  const contagens = [];
  let idx843 = 0;
  for(const row of rows843){
    idx843++;
    const local = String(getVal(row, r843.local) ?? '').trim();
    const item = String(getVal(row, r843.item) ?? '').trim();
    const idConferencia = parseInt(parseNumber(getVal(row, r843.idConferencia)), 10) || 0;
    const obsInventario = String(getVal(row, r843.obsInventario) ?? '').trim();
    const situacaoInventario = String(getVal(row, r843.situacaoInventario) ?? '').trim();
    const situacaoLocal = String(getVal(row, r843.situacaoLocal) ?? '').trim();
    if(!local || !item) continue;
    // Só eventos de Ajuste Inventário Rotativo (Obs começando em "AIR") entram no ciclo —
    // outras tratativas na mesma planilha (ex.: "ADE - Ajuste Auditoria de Estoque") não são deste módulo.
    if(!/^AIR/i.test(obsInventario)) continue;
    // "Contado" de verdade só quando o local E o inventário foram liquidados — sessões
    // Canceladas (ex.: reabertas depois) não contam como contagem válida.
    if(situacaoLocal!=='Liquidado' || situacaoInventario!=='Liquidado') continue;
    contagens.push({
      id: cicloId+'|'+local+'|'+item+'|'+idConferencia+'|'+idx843,
      cicloId, inventario: String(getVal(row, r843.inventario) ?? '').trim(), local,
      descricaoLocal: String(getVal(row, r843.descricaoLocal) ?? '').trim(),
      dataInicioContagem: isoDateTime(parseDateVal(getVal(row, r843.dataInicioContagem))),
      dataFimContagem: isoDateTime(parseDateVal(getVal(row, r843.dataFimContagem))),
      obsInventario, situacaoInventario, situacaoLocal,
      usuario: String(getVal(row, r843.usuario) ?? '').trim(),
      idConferencia, item, itemNome: String(getVal(row, r843.itemNome) ?? '').trim(),
      qtFis: parseNumber(getVal(row, r843.qtFis))
    });
  }
  // Inventários (nº de sessão de contagem) reconhecidos como Ajuste Inventário Rotativo
  // (AIR) e liquidados nesta importação — usado para herdar o mesmo filtro na QRY0114,
  // que não tem coluna de Observação/Situação. O cruzamento é pelo Inventário (não pelo
  // Local): o mesmo Local pode aparecer em ajustes de outros tipos ao longo do tempo,
  // então só o nº do inventário garante que a divergência é da mesma sessão AIR liquidada.
  const airInventarioSet = new Set(contagens.map(c=>c.inventario));

  post('progress', {stage:'Calculando convergência por local...', pct:50});
  const porLocal = new Map();
  for(const c of contagens){
    if(!porLocal.has(c.local)) porLocal.set(c.local, []);
    porLocal.get(c.local).push(c);
  }
  const statusPorLocal = new Map(); // local -> {status, rodadas}
  for(const [local, lista] of porLocal){
    const rodadas = Array.from(new Set(lista.map(c=>c.idConferencia))).sort((a,b)=>a-b);
    const maxRodada = rodadas[rodadas.length-1] || 0;
    let status = 'em_contagem';
    if(maxRodada <= 1){
      status = 'em_contagem';
    } else {
      const atual = lista.filter(c=>c.idConferencia===maxRodada);
      const anterior = lista.filter(c=>c.idConferencia===maxRodada-1);
      const mapAtual = new Map(atual.map(c=>[c.item, c.qtFis]));
      const mapAnterior = new Map(anterior.map(c=>[c.item, c.qtFis]));
      const todosItens = new Set([...mapAtual.keys(), ...mapAnterior.keys()]);
      let bateu = todosItens.size>0;
      for(const it of todosItens){
        if((mapAtual.get(it)??null) !== (mapAnterior.get(it)??null)){ bateu = false; break; }
      }
      if(bateu) status = 'convergido';
      else if(maxRodada>=5) status = 'encerrado_sem_convergencia';
      else status = 'em_contagem';
    }
    statusPorLocal.set(local, {status, rodadas: maxRodada});
  }
  // Peças físicas totais por local = soma do QT_FIS de todos os itens na ÚLTIMA rodada
  // de contagem do local (a "foto" mais recente do que tem fisicamente ali). Usado como
  // denominador da Acurácia Peças — a QRY0114 sozinha só traz os itens que passaram pela
  // liquidação/divergência, não o total físico do local.
  // A rodada final varia por ITEM, não só por local: um item pode ter parado de ser
  // recontado antes da última rodada do local (ex.: já bateu e não precisou repetir).
  // Por isso pegamos, para cada item dentro do local, a rodada mais alta em que ELE
  // foi contado — não a rodada máxima do local aplicada a todos os itens.
  const pecasFisicasPorLocal = new Map();
  for(const [local, lista] of porLocal){
    const ultimaPorItem = new Map(); // item -> {rodada, qt}
    for(const c of lista){
      const atual = ultimaPorItem.get(c.item);
      if(!atual || c.idConferencia>atual.rodada) ultimaPorItem.set(c.item, {rodada:c.idConferencia, qt:c.qtFis});
    }
    let total = 0;
    for(const v of ultimaPorItem.values()) total += v.qt;
    pecasFisicasPorLocal.set(local, total);
  }

  post('progress', {stage:'Processando divergências finais (QRY0114)...', pct:65});
  const divergencias = [];
  let idx114 = 0;
  for(const row of rows114){
    idx114++;
    const local = String(getVal(row, r114.local) ?? '').trim();
    const itemWms = String(getVal(row, r114.itemWms) ?? '').trim();
    const inventario114 = String(getVal(row, r114.inventario) ?? '').trim();
    if(!itemWms || !airInventarioSet.has(inventario114)) continue;
    const diferenca = parseNumber(getVal(row, r114.diferenca));
    const vlDivergencia = parseNumber(getVal(row, r114.vlDivergencia));
    divergencias.push({
      id: cicloId+'|'+local+'|'+itemWms+'|'+idx114,
      cicloId,
      inventario: inventario114, local,
      endereco: String(getVal(row, r114.endereco) ?? '').trim(),
      situacao: String(getVal(row, r114.situacao) ?? '').trim(),
      item: itemWms, itemSige: String(getVal(row, r114.itemSige) ?? '').trim(),
      descricao: String(getVal(row, r114.descricao) ?? '').trim(),
      ean: String(getVal(row, r114.ean) ?? '').trim(),
      codTerceiro: String(getVal(row, r114.codTerceiro) ?? '').trim(),
      qtdeLogica: parseNumber(getVal(row, r114.qtdeLogica)),
      qtdeFisica: parseNumber(getVal(row, r114.qtdeFisica)),
      diferenca, vlLogico: parseNumber(getVal(row, r114.vlLogico)), vlFisico: parseNumber(getVal(row, r114.vlFisico)),
      vlDivergencia,
      dataInicio: isoDate(parseDateVal(getVal(row, r114.dataInicio))), dataFim: isoDate(parseDateVal(getVal(row, r114.dataFim))),
      usuario: String(getVal(row, r114.usuario) ?? '').trim(),
      statusLocal: (statusPorLocal.get(local)||{status:'em_contagem'}).status,
      rodadasLocal: (statusPorLocal.get(local)||{rodadas:0}).rodadas,
      diagnostico: diferenca!==0 ? 'divergente' : 'correto'
    });
  }

  post('progress', {stage:'Calculando prioridade de auditoria...', pct:78});
  // reincidência: item já teve divergência em ciclo anterior?
  const ciclosAnteriores = (await irGetAllCiclos()).filter(c=>c.id!==cicloId);
  const itensReincidentes = new Set();
  for(const c of ciclosAnteriores){
    const divsAnt = await irGetByCiclo(IR_STORES.divergencias, c.id);
    divsAnt.forEach(d=>{ if(d.diferenca!==0) itensReincidentes.add(d.item); });
  }
  const porItem = new Map();
  for(const d of divergencias){
    if(d.diferenca===0) continue;
    let g = porItem.get(d.item);
    if(!g) g = {valorAbs:0, qtdAbs:0, locais:new Set()};
    g.valorAbs += Math.abs(d.vlDivergencia);
    g.qtdAbs += Math.abs(d.diferenca);
    g.locais.add(d.local);
    porItem.set(d.item, g);
  }
  const maxValor = Math.max(1, ...Array.from(porItem.values()).map(g=>g.valorAbs));
  const maxQtd = Math.max(1, ...Array.from(porItem.values()).map(g=>g.qtdAbs));
  for(const d of divergencias){
    if(d.diferenca===0){ d.prioridade = 0; continue; }
    const g = porItem.get(d.item);
    const nValor = g.valorAbs/maxValor;
    const nQtd = g.qtdAbs/maxQtd;
    const nRecontagens = Math.min(1, Math.max(0, (d.rodadasLocal-2))/3);
    const nReincidencia = itensReincidentes.has(d.item) ? 1 : 0;
    d.prioridade = irCalcularPrioridade(prioridadeConfig, nValor, nQtd, nRecontagens, nReincidencia);
  }

  post('progress', {stage:'Calculando indicadores...', pct:90});
  const indicadores = calcularIndicadores({congelados: locais, contagens, divergencias, statusPorLocal, pecasFisicasPorLocal, dataAbertura, dataPrevistaTermino});

  post('progress', {stage:'Gravando dados no IndexedDB...', pct:95});
  await irClearCiclo(IR_STORES.locais, cicloId);
  await irClearCiclo(IR_STORES.contagens, cicloId);
  await irClearCiclo(IR_STORES.divergencias, cicloId);
  const CHUNK = 1500;
  for(let i=0;i<locais.length;i+=CHUNK) await irBulkPut(IR_STORES.locais, locais.slice(i,i+CHUNK));
  for(let i=0;i<contagens.length;i+=CHUNK) await irBulkPut(IR_STORES.contagens, contagens.slice(i,i+CHUNK));
  for(let i=0;i<divergencias.length;i+=CHUNK) await irBulkPut(IR_STORES.divergencias, divergencias.slice(i,i+CHUNK));
  await irSaveIndicadores(cicloId, indicadores);
  await irSaveImportMeta(cicloId, {
    totalLocaisCongelados: indicadores.locaisCongelados,
    totalContagens: contagens.length,
    totalDivergencias: divergencias.filter(d=>d.diferenca!==0).length
  });

  post('progress', {stage:'Concluído.', pct:100});
  self.postMessage({type:'done', indicadores, totalDivergencias: divergencias.filter(d=>d.diferenca!==0).length, totalLocais: locais.length});
}

function isoDateTime(d){ return d ? d.toISOString() : ''; }

function calcularIndicadores({congelados, contagens, divergencias, statusPorLocal, pecasFisicasPorLocal, dataAbertura, dataPrevistaTermino}){
  const locaisCongelados = congelados.length;

  const clamp01 = (n)=>Math.max(0, Math.min(1, n));

  // Denominador da Acurácia Peças = peças físicas totais nos locais congelados (última
  // rodada de contagem por local), não a "Qtde. Lógica" da QRY0114 — essa planilha só
  // traz os itens que passaram pela liquidação/divergência, não o total físico do local.
  const totalPecasFisicas = congelados.reduce((s,l)=>s+(pecasFisicasPorLocal.get(l.idLocal)||0), 0);
  const totalDiferencaAbs = divergencias.reduce((s,d)=>s+Math.abs(d.diferenca),0);
  const acuraciaPecas = clamp01(totalPecasFisicas>0 ? 1-(totalDiferencaAbs/totalPecasFisicas) : 1);

  const totalVlLogico = divergencias.reduce((s,d)=>s+d.vlLogico,0);
  const totalVlDivergenciaAbs = divergencias.reduce((s,d)=>s+Math.abs(d.vlDivergencia),0);
  const acuraciaValor = clamp01(totalVlLogico>0 ? 1-(totalVlDivergenciaAbs/totalVlLogico) : 1);

  // Acurácia Local (Posições) é medida sobre os locais CONTADOS (liquidados), não sobre
  // o total orçado do CD — mesma regra da Acurácia Peças/Valor ("1 − divergência ÷ total contado").
  const locaisContadosTotal = statusPorLocal.size;
  const locaisComDivergencia = new Set(divergencias.filter(d=>d.diferenca!==0).map(d=>d.local));
  const acuraciaLocal = clamp01(locaisContadosTotal>0 ? 1-(locaisComDivergencia.size/locaisContadosTotal) : 1);

  let locaisConcluidos = 0, locaisPendentes = 0, locaisEmContagem = 0, locaisNaoIniciados = 0;
  for(const l of congelados){
    const st = statusPorLocal.get(l.idLocal);
    if(!st){ locaisNaoIniciados++; continue; }
    if(st.status==='convergido' || st.status==='encerrado_sem_convergencia') locaisConcluidos++;
    else locaisEmContagem++;
  }
  locaisPendentes = locaisCongelados - locaisConcluidos;
  const andamentoCiclo = locaisCongelados>0 ? locaisConcluidos/locaisCongelados : 0;

  const itensDivergentes = divergencias.filter(d=>d.diferenca!==0).length;
  const valorDivergenteLiquido = divergencias.reduce((s,d)=>s+d.vlDivergencia,0);
  const valorDivergenteAbsoluto = totalVlDivergenciaAbs;

  let qtdRecontagens = 0;
  for(const [, st] of statusPorLocal) if(st.rodadas>2) qtdRecontagens++;

  const contagensFisicas = contagens.filter(c=>c.idConferencia>=2 && c.dataInicioContagem && c.dataFimContagem);
  let somaMin = 0, nMin = 0;
  for(const c of contagensFisicas){
    const ini = new Date(c.dataInicioContagem).getTime(), fim = new Date(c.dataFimContagem).getTime();
    if(fim>ini){ somaMin += (fim-ini)/60000; nMin++; }
  }
  const tempoMedioContagemMin = nMin>0 ? somaMin/nMin : 0;

  const hoje = new Date();
  const abertura = dataAbertura ? new Date(dataAbertura) : hoje;
  const termino = dataPrevistaTermino ? new Date(dataPrevistaTermino) : null;
  const diasDecorridos = Math.max(1, Math.round((hoje-abertura)/86400000));
  const ritmoLocaisPorDia = locaisConcluidos/diasDecorridos;
  const diasRestantes = ritmoLocaisPorDia>0 ? Math.ceil(locaisPendentes/ritmoLocaisPorDia) : null;

  let eficiencia = 0;
  if(termino){
    const diasTotalPlanejados = Math.max(1, Math.round((termino-abertura)/86400000));
    const locaisEsperadosHoje = Math.min(locaisCongelados, locaisCongelados * Math.min(1, diasDecorridos/diasTotalPlanejados));
    const idxQualidade = Math.min(1, acuraciaLocal/IR_META_ACURACIA);
    const idxVelocidade = locaisEsperadosHoje>0 ? Math.min(1, locaisConcluidos/locaisEsperadosHoje) : 1;
    eficiencia = 0.6*idxQualidade + 0.4*idxVelocidade;
  }

  // Quebra por Rua (X1 da Base Congelada) e por Log (Grupo Classe) — espelha os
  // relatórios de referência do usuário. "Posições" aqui é medida sobre os locais
  // já contados no grupo (não sobre o total congelado), igual ao relatório de origem.
  const locaisContadosSet = new Set(Array.from(statusPorLocal.keys()));
  function calcAcuraciasSubset(divs, locaisDoGrupo, baseLocais){
    const totalPecasGrupo = locaisDoGrupo.reduce((s,l)=>s+(pecasFisicasPorLocal.get(l.idLocal)||0), 0);
    const totalDiferencaAbs = divs.reduce((s,d)=>s+Math.abs(d.diferenca),0);
    const acuraciaPecas = clamp01(totalPecasGrupo>0 ? 1-(totalDiferencaAbs/totalPecasGrupo) : 1);
    const totalVlLogico = divs.reduce((s,d)=>s+d.vlLogico,0);
    const totalVlDivergenciaAbs = divs.reduce((s,d)=>s+Math.abs(d.vlDivergencia),0);
    const acuraciaValor = clamp01(totalVlLogico>0 ? 1-(totalVlDivergenciaAbs/totalVlLogico) : 1);
    const locaisComDivergencia = new Set(divs.filter(d=>d.diferenca!==0).map(d=>d.local));
    const acuraciaPosicoes = clamp01(baseLocais>0 ? 1-(locaisComDivergencia.size/baseLocais) : 1);
    return {
      acuraciaPecas, acuraciaValor, acuraciaPosicoes,
      pecasContadas: totalPecasGrupo, pecasDivergentes: totalDiferencaAbs,
      locaisDivergentes: locaisComDivergencia.size,
      valorDivergenteLiquido: divs.reduce((s,d)=>s+d.vlDivergencia,0),
      valorDivergenteAbsoluto: totalVlDivergenciaAbs
    };
  }
  function agruparPor(campo, rotuloVazio){
    const chaves = Array.from(new Set(congelados.map(l=>l[campo] || rotuloVazio)));
    return chaves.map(chave=>{
      const locaisDoGrupo = congelados.filter(l=>(l[campo]||rotuloVazio)===chave);
      const idsGrupo = new Set(locaisDoGrupo.map(l=>l.idLocal));
      const locaisOrcados = locaisDoGrupo.length;
      const locaisContados = locaisDoGrupo.filter(l=>locaisContadosSet.has(l.idLocal)).length;
      const divsGrupo = divergencias.filter(d=>idsGrupo.has(d.local));
      return {
        chave, locaisOrcados, locaisContados,
        pctContado: locaisOrcados>0 ? locaisContados/locaisOrcados : 0,
        ...calcAcuraciasSubset(divsGrupo, locaisDoGrupo, locaisContados)
      };
    }).sort((a,b)=>b.locaisOrcados-a.locaisOrcados);
  }
  const porRua = agruparPor('x1', '(sem rua)');
  const porLog = agruparPor('grupoClasse', '(sem log)');

  // Locais distintos contados por dia (contagens já filtradas por AIR + Liquidado;
  // exclui a rodada 1 = abertura). Conta o LOCAL uma vez por dia, não a linha/item.
  const porDiaMap = new Map();
  for(const c of contagens){
    if(c.idConferencia<=1 || !c.dataInicioContagem) continue;
    const dia = c.dataInicioContagem.slice(0,10);
    if(!porDiaMap.has(dia)) porDiaMap.set(dia, new Set());
    porDiaMap.get(dia).add(c.local);
  }
  const contadosPorDia = Array.from(porDiaMap.entries())
    .map(([dia,set])=>({dia, total:set.size}))
    .sort((a,b)=>a.dia.localeCompare(b.dia));

  // Saldo líquido por item (para ranking de maiores sobras/faltas)
  const porItemSaldo = new Map();
  for(const d of divergencias){
    if(d.diferenca===0) continue;
    let g = porItemSaldo.get(d.item);
    if(!g) g = {item:d.item, descricao:d.descricao, saldoQtd:0, saldoValor:0, locais:new Set()};
    g.saldoQtd += d.diferenca;
    g.saldoValor += d.vlDivergencia;
    g.locais.add(d.local);
    porItemSaldo.set(d.item, g);
  }
  const itensSaldo = Array.from(porItemSaldo.values()).map(g=>({...g, locais:g.locais.size}));
  const topItensPositivos = itensSaldo.filter(i=>i.saldoQtd>0).sort((a,b)=>b.saldoQtd-a.saldoQtd).slice(0,10);
  const topItensNegativos = itensSaldo.filter(i=>i.saldoQtd<0).sort((a,b)=>a.saldoQtd-b.saldoQtd).slice(0,10);

  // Produtividade por colaborador (exclui contagem 1 = abertura)
  const porUsuario = new Map();
  for(const c of contagens){
    if(c.idConferencia<=1 || !c.usuario) continue;
    let g = porUsuario.get(c.usuario);
    if(!g) g = {locais:new Set(), itens:0, contagens:0, minutos:0, nMin:0};
    g.locais.add(c.local); g.itens++; g.contagens++;
    if(c.dataInicioContagem && c.dataFimContagem){
      const ini=new Date(c.dataInicioContagem).getTime(), fim=new Date(c.dataFimContagem).getTime();
      if(fim>ini){ g.minutos += (fim-ini)/60000; g.nMin++; }
    }
    porUsuario.set(c.usuario, g);
  }
  const rankingProdutividade = Array.from(porUsuario.entries()).map(([usuario,g])=>({
    usuario, locais: g.locais.size, itens: g.itens, contagens: g.contagens,
    tempoMedioMin: g.nMin>0 ? g.minutos/g.nMin : 0
  })).sort((a,b)=>b.locais-a.locais);

  return {
    locaisCongelados, locaisContadosTotal, locaisConcluidos, locaisPendentes, locaisEmContagem, locaisNaoIniciados,
    andamentoCiclo, acuraciaPecas, acuraciaLocal, acuraciaValor, meta: IR_META_ACURACIA,
    itensDivergentes, valorDivergenteLiquido, valorDivergenteAbsoluto,
    pecasContadas: totalPecasFisicas, pecasDivergentes: totalDiferencaAbs,
    qtdRecontagens, tempoMedioContagemMin, diasRestantes, eficiencia,
    rankingProdutividade, porRua, porLog, contadosPorDia, topItensPositivos, topItensNegativos
  };
}
