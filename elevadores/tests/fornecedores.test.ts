/* ============================================================
   Testes da lista de compra por fornecedor.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { listarPorFornecedor, textoCompra, nomeDoFornecedor } from '../src/domain/fornecedores';
import type { Componente } from '../src/domain/tipos';

function comp(p: Partial<Componente>): Componente {
  return {
    itemVolMultiplo: '', nomeItemVolMultiplo: '', itemComponente: '', nomeItemComponente: '',
    quantidade: 0, inInterface: '', peso: 0, linhaProduto: '', marca: '', componenteBaseColuna: '',
    filtrar: '', cd: 0, reversa: 0, ds: 0, outros: 0, chave: '', toneladaFixa: '', fabricante: '',
    ...p,
  };
}

/* Reproduz o recorte que o comprador olha: um item de 4 t com uma base
   e uma coluna (descasado, porque 4 t pede duas colunas) e outro item
   do mesmo fornecedor ja fechado. */
const MAQUINAS: Componente[] = [
  comp({ itemVolMultiplo: '865413', nomeItemVolMultiplo: 'ELEVADOR A', itemComponente: '965799', inInterface: 'S', componenteBaseColuna: 'BASE', cd: 1, fabricante: 'MAQUINAS RIBEIRO', marca: 'FORTG', toneladaFixa: '4 t' }),
  comp({ itemVolMultiplo: '865413', nomeItemVolMultiplo: 'ELEVADOR A', itemComponente: '965800', inInterface: 'N', componenteBaseColuna: 'COLUNA', cd: 1, fabricante: 'MAQUINAS RIBEIRO', marca: 'FORTG', toneladaFixa: '4 t' }),
  comp({ itemVolMultiplo: '865413', nomeItemVolMultiplo: 'ELEVADOR A', itemComponente: '965801', inInterface: 'N', componenteBaseColuna: 'COLUNA', cd: 0, fabricante: 'MAQUINAS RIBEIRO', marca: 'FORTG', toneladaFixa: '4 t' }),
  comp({ itemVolMultiplo: '927388', nomeItemVolMultiplo: 'ELEVADOR B', itemComponente: '1019341', inInterface: 'S', componenteBaseColuna: 'BASE', cd: 2, fabricante: 'MAQUINAS RIBEIRO', marca: 'FORTG', toneladaFixa: '2 t' }),
  comp({ itemVolMultiplo: '927388', nomeItemVolMultiplo: 'ELEVADOR B', itemComponente: '1019342', inInterface: 'N', componenteBaseColuna: 'COLUNA', cd: 2, fabricante: 'MAQUINAS RIBEIRO', marca: 'FORTG', toneladaFixa: '2 t' }),
  comp({ itemVolMultiplo: '2786710', nomeItemVolMultiplo: 'ELEVADOR C', itemComponente: '2786712', inInterface: 'N', componenteBaseColuna: 'COLUNA', cd: 1, fabricante: 'AUTOP', marca: 'AUTOP', toneladaFixa: '3,2 t' }),
  comp({ itemVolMultiplo: '2786710', nomeItemVolMultiplo: 'ELEVADOR C', itemComponente: '2786711', inInterface: 'S', componenteBaseColuna: 'BASE', cd: 0, fabricante: 'AUTOP', marca: 'AUTOP', toneladaFixa: '3,2 t' }),
];

describe('agrupamento por fornecedor', () => {
  const grupos = listarPorFornecedor(MAQUINAS);

  it('separa por fornecedor, depois por tonelada', () => {
    expect(grupos.map((g) => g.fornecedor).sort()).toEqual(['AUTOP', 'MAQUINAS RIBEIRO']);
    const mr = grupos.find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!;
    expect(mr.toneladas.map((t) => t.tonelada)).toEqual(['2 t', '4 t']); // ordem numerica
  });

  it('mantem todos os componentes do item pai, inclusive o de saldo zero', () => {
    const mr = grupos.find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!;
    const item = mr.toneladas.find((t) => t.tonelada === '4 t')!.itens[0];
    expect(item.item).toBe('865413');
    expect(item.componentes.map((c) => c.codigo)).toEqual(['965799', '965800', '965801']);
    expect(item.componentes[0].tipo).toBe('BASE');
    expect(item.componentes[0].sn).toBe('S');
  });

  it('aponta o descasado e quantas colunas faltam comprar', () => {
    const mr = grupos.find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!;
    const quatro = mr.toneladas.find((t) => t.tonelada === '4 t')!;
    const item = quatro.itens[0];
    expect(item.bases).toBe(1);
    expect(item.colunas).toBe(1);
    expect(item.colunasNecessarias).toBe(2); // ratio 1:2
    expect(item.deficit).toBe(1);
    expect(item.situacao).toBe('DESCASADO');
    expect(item.comprarColuna).toBe(1);
    expect(item.completos).toBe(0);
    expect(quatro.descasados).toBe(1);
  });

  it('item com base e coluna na medida fica casado', () => {
    const mr = grupos.find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!;
    const dois = mr.toneladas.find((t) => t.tonelada === '2 t')!;
    expect(dois.itens[0].situacao).toBe('CASADO');
    expect(dois.itens[0].completos).toBe(2);
    expect(dois.comprarColuna + dois.comprarBase).toBe(0);
  });

  it('coluna sobrando pede base, e a base traz junto o resto do conjunto', () => {
    const autop = grupos.find((g) => g.fornecedor === 'AUTOP')!;
    const item = autop.toneladas[0].itens[0];
    expect(item.deficit).toBe(-1); // 0 base, 1 coluna
    expect(item.comprarBase).toBe(1);
    expect(item.comprarColuna).toBe(0); // ratio 1:1, a base fecha o conjunto
    expect(item.situacao).toBe('DESCASADO');
  });

  it('soma o total de compra do fornecedor', () => {
    const mr = grupos.find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!;
    expect(mr.itens).toBe(2);
    expect(mr.descasados).toBe(1);
    expect(mr.comprarColuna).toBe(1);
    expect(mr.comprarBase).toBe(0);
  });

  it('componente fora do kit nao vira linha', () => {
    const grupos2 = listarPorFornecedor([
      ...MAQUINAS,
      comp({ itemVolMultiplo: '865413', itemComponente: '999', componenteBaseColuna: 'BOMBA', cd: 40, fabricante: 'MAQUINAS RIBEIRO', toneladaFixa: '4 t' }),
    ]);
    const item = grupos2
      .find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!
      .toneladas.find((t) => t.tonelada === '4 t')!.itens[0];
    expect(item.componentes.map((c) => c.codigo)).not.toContain('999');
    expect(item.colunas).toBe(1);
  });
});

describe('componente que serve mais de um elevador', () => {
  /* A mesma base entra em dois elevadores: o saldo do CD e o mesmo
     estoque, e a tela precisa avisar para a compra nao dobrar. */
  const compartilhado: Componente[] = [
    comp({ itemVolMultiplo: 'P1', itemComponente: 'B99', componenteBaseColuna: 'BASE', cd: 4, fabricante: 'JM', toneladaFixa: '2 t' }),
    comp({ itemVolMultiplo: 'P1', itemComponente: 'C11', componenteBaseColuna: 'COLUNA', cd: 4, fabricante: 'JM', toneladaFixa: '2 t' }),
    comp({ itemVolMultiplo: 'P2', itemComponente: 'B99', componenteBaseColuna: 'BASE', cd: 4, fabricante: 'JM', toneladaFixa: '2 t' }),
    comp({ itemVolMultiplo: 'P2', itemComponente: 'C22', componenteBaseColuna: 'COLUNA', cd: 1, fabricante: 'JM', toneladaFixa: '2 t' }),
  ];

  it('conta em quantos elevadores o componente aparece', () => {
    const grupo = listarPorFornecedor(compartilhado)[0];
    const todos = grupo.toneladas.flatMap((t) => t.itens).flatMap((i) => i.componentes);
    expect(todos.find((c) => c.codigo === 'B99')!.paisQueUsam).toBe(2);
    expect(todos.find((c) => c.codigo === 'C11')!.paisQueUsam).toBe(1);
    expect(grupo.compartilhados).toBe(1);
  });

  it('sem repeticao nao ha o que avisar', () => {
    for (const g of listarPorFornecedor(MAQUINAS)) expect(g.compartilhados).toBe(0);
  });
});

describe('nome do fornecedor e texto de compra', () => {
  it('usa o fabricante e cai para a marca quando falta', () => {
    expect(nomeDoFornecedor({ fabricante: 'JM', marca: 'FORTG' })).toBe('JM');
    expect(nomeDoFornecedor({ fabricante: '', marca: 'FORTG' })).toBe('FORTG');
    expect(nomeDoFornecedor({ fabricante: '', marca: '' })).toBe('—');
  });

  it('escreve o que comprar', () => {
    expect(textoCompra({ situacao: 'DESCASADO', comprarColuna: 2, comprarBase: 0 })).toBe('comprar 2 coluna(s)');
    expect(textoCompra({ situacao: 'DESCASADO', comprarColuna: 1, comprarBase: 1 })).toBe('comprar 1 coluna(s) e 1 base(s)');
    expect(textoCompra({ situacao: 'CASADO', comprarColuna: 0, comprarBase: 0 })).toBe('equalizado');
    expect(textoCompra({ situacao: 'SEM ESTOQUE', comprarColuna: 0, comprarBase: 0 })).toBe('sem estoque');
  });
});
