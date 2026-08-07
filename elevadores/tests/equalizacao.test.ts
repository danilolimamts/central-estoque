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

/* Monta um conjunto do jeito que a planilha entrega: linhas de
   componente com o item pai a que pertencem. Os saldos somados sao
   derivados delas, e nao inventados, para o teste exercitar o mesmo
   caminho da tela. */
function conjDe(linhas: Componente[], ton = '4 t', reversa = 0) {
  let baseCD = 0;
  let colCD = 0;
  for (const c of linhas) {
    const t = tipoComponente(c);
    baseCD += t === 'BASE' ? c.cd : 0;
    colCD += t === 'COLUNA' ? c.cd : 0;
  }
  return calcularConjunto({
    chave: 'X', marca: 'M', fabricante: 'F', toneladaFixa: ton,
    baseCD, colCD, reversa, ds: 0, outros: 0, componentes: linhas,
  });
}

/* Um item pai com uma base e uma coluna, uma de cada por kit. */
function par(pai: string, baseCd: number, colCd: number, porColuna = 1): Componente[] {
  return [
    base('X', '4 t', baseCd, { itemVolMultiplo: pai, itemComponente: `${pai}-B`, quantidade: 1 }),
    coluna('X', '4 t', colCd, { itemVolMultiplo: pai, itemComponente: `${pai}-C`, quantidade: porColuna }),
  ];
}

describe('7.3 status e compras do conjunto', () => {
  it('rampa de 4 t com uma coluna por base fica casada', () => {
    /* Regressao do caso relatado: o conjunto "ENGECASS 4 t RAMPA"
       aparecia descasado pedindo 5 colunas. A tonelada 4 t fazia a
       regra antiga exigir duas colunas por base; a rampa leva uma so,
       e a quantidade por kit ja diz isso na planilha. */
    const c = conjDe(par('2031441', 5, 5));
    expect(c.comprarColuna).toBe(0);
    expect(c.comprarBase).toBe(0);
    expect(c.deficit).toBe(0);
    expect(c.status).toBe('CASADO');
    expect(c.kits).toBe(5);
  });

  it('quem realmente leva duas colunas por base continua exigindo duas', () => {
    /* A correcao nao afrouxa a regra: quem consome duas colunas por
       kit segue precisando delas - a diferenca e que agora quem manda
       e a composicao, nao a tonelada. */
    const casado = conjDe(par('DUPLA', 10, 20, 2));
    expect(casado.status).toBe('CASADO');
    expect(casado.kits).toBe(10);

    const faltando = conjDe(par('DUPLA', 10, 14, 2));
    expect(faltando.comprarColuna).toBe(6); // 10 kits x 2 = 20, tem 14
    expect(faltando.status).toBe('DESCASADO');
    expect(faltando.kits).toBe(7);
  });

  it('faltam colunas: comprar colunas para chegar ao alvo', () => {
    const c = conjDe(par('A', 10, 5));
    expect(c.comprarColuna).toBe(5);
    expect(c.comprarBase).toBe(0);
    expect(c.deficit).toBe(5);
    expect(c.status).toBe('DESCASADO');
    expect(c.kits).toBe(5);
  });

  it('sobram colunas sem base: comprar base', () => {
    const c = conjDe(par('A', 1, 5));
    expect(c.comprarBase).toBe(4);
    expect(c.comprarColuna).toBe(0);
    expect(c.deficit).toBe(-4);
    expect(c.status).toBe('DESCASADO');
    expect(c.kits).toBe(1);
  });

  it('duas colunas diferentes no kit sao pecas distintas', () => {
    /* Caso real 2031433 no nivel do conjunto: somar as duas colunas
       daria 63 e sugeriria que fecha 32. Falta 1 unidade de uma
       coluna especifica. */
    const c = conjDe([
      base('X', '4 t', 32, { itemVolMultiplo: '2031433', itemComponente: '2032019', quantidade: 1 }),
      coluna('X', '4 t', 31, { itemVolMultiplo: '2031433', itemComponente: '2032020', quantidade: 1 }),
      coluna('X', '4 t', 32, { itemVolMultiplo: '2031433', itemComponente: '2032021', quantidade: 1 }),
    ]);
    expect(c.kits).toBe(31);
    expect(c.comprarColuna).toBe(1);
    expect(c.status).toBe('DESCASADO');
  });

  it('itens pai diferentes no mesmo conjunto nao emprestam peca um ao outro', () => {
    /* Um item precisa de coluna e o outro de base. O deficit liquido
       se anula, mas falta peca nos dois - o status nao pode dizer que
       o conjunto esta casado. */
    const c = conjDe([...par('A', 4, 2), ...par('B', 2, 4)]);
    expect(c.comprarColuna).toBe(2);
    expect(c.comprarBase).toBe(2);
    expect(c.deficit).toBe(0);
    expect(c.status).toBe('DESCASADO');
    expect(c.kits).toBe(4); // 2 de cada item
  });

  it('casado com saldo na reversa vira REVERSA', () => {
    const c = conjDe(par('A', 5, 5), '4 t', 5);
    expect(c.status).toBe('REVERSA');
  });

  it('sem estoque quando base e coluna zeradas', () => {
    const c = conjDe(par('A', 0, 0));
    expect(c.status).toBe('SEM ESTOQUE');
    expect(c.comprarBase).toBe(0);
    expect(c.comprarColuna).toBe(0);
  });

  it('kit sem base cadastrada nao passa a pedir base', () => {
    /* Caso real 4570344: o produto leva coluna e bomba, nenhuma base.
       Cobrar uma base seria mandar comprar peca que ele nao usa. */
    const c = conjDe([
      coluna('X', '2 t', 6, { itemVolMultiplo: '4570344', itemComponente: '4570497', quantidade: 1 }),
    ], '2 t');
    expect(c.comprarBase).toBe(0);
    expect(c.status).toBe('CASADO');
    expect(c.kits).toBe(6);
  });
});

describe('9 teste de fechamento: apos as compras o conjunto fecha', () => {
  const casos = [
    conjDe(par('A', 10, 5)),
    conjDe(par('A', 1, 5)),
    conjDe(par('A', 3, 10), '2 t'),
    conjDe(par('A', 7, 3)),
    conjDe(par('A', 5, 5)),
    conjDe(par('A', 0, 0)),
    conjDe(par('DUPLA', 10, 14, 2)),
    conjDe([...par('A', 4, 2), ...par('B', 2, 4)]),
    conjDe([
      base('X', '4 t', 32, { itemVolMultiplo: '2031433', itemComponente: '2032019', quantidade: 1 }),
      coluna('X', '4 t', 31, { itemVolMultiplo: '2031433', itemComponente: '2032020', quantidade: 1 }),
      coluna('X', '4 t', 32, { itemVolMultiplo: '2031433', itemComponente: '2032021', quantidade: 1 }),
    ]),
  ];
  it.each(casos.map((c, i) => [i, c] as const))('caso %i fecha sem sobra nem falta', (_i, c) => {
    const depois = aplicarCompras(c);
    expect(depois.comprarBase).toBe(0);
    expect(depois.comprarColuna).toBe(0);
    expect(depois.deficit).toBe(0);
  });

  it('a compra vai para o componente que faltava, e nao para o saldo somado', () => {
    /* Com duas colunas diferentes, "comprar 1 coluna" nao diz nada: o
       fechamento so vale se a unidade entrar no codigo certo. */
    const c = conjDe([
      base('X', '4 t', 32, { itemVolMultiplo: '2031433', itemComponente: '2032019', quantidade: 1 }),
      coluna('X', '4 t', 31, { itemVolMultiplo: '2031433', itemComponente: '2032020', quantidade: 1 }),
      coluna('X', '4 t', 32, { itemVolMultiplo: '2031433', itemComponente: '2032021', quantidade: 1 }),
    ]);
    const depois = aplicarCompras(c);
    expect(depois.kits).toBe(32);
    const escasso = depois.componentes.find((x) => x.itemComponente === '2032020')!;
    expect(escasso.cd).toBe(32);
    const cheio = depois.componentes.find((x) => x.itemComponente === '2032021')!;
    expect(cheio.cd).toBe(32); // nao ganhou unidade que nao faltava
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
    const conjuntos = [
      conjDe(par('A', 10, 5)),          // faltam 5 colunas
      conjDe(par('B', 10, 10)),         // casado
      conjDe(par('C', 10, 10), '4 t', 5), // casado com reversa
      conjDe(par('D', 0, 0)),           // sem estoque
    ];
    const r = resumirEqualizacao(conjuntos);
    expect(r.comConjuntoNoCD).toBe(3);
    expect(r.casados).toBe(1);
    expect(r.totalComprarColuna).toBe(5);
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

  it('kit sem coluna na estrutura monta pelo que ele tem', () => {
    /* Nao ha coluna cadastrada neste item: o produto nao leva uma.
       Inventar a peca faltante faria a conta acusar zero elevador em
       um kit que esta completo. */
    const q = contarElevadoresPorItem([
      base('FORTG JM 4 t', '4 t', 2, { itemVolMultiplo: 'B' }),
    ]).get('B')!;
    expect(q.colunas).toBe(0);
    expect(q.completos).toBe(2);
    expect(q.basesSobrando).toBe(0);
  });

  it('kit sem base na estrutura monta pelo que ele tem', () => {
    /* Caso real 4570344, que leva coluna e bomba e nenhuma base. */
    const q = contarElevadoresPorItem([
      coluna('KREBS 2 t', '2 t', 6, { itemVolMultiplo: 'C' }),
    ]).get('C')!;
    expect(q.completos).toBe(6);
    expect(q.colunasSobrando).toBe(0);
  });
});
