/* ============================================================
   Equalizacao (secao 7.1, 7.2 e 7.3 do brief).
   Casa Base com Coluna por conjunto (Chave) usando somente o
   saldo do CD. Reversa, DS e Outros ficam de fora do calculo e
   aparecem apenas como alerta.
   ============================================================ */
import type { Componente, Conjunto, StatusConjunto } from './tipos';
import { ratioDaTonelada, TIPO_BASE, TIPO_COLUNA } from '../config/regras';
import { montarKit, faltamDoTipo, porKitDe } from './kit';
import type { MontagemDoKit } from './kit';

/* Normaliza o tipo de componente para comparar de forma estrita.
   So BASE e COLUNA entram no kit (regressao 8.2: BOMBA, COMANDO e MOTOR
   nao podem ser contados como coluna). */
export function tipoComponente(c: Componente): 'BASE' | 'COLUNA' | 'OUTRO' {
  const t = String(c.componenteBaseColuna ?? '').trim().toUpperCase();
  if (t === TIPO_BASE) return 'BASE';
  if (t === TIPO_COLUNA) return 'COLUNA';
  return 'OUTRO';
}

/* Componentes do par, separados pelo item pai a que pertencem.

   O conjunto (Chave) reune varios itens pai. Cada um tem a sua propria
   composicao, entao a conta so pode ser feita item a item: somar as
   bases de todos e as colunas de todos antes de comparar trata peca de
   um elevador como se servisse em outro. */
function paresPorItemPai(componentes: Componente[]): Map<string, Componente[]> {
  const porItem = new Map<string, Componente[]>();
  for (const c of componentes) {
    if (tipoComponente(c) === 'OUTRO') continue;
    const pai = String(c.itemVolMultiplo ?? '').trim();
    if (!pai) continue;
    const lista = porItem.get(pai);
    if (lista) lista.push(c);
    else porItem.set(pai, [c]);
  }
  return porItem;
}

function montarDoPai(lista: Componente[]): MontagemDoKit {
  return montarKit(
    lista.map((c) => ({
      codigo: String(c.itemComponente ?? '').trim(),
      nome: c.nomeItemComponente,
      tipo: tipoComponente(c),
      porKit: porKitDe(c),
      saldo: c.cd,
    }))
  );
}

/* 7.3 Calculo de um conjunto.

   A compra e o casamento saem da composicao de cada item pai, e nao do
   ratio da tonelada. O ratio dizia que todo produto de 4 t leva duas
   colunas por base; a rampa de 4 t leva uma so. Com 5 bases e 5 colunas
   casadas, a regra antiga pedia 10 colunas, acusava falta de 5 e
   marcava o conjunto como descasado. A quantidade por kit ja vem na
   planilha, componente a componente - e dela que sai a conta.

   O ratio continua no retorno porque as telas ainda o exibem como
   referencia da tonelada, mas nao manda mais em nada. */
export function calcularConjunto(params: {
  chave: string;
  marca: string;
  fabricante: string;
  toneladaFixa: string;
  baseCD: number;
  colCD: number;
  reversa: number;
  ds: number;
  outros: number;
  componentes: Componente[];
}): Conjunto {
  const { chave, marca, fabricante, toneladaFixa, baseCD, colCD, reversa, ds, outros, componentes } = params;
  const ratio = ratioDaTonelada(toneladaFixa);

  let comprarBase = 0;
  let comprarColuna = 0;
  let kits = 0;
  for (const lista of paresPorItemPai(componentes).values()) {
    const montagem = montarDoPai(lista);
    comprarBase += faltamDoTipo(montagem, 'BASE');
    comprarColuna += faltamDoTipo(montagem, 'COLUNA');
    kits += montagem.kits;
  }

  /* Quantas colunas o conjunto precisaria ter para fechar o alvo: o
     que ja esta no CD mais o que falta comprar. */
  const colunasNecessarias = colCD + comprarColuna;
  /* Positivo falta coluna, negativo sobra coluna - a mesma leitura de
     antes, agora vinda da composicao. */
  const deficit = comprarColuna - comprarBase;
  /* Um conjunto pode precisar de base em um item e de coluna em outro.
     Nesse caso o deficit se anula, e so a soma diz que falta peca. */
  const faltaPeca = comprarBase + comprarColuna > 0;

  let status: StatusConjunto;
  if (baseCD === 0 && colCD === 0) {
    status = 'SEM ESTOQUE';
  } else if (!faltaPeca && reversa > 0) {
    // Casado, mas ha saldo na reversa: nao da para afirmar que esta
    // equalizado ate validar o que esta la (secao 7.3).
    status = 'REVERSA';
  } else if (!faltaPeca) {
    status = 'CASADO';
  } else {
    status = 'DESCASADO';
  }

  return {
    chave,
    marca,
    fabricante,
    toneladaFixa,
    ratio,
    baseCD,
    colCD,
    reversa,
    ds,
    outros,
    colunasNecessarias,
    deficit,
    kits,
    status,
    comprarBase,
    comprarColuna,
    componentes,
  };
}

/* 7.1 Agrupa os componentes pela coluna Chave (Marca + Fabricante +
   Tonelada) e calcula cada conjunto. */
export function agruparConjuntos(componentes: Componente[]): Conjunto[] {
  const grupos = new Map<string, Componente[]>();
  for (const c of componentes) {
    const chave = String(c.chave ?? '').trim();
    if (!chave) continue;
    const lista = grupos.get(chave);
    if (lista) lista.push(c);
    else grupos.set(chave, [c]);
  }

  const conjuntos: Conjunto[] = [];
  for (const [chave, lista] of grupos) {
    let baseCD = 0;
    let colCD = 0;
    let reversa = 0;
    let ds = 0;
    let outros = 0;
    for (const c of lista) {
      const tipo = tipoComponente(c);
      if (tipo === 'OUTRO') continue; // fora do kit
      baseCD += tipo === 'BASE' ? c.cd : 0;
      colCD += tipo === 'COLUNA' ? c.cd : 0;
      reversa += c.reversa;
      ds += c.ds;
      outros += c.outros;
    }
    const ref = lista[0];
    conjuntos.push(
      calcularConjunto({
        chave,
        marca: ref.marca,
        fabricante: ref.fabricante,
        toneladaFixa: ref.toneladaFixa,
        baseCD,
        colCD,
        reversa,
        ds,
        outros,
        componentes: lista,
      })
    );
  }
  return conjuntos;
}

/* Quantidade de elevadores de um item pai.

   O item pai nao tem saldo proprio: o que existe no CD sao os
   componentes dele. Elevador montado e quantos kits a composicao
   sustenta - manda o componente mais escasso.

   Antes esta conta somava as bases de um lado, as colunas do outro e
   usava o ratio da tonelada. Isso tratava colunas diferentes do mesmo
   kit como intercambiaveis e exigia duas colunas de todo produto de
   4 t, mesmo dos que levam uma so. Agora sai da quantidade por kit de
   cada componente, que ja vem na planilha. */
export interface ContagemItem {
  bases: number;
  colunas: number;
  ratio: number;
  completos: number;
  /* Kits que dariam se o componente escasso fosse reposto. */
  alvo: number;
  /* Pecas soltas que nao formam elevador por falta do outro lado. */
  basesSobrando: number;
  colunasSobrando: number;
}

export function contarElevadoresPorItem(componentes: Componente[]): Map<string, ContagemItem> {
  /* Junta os componentes de cada item pai antes de contar: a conta e
     por composicao, nao por soma de tipo. */
  const porItem = new Map<string, Componente[]>();
  for (const c of componentes) {
    const item = String(c.itemVolMultiplo ?? '').trim();
    if (!item) continue;
    if (tipoComponente(c) === 'OUTRO') continue;
    const lista = porItem.get(item);
    if (lista) lista.push(c);
    else porItem.set(item, [c]);
  }

  const contagem = new Map<string, ContagemItem>();
  for (const [item, lista] of porItem) {
    const montagem = montarKit(
      lista.map((c) => ({
        codigo: String(c.itemComponente ?? '').trim(),
        nome: c.nomeItemComponente,
        tipo: tipoComponente(c),
        porKit: porKitDe(c),
        saldo: c.cd,
      }))
    );

    const bases = lista.filter((c) => tipoComponente(c) === 'BASE').reduce((s, c) => s + c.cd, 0);
    const colunas = lista.filter((c) => tipoComponente(c) === 'COLUNA').reduce((s, c) => s + c.cd, 0);
    /* Quantos kits a composicao sustenta. Kit sem base cadastrada nao
       precisa de base: quem define o que o produto leva e a estrutura
       do item, nao a expectativa de que todo elevador tenha as duas
       pecas. */
    const completos = montagem.kits;

    contagem.set(item, {
      bases,
      colunas,
      ratio: ratioDaTonelada(lista[0].toneladaFixa),
      completos,
      alvo: montagem.alvo,
      /* Sobra e o saldo que os kits montados nao consumiram. */
      basesSobrando: montagem.componentes
        .filter((m) => m.tipo === 'BASE')
        .reduce((s, m) => s + Math.max(0, m.saldo - completos * m.porKit), 0),
      colunasSobrando: montagem.componentes
        .filter((m) => m.tipo === 'COLUNA')
        .reduce((s, m) => s + Math.max(0, m.saldo - completos * m.porKit), 0),
    });
  }
  return contagem;
}

export interface ResumoEqualizacao {
  conjuntos: Conjunto[];
  comConjuntoNoCD: number; // conjuntos com algum saldo no CD
  casados: number;
  totalComprarBase: number;
  totalComprarColuna: number;
  totalReversa: number;
  /* Unidades de base e coluna no CD, para a reversa poder ser lida
     como proporcao e nao so como numero solto. */
  totalCD: number;
  /* Quanto do estoque esta na reversa: reversa sobre CD mais reversa. */
  pctReversa: number;
  /* Conjuntos com alguma unidade na reversa. */
  conjuntosComReversa: number;
  /* Conjuntos que fechariam se a reversa estivesse resolvida: o par ja
     esta casado e so o saldo sem lastro impede afirmar que esta
     equalizado. E o que a reversa esta efetivamente travando. */
  travadosPelaReversa: number;
  pctTravadosPelaReversa: number;
}

export function resumirEqualizacao(conjuntos: Conjunto[]): ResumoEqualizacao {
  let comConjuntoNoCD = 0;
  let casados = 0;
  let totalComprarBase = 0;
  let totalComprarColuna = 0;
  let totalReversa = 0;
  let totalCD = 0;
  let conjuntosComReversa = 0;
  let travadosPelaReversa = 0;
  for (const c of conjuntos) {
    if (c.baseCD !== 0 || c.colCD !== 0) comConjuntoNoCD++;
    if (c.status === 'CASADO') casados++;
    if (c.status === 'REVERSA') travadosPelaReversa++;
    if (c.reversa > 0) conjuntosComReversa++;
    totalComprarBase += c.comprarBase;
    totalComprarColuna += c.comprarColuna;
    totalReversa += c.reversa;
    totalCD += c.baseCD + c.colCD;
  }
  const emEstoque = totalCD + totalReversa;
  return {
    conjuntos,
    comConjuntoNoCD,
    casados,
    totalComprarBase,
    totalComprarColuna,
    totalReversa,
    totalCD,
    pctReversa: emEstoque > 0 ? (totalReversa / emEstoque) * 100 : 0,
    conjuntosComReversa,
    travadosPelaReversa,
    pctTravadosPelaReversa:
      comConjuntoNoCD > 0 ? (travadosPelaReversa / comConjuntoNoCD) * 100 : 0,
  };
}

/* Teste de fechamento (secao 9): aplica as compras sugeridas e confere
   que o conjunto fecha.

   A compra entra no componente que estava faltando, e nao no saldo
   somado do conjunto. E assim que ela acontece de verdade - o
   comprador pede um codigo, nao "uma coluna" - e so assim o teste
   prova que a lista de compra resolve o descasamento. */
export function aplicarCompras(conjunto: Conjunto): Conjunto {
  const abastecidos: Componente[] = [];
  for (const lista of paresPorItemPai(conjunto.componentes).values()) {
    const montagem = montarDoPai(lista);
    for (const c of lista) {
      const codigo = String(c.itemComponente ?? '').trim();
      const falta = montagem.componentes.find((m) => m.codigo === codigo)?.faltam ?? 0;
      abastecidos.push(falta > 0 ? { ...c, cd: c.cd + falta } : c);
    }
  }
  /* O que nao entra no par volta intacto: a compra nao mexe nele. */
  const fora = conjunto.componentes.filter(
    (c) => tipoComponente(c) === 'OUTRO' || !String(c.itemVolMultiplo ?? '').trim()
  );
  const todos = [...abastecidos, ...fora];

  let baseCD = 0;
  let colCD = 0;
  for (const c of todos) {
    const tipo = tipoComponente(c);
    baseCD += tipo === 'BASE' ? c.cd : 0;
    colCD += tipo === 'COLUNA' ? c.cd : 0;
  }

  return calcularConjunto({
    chave: conjunto.chave,
    marca: conjunto.marca,
    fabricante: conjunto.fabricante,
    toneladaFixa: conjunto.toneladaFixa,
    baseCD,
    colCD,
    reversa: conjunto.reversa,
    ds: conjunto.ds,
    outros: conjunto.outros,
    componentes: todos,
  });
}
