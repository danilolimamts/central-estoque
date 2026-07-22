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
      isCongelado: isSim(getVal(row, rCong.noInventario)),
      qtdPecas: parseNumber(getVal(row, rCong.qtdPecas)),
      qtdItens: parseNumber(getVal(row, rCong.qtdItens)),
      pesoTotal: parseNumber(getVal(row, rCong.pesoTotal)),
      filial: String(getVal(row, rCong.filial) ?? '').trim(),
      predio: String(getVal(row, rCong.predio) ?? '').trim()
    };
  }).filter(l=>l.idLocal);
  // Só locais efetivamente congelados neste ciclo entram nos cálculos —
  // QRY0114/QRY0843 podem trazer eventos de fora do escopo congelado.
  const congeladoSet = new Set(locais.filter(l=>l.isCongelado).map(l=>l.idLocal));

  post('progress', {stage:'Processando contagens (QRY0843)...', pct:35});
  const contagens = [];
  let idx843 = 0;
  for(const row of rows843){
    idx843++;
    const local = String(getVal(row, r843.local) ?? '').trim();
    const item = String(getVal(row, r843.item) ?? '').trim();
    const idConferencia = parseInt(parseNumber(getVal(row, r843.idConferencia)), 10) || 0;
    if(!local || !item || !congeladoSet.has(local)) continue;
    contagens.push({
      id: cicloId+'|'+local+'|'+item+'|'+idConferencia+'|'+idx843,
      cicloId, inventario: String(getVal(row, r843.inventario) ?? '').trim(), local,
      descricaoLocal: String(getVal(row, r843.descricaoLocal) ?? '').trim(),
      dataInicioContagem: isoDateTime(parseDateVal(getVal(row, r843.dataInicioContagem))),
      dataFimContagem: isoDateTime(parseDateVal(getVal(row, r843.dataFimContagem))),
      obsInventario: String(getVal(row, r843.obsInventario) ?? '').trim(),
      usuario: String(getVal(row, r843.usuario) ?? '').trim(),
      situacaoInventario: String(getVal(row, r843.situacaoInventario) ?? '').trim(),
      situacaoLocal: String(getVal(row, r843.situacaoLocal) ?? '').trim(),
      idConferencia, item, itemNome: String(getVal(row, r843.itemNome) ?? '').trim(),
      qtFis: parseNumber(getVal(row, r843.qtFis))
    });
  }

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

  post('progress', {stage:'Processando divergências finais (QRY0114)...', pct:65});
  const divergencias = [];
  let idx114 = 0;
  for(const row of rows114){
    idx114++;
    const local = String(getVal(row, r114.local) ?? '').trim();
    const itemWms = String(getVal(row, r114.itemWms) ?? '').trim();
    if(!itemWms || !congeladoSet.has(local)) continue;
    const diferenca = parseNumber(getVal(row, r114.diferenca));
    const vlDivergencia = parseNumber(getVal(row, r114.vlDivergencia));
    divergencias.push({
      id: cicloId+'|'+local+'|'+itemWms+'|'+idx114,
      cicloId,
      inventario: String(getVal(row, r114.inventario) ?? '').trim(), local,
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
  const indicadores = calcularIndicadores({locais, contagens, divergencias, statusPorLocal, dataAbertura, dataPrevistaTermino});

  post('progress', {stage:'Gravando dados no IndexedDB...', pct:95});
  await irClearCiclo(IR_STORES.locais, cicloId);
  await irClearCiclo(IR_STORES.contagens, cicloId);
  await irClearCiclo(IR_STORES.divergencias, cicloId);
  const CHUNK = 1500;
  await irBulkPut(IR_STORES.locais, locais);
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

function calcularIndicadores({locais, contagens, divergencias, statusPorLocal, dataAbertura, dataPrevistaTermino}){
  const congelados = locais.filter(l=>l.isCongelado);
  const locaisCongelados = congelados.length;

  const clamp01 = (n)=>Math.max(0, Math.min(1, n));

  const totalQtdeLogica = divergencias.reduce((s,d)=>s+d.qtdeLogica,0);
  const totalDiferencaAbs = divergencias.reduce((s,d)=>s+Math.abs(d.diferenca),0);
  const acuraciaPecas = clamp01(totalQtdeLogica>0 ? 1-(totalDiferencaAbs/totalQtdeLogica) : 1);

  const totalVlLogico = divergencias.reduce((s,d)=>s+d.vlLogico,0);
  const totalVlDivergenciaAbs = divergencias.reduce((s,d)=>s+Math.abs(d.vlDivergencia),0);
  const acuraciaValor = clamp01(totalVlLogico>0 ? 1-(totalVlDivergenciaAbs/totalVlLogico) : 1);

  const locaisComDivergencia = new Set(divergencias.filter(d=>d.diferenca!==0).map(d=>d.local));
  const acuraciaLocal = clamp01(locaisCongelados>0 ? 1-(locaisComDivergencia.size/locaisCongelados) : 1);

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
    locaisCongelados, locaisConcluidos, locaisPendentes, locaisEmContagem, locaisNaoIniciados,
    andamentoCiclo, acuraciaPecas, acuraciaLocal, acuraciaValor, meta: IR_META_ACURACIA,
    itensDivergentes, valorDivergenteLiquido, valorDivergenteAbsoluto,
    qtdRecontagens, tempoMedioContagemMin, diasRestantes, eficiencia,
    rankingProdutividade
  };
}
