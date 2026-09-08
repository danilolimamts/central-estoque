import { describe, expect, it } from 'vitest';
import { ROTA_INICIAL, escreverRota, lerRota } from '../src/lib/rota';

describe('rota no endereço', () => {
  it('endereço vazio abre o painel', () => {
    expect(lerRota('')).toEqual(ROTA_INICIAL);
    expect(lerRota('#')).toEqual(ROTA_INICIAL);
  });

  it('lê a aba', () => {
    expect(lerRota('#/cronograma')).toEqual({ aba: 'cronograma', projetoId: null });
    expect(lerRota('#pessoas')).toEqual({ aba: 'pessoas', projetoId: null });
  });

  it('projeto aberto volta com a aba de projetos', () => {
    expect(lerRota('#/projeto/abc-123')).toEqual({ aba: 'projetos', projetoId: 'abc-123' });
  });

  it('endereço estranho não quebra a tela', () => {
    expect(lerRota('#/inventado')).toEqual(ROTA_INICIAL);
    expect(lerRota('#/projeto/')).toEqual(ROTA_INICIAL);
  });

  it('escreve e lê de volta o mesmo lugar', () => {
    const casos = [
      { aba: 'painel' as const, projetoId: null },
      { aba: 'projetos' as const, projetoId: 'j1' },
      { aba: 'pessoas' as const, projetoId: null },
    ];
    for (const rota of casos) expect(lerRota(escreverRota(rota))).toEqual(rota);
  });
});
