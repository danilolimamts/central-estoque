import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  atrasado, calcularIndicadores, diasDeAtraso, entregasPorMes, paraData,
  percentualEsperado, saude, venceEm,
} from '../src/dominio/regras';
import type { Projeto } from '../src/dominio/tipos';

const base: Projeto = {
  id: '1', codigo: null, nome: 'Teste', descricao: null, area: null, responsavel_id: null,
  status: 'em_andamento', prioridade: 'media',
  inicio_previsto: '2026-01-01', fim_previsto: '2026-03-31',
  inicio_real: null, fim_real: null, percentual: 50,
  criado_por: null, criado_em: '', atualizado_em: '',
};

const projeto = (mudancas: Partial<Projeto>): Projeto => ({ ...base, ...mudancas });

beforeAll(() => {
  vi.useFakeTimers();
  // 1 de marco de 2026: dois tercos do prazo do projeto base ja correram.
  vi.setSystemTime(new Date(2026, 2, 1, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());

describe('paraData', () => {
  it('nao volta um dia por causa do fuso', () => {
    const d = paraData('2026-03-01');
    expect(d?.getDate()).toBe(1);
    expect(d?.getMonth()).toBe(2);
  });
});

describe('atraso', () => {
  it('conta os dias passados do fim previsto', () => {
    expect(diasDeAtraso(projeto({ fim_previsto: '2026-02-20' }))).toBe(9);
    expect(atrasado(projeto({ fim_previsto: '2026-02-20' }))).toBe(true);
  });

  it('ignora projeto encerrado', () => {
    expect(diasDeAtraso(projeto({ fim_previsto: '2026-02-20', status: 'concluido' }))).toBe(0);
    expect(diasDeAtraso(projeto({ fim_previsto: '2026-02-20', status: 'cancelado' }))).toBe(0);
  });

  it('nao acusa atraso sem data de fim', () => {
    expect(diasDeAtraso(projeto({ fim_previsto: null }))).toBe(0);
  });
});

describe('percentualEsperado', () => {
  it('mede quanto do prazo ja correu', () => {
    expect(percentualEsperado(base)).toBe(66);
  });

  it('fica indefinido sem as duas datas', () => {
    expect(percentualEsperado(projeto({ inicio_previsto: null }))).toBeNull();
  });
});

describe('saude', () => {
  it('marca critico quando passou do prazo', () => {
    expect(saude(projeto({ fim_previsto: '2026-02-01' }))).toBe('critico');
  });

  it('marca atencao quando entregou pouco para o prazo ja corrido', () => {
    // Esperado 66% do prazo; uma atividade concluída de quatro: 25%.
    const pai = projeto({ id: 'pai' });
    const dentro = ['a', 'b', 'c', 'd'].map((id, i) => projeto({
      id, projeto_pai_id: 'pai', status: i === 0 ? 'concluido' : 'em_andamento',
    }));
    expect(saude(pai, [pai, ...dentro])).toBe('atencao');
  });

  it('marca no prazo quando a conclusao acompanha o ritmo', () => {
    const pai = projeto({ id: 'pai' });
    const dentro = ['a', 'b', 'c', 'd'].map((id, i) => projeto({
      id, projeto_pai_id: 'pai', status: i === 3 ? 'em_andamento' : 'concluido',
    }));
    expect(saude(pai, [pai, ...dentro])).toBe('no_prazo');
  });

  it('nao cobra ritmo de atividade sem nada dentro', () => {
    // Sem atividades nao ha entrega parcial para comparar: quem cobra e
    // a data, e ela ainda nao venceu.
    expect(saude(projeto({}))).toBe('no_prazo');
  });

  it('separa o que ja foi encerrado', () => {
    expect(saude(projeto({ status: 'concluido' }))).toBe('encerrado');
  });
});

describe('venceEm', () => {
  it('pega o que vence dentro da janela', () => {
    expect(venceEm(projeto({ fim_previsto: '2026-03-10' }), 15)).toBe(true);
    expect(venceEm(projeto({ fim_previsto: '2026-04-10' }), 15)).toBe(false);
  });
});

describe('calcularIndicadores', () => {
  it('mede o avanço pela fatia concluída, sem contar a cancelada', () => {
    const i = calcularIndicadores([
      projeto({ id: 'a' }),
      projeto({ id: 'b' }),
      projeto({ id: 'c', status: 'concluido' }),
      projeto({ id: 'd', status: 'cancelado' }),
    ]);
    expect(i.total).toBe(4);
    expect(i.ativos).toBe(2);
    expect(i.concluidos).toBe(1);
    // Uma concluída de três que valem; a cancelada fica de fora.
    expect(i.percentualConcluido).toBe(33);
  });
});

describe('entregasPorMes', () => {
  it('conta so o que foi concluido, no mes da entrega', () => {
    const serie = entregasPorMes([
      projeto({ id: 'a', status: 'concluido', fim_real: '2026-02-10' }),
      projeto({ id: 'b', status: 'concluido', fim_real: '2026-02-25' }),
      projeto({ id: 'c', status: 'em_andamento', fim_real: '2026-02-25' }),
    ], 3);
    expect(serie).toHaveLength(3);
    expect(serie[1].total).toBe(2);
    expect(serie[2].total).toBe(0);
  });
});
