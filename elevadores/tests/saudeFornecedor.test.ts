/* ============================================================
   Testes da saude do estoque por fornecedor.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  listarPorFornecedor, saudePorFornecedor, semNadaNoEstoque, totalizarSaude,
} from '../src/domain/fornecedores';
import type { Componente } from '../src/domain/tipos';

function comp(p: Partial<Componente>): Componente {
  return {
    itemVolMultiplo: '', nomeItemVolMultiplo: '', itemComponente: '', nomeItemComponente: '',
    quantidade: 1, inInterface: '', peso: 0, linhaProduto: '', marca: '', componenteBaseColuna: '',
    filtrar: '', cd: 0, reversa: 0, ds: 0, outros: 0, chave: '', toneladaFixa: '2 t', fabricante: '',
    ...p,
  };
}

/* Um item casado (10 e 10) e um travado (10 bases, 1 coluna). */
const JM: Componente[] = [
  comp({ itemVolMultiplo: 'A', itemComponente: 'A1', componenteBaseColuna: 'BASE', cd: 10, fabricante: 'JM' }),
  comp({ itemVolMultiplo: 'A', itemComponente: 'A2', componenteBaseColuna: 'COLUNA', cd: 10, fabricante: 'JM' }),
  comp({ itemVolMultiplo: 'B', itemComponente: 'B1', componenteBaseColuna: 'BASE', cd: 10, fabricante: 'JM' }),
  comp({ itemVolMultiplo: 'B', itemComponente: 'B2', componenteBaseColuna: 'COLUNA', cd: 1, fabricante: 'JM' }),
];

describe('saude por fornecedor', () => {
  const linhas = saudePorFornecedor(listarPorFornecedor(JM));
  const jm = linhas.find((l) => l.fornecedor === 'JM')!;

  it('conta elevador por unidade, nao por SKU', () => {
    /* Item A monta 10. Item B monta 1 e poderia montar 10. */
    expect(jm.completos).toBe(11);
    expect(jm.potencial).toBe(20);
    expect(jm.descasados).toBe(9);
  });

  it('a porcentagem sai do potencial, e os dois lados fecham 100', () => {
    expect(jm.pctCompleto).toBeCloseTo(55, 5); // 11 de 20
    expect(jm.pctDescasado).toBeCloseTo(45, 5);
    expect(jm.pctCompleto + jm.pctDescasado).toBeCloseTo(100, 5);
  });

  it('conta tambem quantos SKUs estao descasados', () => {
    expect(jm.itens).toBe(2);
    expect(jm.itensDescasados).toBe(1);
  });

  it('mede a peca parada: o que sobrou sem virar elevador', () => {
    /* Item B monta 1 elevador e sobram 9 bases sem coluna. */
    expect(jm.pecasParadas).toBe(9);
  });

  it('exemplo da regra: 100 possiveis com 10 travados da 90% OK', () => {
    const cem = saudePorFornecedor(
      listarPorFornecedor([
        comp({ itemVolMultiplo: 'X', itemComponente: 'X1', componenteBaseColuna: 'BASE', cd: 100, fabricante: 'ACME' }),
        comp({ itemVolMultiplo: 'X', itemComponente: 'X2', componenteBaseColuna: 'COLUNA', cd: 90, fabricante: 'ACME' }),
      ])
    )[0];
    expect(cem.completos).toBe(90);
    expect(cem.potencial).toBe(100);
    expect(cem.descasados).toBe(10);
    expect(cem.pctCompleto).toBeCloseTo(90, 5);
    expect(cem.pctDescasado).toBeCloseTo(10, 5);
  });
});

describe('reversa fica de fora', () => {
  it('peca em reversa nao entra na conta do que da para montar', () => {
    const linha = saudePorFornecedor(
      listarPorFornecedor([
        comp({ itemVolMultiplo: 'R', itemComponente: 'R1', componenteBaseColuna: 'BASE', cd: 5, reversa: 50, fabricante: 'ACME' }),
        comp({ itemVolMultiplo: 'R', itemComponente: 'R2', componenteBaseColuna: 'COLUNA', cd: 5, reversa: 50, fabricante: 'ACME' }),
      ])
    )[0];
    expect(linha.completos).toBe(5); // nao 55
    expect(linha.pctCompleto).toBeCloseTo(100, 5);
  });
});

describe('ordem e total', () => {
  it('quem tem mais elevador travado aparece primeiro', () => {
    const linhas = saudePorFornecedor(
      listarPorFornecedor([
        ...JM,
        comp({ itemVolMultiplo: 'C', itemComponente: 'C1', componenteBaseColuna: 'BASE', cd: 2, fabricante: 'OUTRO' }),
        comp({ itemVolMultiplo: 'C', itemComponente: 'C2', componenteBaseColuna: 'COLUNA', cd: 2, fabricante: 'OUTRO' }),
      ])
    );
    expect(linhas[0].fornecedor).toBe('JM'); // 9 travados
  });

  it('o total soma os fornecedores e recalcula a porcentagem', () => {
    const linhas = saudePorFornecedor(listarPorFornecedor(JM));
    const t = totalizarSaude(linhas);
    expect(t.completos).toBe(11);
    expect(t.potencial).toBe(20);
    expect(t.descasados).toBe(9);
    expect(t.pctCompleto).toBeCloseTo(55, 5);
    expect(t.pecasParadas).toBe(9);
  });

  it('fornecedor sem nada no CD e marcado para sair da tabela', () => {
    /* Linha so com zero e traco nao responde a pergunta do cartao. */
    const vazio = saudePorFornecedor(
      listarPorFornecedor([
        comp({ itemVolMultiplo: 'V', itemComponente: 'V1', componenteBaseColuna: 'BASE', cd: 0, fabricante: 'LOJA DO MECANICO' }),
        comp({ itemVolMultiplo: 'V', itemComponente: 'V2', componenteBaseColuna: 'COLUNA', cd: 0, fabricante: 'LOJA DO MECANICO' }),
      ])
    )[0];
    expect(semNadaNoEstoque(vazio)).toBe(true);
  });

  it('quem tem peca parada continua na tabela, mesmo sem elevador possivel', () => {
    /* Uma coluna sozinha, sem base que a acompanhe: nao monta elevador
       nenhum, mas e exatamente o estoque travado que o cartao existe
       para mostrar. */
    const so = saudePorFornecedor(
      listarPorFornecedor([
        comp({ itemVolMultiplo: 'S', itemComponente: 'S1', componenteBaseColuna: 'BASE', cd: 0, fabricante: 'ACME' }),
        comp({ itemVolMultiplo: 'S', itemComponente: 'S2', componenteBaseColuna: 'COLUNA', cd: 4, fabricante: 'ACME' }),
      ])
    )[0];
    expect(so.completos).toBe(0);
    expect(so.pecasParadas).toBe(4);
    expect(semNadaNoEstoque(so)).toBe(false);
  });

  it('sem estoque nenhum nao vira 0% nem 100%', () => {
    const linhas = saudePorFornecedor(
      listarPorFornecedor([
        comp({ itemVolMultiplo: 'Z', itemComponente: 'Z1', componenteBaseColuna: 'BASE', cd: 0, fabricante: 'ACME' }),
        comp({ itemVolMultiplo: 'Z', itemComponente: 'Z2', componenteBaseColuna: 'COLUNA', cd: 0, fabricante: 'ACME' }),
      ])
    );
    expect(linhas[0].potencial).toBe(0);
    expect(linhas[0].pctCompleto).toBe(0);
    expect(linhas[0].pctDescasado).toBe(0);
  });
});
