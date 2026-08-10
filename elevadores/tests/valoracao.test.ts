/* ============================================================
   Testes da valoracao do campo "in interface" (secao 7.4).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { valorarElevador, auditarValoracao, resumirValoracao } from '../src/domain/valoracao';
import type { Componente } from '../src/domain/tipos';

function comp(p: Partial<Componente>): Componente {
  return {
    itemVolMultiplo: 'P', nomeItemVolMultiplo: '', itemComponente: '', nomeItemComponente: '',
    quantidade: 0, inInterface: '', peso: 0, linhaProduto: '', marca: '', componenteBaseColuna: '',
    filtrar: '', cd: 0, reversa: 0, ds: 0, outros: 0, chave: '', toneladaFixa: '', fabricante: '',
    ...p,
  };
}

describe('7.4 diagnostico por elevador', () => {
  it('S na coluna e N na base: OK', () => {
    const v = valorarElevador('P', [
      comp({ componenteBaseColuna: 'BASE', itemComponente: '965793', inInterface: 'N' }),
      comp({ componenteBaseColuna: 'COLUNA', itemComponente: '965794', inInterface: 'S' }),
    ]);
    expect(v.diagnostico).toBe('OK');
    expect(v.correcoes).toEqual([]);
  });

  it('S na base e N na coluna: CORRIGIR com instrucao para o Bseller', () => {
    const v = valorarElevador('P', [
      comp({ componenteBaseColuna: 'BASE', itemComponente: '965793', inInterface: 'S' }),
      comp({ componenteBaseColuna: 'COLUNA', itemComponente: '965794', inInterface: 'N' }),
    ]);
    expect(v.diagnostico).toBe('CORRIGIR');
    expect(v.correcoes).toContain('BASE 965793: S -> N');
    expect(v.correcoes).toContain('COLUNA 965794: N -> S');
  });

  it('S nos dois: DUPLICADO', () => {
    const v = valorarElevador('P', [
      comp({ componenteBaseColuna: 'BASE', itemComponente: '1', inInterface: 'S' }),
      comp({ componenteBaseColuna: 'COLUNA', itemComponente: '2', inInterface: 'S' }),
    ]);
    expect(v.diagnostico).toBe('DUPLICADO');
    expect(v.correcoes).toContain('BASE 1: S -> N');
  });

  it('nenhum S: SEM S', () => {
    const v = valorarElevador('P', [
      comp({ componenteBaseColuna: 'BASE', itemComponente: '1', inInterface: 'N' }),
      comp({ componenteBaseColuna: 'COLUNA', itemComponente: '2', inInterface: 'N' }),
    ]);
    expect(v.diagnostico).toBe('SEM S');
  });
});

describe('auditoria e resumo por marca', () => {
  it('agrupa por item pai e concentra os CORRIGIR por marca', () => {
    const componentes: Componente[] = [
      comp({ itemVolMultiplo: 'A', marca: 'AUTOP', componenteBaseColuna: 'BASE', inInterface: 'S' }),
      comp({ itemVolMultiplo: 'A', marca: 'AUTOP', componenteBaseColuna: 'COLUNA', inInterface: 'N' }),
      comp({ itemVolMultiplo: 'B', marca: 'AUTOP', componenteBaseColuna: 'BASE', inInterface: 'S' }),
      comp({ itemVolMultiplo: 'B', marca: 'AUTOP', componenteBaseColuna: 'COLUNA', inInterface: 'N' }),
      comp({ itemVolMultiplo: 'C', marca: 'KREBS', componenteBaseColuna: 'BASE', inInterface: 'N' }),
      comp({ itemVolMultiplo: 'C', marca: 'KREBS', componenteBaseColuna: 'COLUNA', inInterface: 'S' }),
    ];
    const valoracoes = auditarValoracao(componentes);
    expect(valoracoes).toHaveLength(3);
    const r = resumirValoracao(valoracoes);
    expect(r.total).toBe(3);
    expect(r.corrigir).toBe(2);
    expect(r.ok).toBe(1);
    expect(r.porMarca[0]).toEqual({ marca: 'AUTOP', corrigir: 2 });
  });
});

describe('quanto do catalogo ja valora na coluna', () => {
  /* Um OK, um com o S na base, um com S nos dois lados e um sem S. */
  const componentes: Componente[] = [
    comp({ itemVolMultiplo: 'OK', componenteBaseColuna: 'BASE', inInterface: 'N' }),
    comp({ itemVolMultiplo: 'OK', componenteBaseColuna: 'COLUNA', inInterface: 'S' }),
    comp({ itemVolMultiplo: 'NA_BASE', componenteBaseColuna: 'BASE', inInterface: 'S' }),
    comp({ itemVolMultiplo: 'NA_BASE', componenteBaseColuna: 'COLUNA', inInterface: 'N' }),
    comp({ itemVolMultiplo: 'DOIS', componenteBaseColuna: 'BASE', inInterface: 'S' }),
    comp({ itemVolMultiplo: 'DOIS', componenteBaseColuna: 'COLUNA', inInterface: 'S' }),
    comp({ itemVolMultiplo: 'NENHUM', componenteBaseColuna: 'BASE', inInterface: 'N' }),
    comp({ itemVolMultiplo: 'NENHUM', componenteBaseColuna: 'COLUNA', inInterface: 'N' }),
  ];
  const r = resumirValoracao(auditarValoracao(componentes));

  it('de quatro modelos, um ja esta certo', () => {
    expect(r.total).toBe(4);
    expect(r.ok).toBe(1);
    expect(r.pctAjustado).toBeCloseTo(25, 5);
  });

  it('falta ajuste em tudo que nao valora so na coluna', () => {
    /* S na base, S nos dois e sem S nenhum: os tres precisam de mexida. */
    expect(r.faltaAjuste).toBe(3);
    expect(r.pctFalta).toBeCloseTo(75, 5);
  });

  it('separa quem tem o S preso na base de quem nao tem S', () => {
    /* Tirar de um lado e por no outro e um trabalho; cadastrar do zero
       e outro. O numero do meio precisa distinguir os dois. */
    expect(r.comSNaBase).toBe(2); // CORRIGIR + DUPLICADO
    expect(r.semS).toBe(1);
  });

  it('os dois lados fecham 100%', () => {
    expect(r.pctAjustado + r.pctFalta).toBeCloseTo(100, 5);
    expect(r.ok + r.faltaAjuste).toBe(r.total);
  });

  it('catalogo vazio nao vira 0% nem 100%', () => {
    const vazio = resumirValoracao([]);
    expect(vazio.pctAjustado).toBe(0);
    expect(vazio.pctFalta).toBe(0);
  });
});
