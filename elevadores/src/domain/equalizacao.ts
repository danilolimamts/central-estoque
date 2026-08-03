/* ============================================================
   Equalizacao (secao 7.1, 7.2 e 7.3 do brief).
   Casa Base com Coluna por conjunto (Chave) usando somente o
   saldo do CD. Reversa, DS e Outros ficam de fora do calculo e
   aparecem apenas como alerta.
   ============================================================ */
import type { Componente, Conjunto, StatusConjunto } from './tipos';
import { ratioDaTonelada, TIPO_BASE, TIPO_COLUNA } from '../config/regras';

/* Normaliza o tipo de componente para comparar de forma estrita.
   So BASE e COLUNA entram no kit (regressao 8.2: BOMBA, COMANDO e MOTOR
   nao podem ser contados como coluna). */
export function tipoComponente(c: Componente): 'BASE' | 'COLUNA' | 'OUTRO' {
  const t = String(c.componenteBaseColuna ?? '').trim().toUpperCase();
  if (t === TIPO_BASE) return 'BASE';
  if (t === TIPO_COLUNA) return 'COLUNA';
  return 'OUTRO';
}

/* 7.3 Calculo de um conjunto a partir dos saldos ja somados. */
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

  const colunasNecessarias = baseCD * ratio;
  const deficit = colunasNecessarias - colCD;
  const kits = Math.min(baseCD, Math.floor(colCD / ratio));

  let status: StatusConjunto;
  if (baseCD === 0 && colCD === 0) {
    status = 'SEM ESTOQUE';
  } else if (deficit === 0 && reversa > 0) {
    // Casado, mas ha saldo na reversa: nao da para afirmar que esta
    // equalizado ate validar o que esta la (secao 7.3).
    status = 'REVERSA';
  } else if (deficit === 0) {
    status = 'CASADO';
  } else {
    status = 'DESCASADO';
  }

  let comprarBase = 0;
  let comprarColuna = 0;
  if (deficit > 0) {
    // Faltam colunas para casar com as bases existentes.
    comprarColuna = deficit;
  } else if (deficit < 0) {
    // Sobram colunas sem base. Compra bases e completa o ultimo kit.
    const sobra = -deficit;
    comprarBase = Math.ceil(sobra / ratio);
    comprarColuna = comprarBase * ratio - sobra;
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

   O item pai nao tem saldo proprio: o que existe no CD sao as bases e as
   colunas dele. Elevador montado e o menor numero que fecha os dois lados,
   respeitando o ratio da tonelada (4 t e 5 t pedem duas colunas por base).
   E o mesmo criterio de kit usado no conjunto, so que por item. */
export interface ContagemItem {
  bases: number;
  colunas: number;
  ratio: number;
  completos: number;
  /* Pecas soltas que nao formam elevador por falta do outro lado. */
  basesSobrando: number;
  colunasSobrando: number;
}

export function contarElevadoresPorItem(componentes: Componente[]): Map<string, ContagemItem> {
  const contagem = new Map<string, ContagemItem>();
  for (const c of componentes) {
    const item = String(c.itemVolMultiplo ?? '').trim();
    if (!item) continue;
    const tipo = tipoComponente(c);
    if (tipo === 'OUTRO') continue;

    let atual = contagem.get(item);
    if (!atual) {
      atual = {
        bases: 0, colunas: 0, ratio: ratioDaTonelada(c.toneladaFixa),
        completos: 0, basesSobrando: 0, colunasSobrando: 0,
      };
      contagem.set(item, atual);
    }
    if (tipo === 'BASE') atual.bases += c.cd;
    else atual.colunas += c.cd;
  }

  for (const v of contagem.values()) {
    v.completos = Math.max(0, Math.min(v.bases, Math.floor(v.colunas / v.ratio)));
    v.basesSobrando = Math.max(0, v.bases - v.completos);
    v.colunasSobrando = Math.max(0, v.colunas - v.completos * v.ratio);
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
}

export function resumirEqualizacao(conjuntos: Conjunto[]): ResumoEqualizacao {
  let comConjuntoNoCD = 0;
  let casados = 0;
  let totalComprarBase = 0;
  let totalComprarColuna = 0;
  let totalReversa = 0;
  for (const c of conjuntos) {
    if (c.baseCD !== 0 || c.colCD !== 0) comConjuntoNoCD++;
    if (c.status === 'CASADO') casados++;
    totalComprarBase += c.comprarBase;
    totalComprarColuna += c.comprarColuna;
    totalReversa += c.reversa;
  }
  return {
    conjuntos,
    comConjuntoNoCD,
    casados,
    totalComprarBase,
    totalComprarColuna,
    totalReversa,
  };
}

/* Teste de fechamento (secao 9): aplica as compras sugeridas e confere
   que o deficit de cada conjunto zera. */
export function aplicarCompras(conjunto: Conjunto): Conjunto {
  return calcularConjunto({
    chave: conjunto.chave,
    marca: conjunto.marca,
    fabricante: conjunto.fabricante,
    toneladaFixa: conjunto.toneladaFixa,
    baseCD: conjunto.baseCD + conjunto.comprarBase,
    colCD: conjunto.colCD + conjunto.comprarColuna,
    reversa: conjunto.reversa,
    ds: conjunto.ds,
    outros: conjunto.outros,
    componentes: conjunto.componentes,
  });
}
