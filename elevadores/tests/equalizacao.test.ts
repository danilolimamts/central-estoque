/* ============================================================
   Testes da equalizacao (secao 7.1, 7.2, 7.3 e fechamento 9).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { ratioDaTonelada } from '../src/config/regras';
import {
  calcularConjunto,
  agruparConjuntos,
  aplicarCompras,
  resumirEqualizacao,
  tipoComponente,
  contarElevadoresPorItem,
} from '../src/domain/equalizacao';
import type { Componente } from '../src/domain/tipos';

function comp(p: Partial<Componente>): Componente {
  return {
    itemVolMultiplo: '', nomeItemVolMultiplo: '', itemComponente: '', nomeItemComponente: '',
    quantidade: 0, inInterface: '', peso: 0, linhaProduto: '', marca: '', componenteBaseColuna: '',
    filtrar: '', cd: 0, reversa: 0, ds: 0, outros: 0, chave: '', toneladaFixa: '', fabricante: '',
    ...p,
  };
}

function base(chave: string, ton: string, cd: number, extra: Partial<Componente> = {}): Componente {
  return comp({ chave, toneladaFixa: ton, componenteBaseColuna: 'BASE', cd, ...extra });
}
function coluna(chave: string, ton: string, cd: number, extra: Partial<Componente> = {}): Componente {
  return comp({ chave, toneladaFixa: ton, componenteBaseColuna: 'COLUNA', cd, ...extra });
}

describe('7.2 ratio pela tonelada', () => {
  it('ate 3,2 t o ratio e 1', () => {
    expect(ratioDaTonelada('2 t')).toBe(1);
    expect(ratioDaTonelada('3,2 t')).toBe(1);
    expect(ratioDaTonelada('3 t')).toBe(1);
  });
  it('de 4 t para cima o ratio e 2', () => {
    expect(ratioDaTonelada('4 t')).toBe(2);
    expect(ratioDaTonelada('5 t')).toBe(2);
  });
});

function conj(baseCD: number, colCD: number, ton = '4 t', reversa = 0) {
  return calcularConjunto({
    chave: 'X', marca: 'M', fabricante: 'F', toneladaFixa: ton,
    baseCD, colCD, reversa, ds: 0, outros: 0, componentes: [],
  });
}

describe('7.3 status e compras do conjunto', () => {
  it('faltam colunas (deficit > 0): comprar colunas', () => {
    const c = conj(10, 5); // ratio 2, necess 20
    expect(c.deficit).toBe(15);
    expect(c.comprarColuna).toBe(15);
    expect(c.comprarBase).toBe(0);
    expect(c.status).toBe('DESCASADO');
    expect(c.kits).toBe(2); // min(10, floor(5/2))
  });

  it('casado quando deficit zero e sem reversa', () => {
    const c = conj(10, 20);
    expect(c.deficit).toBe(0);
    expect(c.status).toBe('CASADO');
    expect(c.comprarBase).toBe(0);
    expect(c.comprarColuna).toBe(0);
  });

  it('casado mas com reversa vira REVERSA', () => {
    const c = conj(10, 20, '4 t', 5);
    expect(c.deficit).toBe(0);
    expect(c.status).toBe('REVERSA');
  });

  it('sobram colunas (deficit < 0): comprar bases e completar o kit', () => {
    const c = conj(1, 5); // ratio 2, necess 2, deficit -3, sobra 3
    expect(c.deficit).toBe(-3);
    expect(c.comprarBase).toBe(2); // ceil(3/2)
    expect(c.comprarColuna).toBe(1); // 2*2 - 3
    expect(c.status).toBe('DESCASADO');
  });

  it('sem estoque quando base e coluna zeradas', () => {
    const c = conj(0, 0);
    expect(c.status).toBe('SEM ESTOQUE');
    expect(c.comprarBase).toBe(0);
    expect(c.comprarColuna).toBe(0);
  });
});

describe('9 teste de fechamento: apos as compras o deficit zera', () => {
  const casos = [
    conj(10, 5), conj(1, 5), conj(3, 10, '2 t'), conj(1, 4), conj(7, 3),
    conj(10, 20), conj(0, 0), conj(2, 9, '5 t'),
  ];
  it.each(casos.map((c, i) => [i, c] as const))('caso %i fecha em deficit 0', (_i, c) => {
    const depois = aplicarCompras(c);
    expect(depois.deficit).toBe(0);
    expect(depois.comprarBase).toBe(0);
    expect(depois.comprarColuna).toBe(0);
  });
});

describe('7.1 agrupamento por Chave e exclusao de OUTRO', () => {
  const componentes: Componente[] = [
    base('FORTG JM 4 t', '4 t', 5),
    coluna('FORTG JM 4 t', '4 t', 8),
    comp({ chave: 'FORTG JM 4 t', toneladaFixa: '4 t', componenteBaseColuna: 'BOMBA', cd: 99 }),
    base('KREBS 2 t', '2 t', 52),
    coluna('KREBS 2 t', '2 t', 29),
    // Mesma marca, fabricante diferente: nao pode juntar com o primeiro.
    base('FORTG RIBEIRO 4 t', '4 t', 3),
  ];

  it('gera um conjunto por Chave', () => {
    const conjuntos = agruparConjuntos(componentes);
    expect(conjuntos.map((c) => c.chave).sort()).toEqual([
      'FORTG JM 4 t', 'FORTG RIBEIRO 4 t', 'KREBS 2 t',
    ]);
  });

  it('a BOMBA nao entra no colCD', () => {
    const conjuntos = agruparConjuntos(componentes);
    const fortg = conjuntos.find((c) => c.chave === 'FORTG JM 4 t')!;
    expect(fortg.baseCD).toBe(5);
    expect(fortg.colCD).toBe(8);
  });
});

describe('resumo da equalizacao', () => {
  it('soma compras, casados e reversa', () => {
    const conjuntos = [conj(10, 5), conj(10, 20), conj(10, 20, '4 t', 5), conj(0, 0)];
    const r = resumirEqualizacao(conjuntos);
    expect(r.comConjuntoNoCD).toBe(3);
    expect(r.casados).toBe(1);
    expect(r.totalComprarColuna).toBe(15);
    expect(r.totalReversa).toBe(5);
  });
});

describe('tipoComponente e estrito', () => {
  it('so BASE e COLUNA', () => {
    expect(tipoComponente(comp({ componenteBaseColuna: 'BASE' }))).toBe('BASE');
    expect(tipoComponente(comp({ componenteBaseColuna: 'COLUNA' }))).toBe('COLUNA');
    expect(tipoComponente(comp({ componenteBaseColuna: 'MOTOR' }))).toBe('OUTRO');
  });
});

describe('quantidade de elevadores por item pai', () => {
  it('kit que consome duas colunas por elevador divide o saldo por duas', () => {
    const q = contarElevadoresPorItem([
      base('FORTG JM 4 t', '4 t', 5, { itemVolMultiplo: '1965321', quantidade: 1 }),
      coluna('FORTG JM 4 t', '4 t', 8, { itemVolMultiplo: '1965321', quantidade: 2 }),
    ]).get('1965321')!;
    expect(q.completos).toBe(4); // 8 colunas / 2 por kit
    expect(q.basesSobrando).toBe(1);
    expect(q.colunasSobrando).toBe(0);
  });

  it('produto de 4 t que leva uma coluna so nao e penalizado pela tonelada', () => {
    /* Regressao da rampa 2031441: a tonelada 4000 fazia a conta exigir
       duas colunas por base e acusar falta em um kit completo. */
    const q = contarElevadoresPorItem([
      base('RAMPA 4 t', '4 t', 2, { itemVolMultiplo: '2031441', quantidade: 1 }),
      coluna('RAMPA 4 t', '4 t', 2, { itemVolMultiplo: '2031441', quantidade: 1 }),
    ]).get('2031441')!;
    expect(q.completos).toBe(2);
    expect(q.basesSobrando).toBe(0);
    expect(q.colunasSobrando).toBe(0);
  });

  it('duas colunas diferentes no kit sao pecas distintas, nao somaveis', () => {
    /* Caso real 2031433: 1 base e 2 colunas diferentes, uma de cada.
       Somar as colunas daria 63 e sugeriria 31 pares; a conta correta
       olha cada componente e para no mais escasso. */
    const q = contarElevadoresPorItem([
      base('ENGECASS 4.1 t', '4 t', 32, { itemVolMultiplo: '2031433', itemComponente: '2032019', quantidade: 1 }),
      coluna('ENGECASS 4.1 t', '4 t', 31, { itemVolMultiplo: '2031433', itemComponente: '2032020', quantidade: 1 }),
      coluna('ENGECASS 4.1 t', '4 t', 32, { itemVolMultiplo: '2031433', itemComponente: '2032021', quantidade: 1 }),
    ]).get('2031433')!;
    expect(q.completos).toBe(31);
    expect(q.alvo).toBe(32);
  });

  it('ate 3,2 t e uma coluna por base', () => {
    const q = contarElevadoresPorItem([
      base('KREBS 2 t', '2 t', 3, { itemVolMultiplo: 'A' }),
      coluna('KREBS 2 t', '2 t', 7, { itemVolMultiplo: 'A' }),
    ]).get('A')!;
    expect(q.completos).toBe(3);
    expect(q.colunasSobrando).toBe(4);
  });

  it('componente fora do kit nao entra na conta', () => {
    const q = contarElevadoresPorItem([
      base('FORTG JM 4 t', '4 t', 2, { itemVolMultiplo: 'B' }),
      comp({ itemVolMultiplo: 'B', toneladaFixa: '4 t', componenteBaseColuna: 'BOMBA', cd: 99 }),
    ]).get('B')!;
    expect(q.colunas).toBe(0);
    expect(q.completos).toBe(0); // sem coluna cadastrada nao monta
    expect(q.basesSobrando).toBe(2);
  });

  it('so um lado no CD nao monta elevador', () => {
    const q = contarElevadoresPorItem([
      coluna('KREBS 2 t', '2 t', 6, { itemVolMultiplo: 'C' }),
    ]).get('C')!;
    expect(q.completos).toBe(0);
    expect(q.colunasSobrando).toBe(6);
  });
});
