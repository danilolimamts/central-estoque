/* ============================================================
   Testes do historico do projeto.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  marcoDe,
  registrarMarco,
  marcosDe,
  compararComAnterior,
  serieDoHistorico,
  explicarVariacao,
  LIMITE_MARCOS,
} from '../src/domain/historico';
import type { Marco } from '../src/domain/historico';
import type { MetricasProjeto } from '../src/domain/tipos';

function metricas(p: Partial<MetricasProjeto> = {}): MetricasProjeto {
  return {
    total: 32, concluidas: 20, emAndamento: 5, pendentes: 7, atrasadas: 12,
    reagendadas: 0, concluidasSemData: 0, pctConcluidas: 62.5,
    mediaImpacto: 7, mediaEsforco: 3, pilares: [], score: 63, saude: 'critico',
    responsaveis: 7, propostas: 9,
    ...p,
  };
}

function marco(dia: string, p: Partial<Marco> = {}): Marco {
  return {
    ...marcoDe(metricas(), 'plano.xlsx', new Date(`${dia}T12:00:00.000Z`)),
    ...p,
  };
}

describe('registro de marcos', () => {
  it('guarda o marco em ordem de tempo', () => {
    let h: Marco[] = [];
    h = registrarMarco(h, marco('2026-07-01'));
    h = registrarMarco(h, marco('2026-07-15'));
    h = registrarMarco(h, marco('2026-07-08'));
    expect(h.map((m) => m.em.slice(0, 10))).toEqual(['2026-07-01', '2026-07-08', '2026-07-15']);
  });

  it('reimportar no mesmo dia substitui, em vez de virar dois pontos', () => {
    let h: Marco[] = [];
    h = registrarMarco(h, marco('2026-07-10', { score: 50 }));
    h = registrarMarco(h, {
      ...marcoDe(metricas({ score: 58 }), 'plano.xlsx', new Date('2026-07-10T18:00:00.000Z')),
    });
    expect(h).toHaveLength(1);
    expect(h[0].score).toBe(58);
  });

  it('o exemplo nunca vira historico da planilha de verdade', () => {
    let h: Marco[] = [];
    h = registrarMarco(h, marco('2026-07-10', { score: 50 }));
    h = registrarMarco(h, marco('2026-07-10', { demonstracao: true, score: 90 }));
    expect(h).toHaveLength(2);
    expect(marcosDe(h, false).map((m) => m.score)).toEqual([50]);
    expect(marcosDe(h, true).map((m) => m.score)).toEqual([90]);
  });

  it('para de crescer no limite, descartando os mais antigos', () => {
    let h: Marco[] = [];
    for (let i = 1; i <= LIMITE_MARCOS + 12; i++) {
      const dia = new Date(Date.UTC(2026, 0, i)).toISOString().slice(0, 10);
      h = registrarMarco(h, marco(dia, { score: i }));
    }
    expect(h).toHaveLength(LIMITE_MARCOS);
    /* Ficaram os ultimos, nao os primeiros. */
    expect(h[h.length - 1].score).toBe(LIMITE_MARCOS + 12);
    expect(h[0].score).toBe(13);
  });
});

describe('comparacao com a medicao anterior', () => {
  it('mede a variacao contra o marco imediatamente anterior', () => {
    const antigo = marco('2026-07-01', { score: 55, concluidas: 14, atrasadas: 15 });
    const meio = marco('2026-07-08', { score: 60, concluidas: 17, atrasadas: 14 });
    const atual = marco('2026-07-15', { score: 63, concluidas: 20, atrasadas: 12 });
    const v = compararComAnterior(atual, [antigo, meio]);

    expect(v).not.toBeNull();
    expect(v!.anterior.em).toBe(meio.em);
    expect(v!.dias).toBe(7);
    expect(v!.score).toBe(3);
    expect(v!.concluidas).toBe(3);
    expect(v!.atrasadas).toBe(-2);
  });

  it('sem historico anterior nao inventa variacao contra zero', () => {
    const atual = marco('2026-07-15');
    expect(compararComAnterior(atual, [])).toBeNull();
    expect(compararComAnterior(atual, [atual])).toBeNull();
  });

  it('nao compara com marco de outra origem', () => {
    const doExemplo = marco('2026-07-01', { demonstracao: true, score: 10 });
    const atual = marco('2026-07-15');
    expect(compararComAnterior(atual, [doExemplo])).toBeNull();
  });

  it('marco posterior ao atual nao serve de referencia', () => {
    const futuro = marco('2026-08-01', { score: 90 });
    const atual = marco('2026-07-15', { score: 63 });
    expect(compararComAnterior(atual, [futuro])).toBeNull();
  });
});

describe('serie para o grafico', () => {
  it('sai na ordem do tempo, so com os marcos da origem em uso', () => {
    const h = [
      marco('2026-07-01', { score: 55 }),
      marco('2026-07-08', { demonstracao: true, score: 99 }),
      marco('2026-07-15', { score: 63 }),
    ];
    const s = serieDoHistorico(h, false);
    expect(s.map((p) => p.score)).toEqual([55, 63]);
    expect(s[0].rotulo).toBe('01/07');
  });

  it('historico vazio devolve serie vazia', () => {
    expect(serieDoHistorico([], false)).toEqual([]);
  });
});

describe('frase da variacao', () => {
  it('avisa quando e a primeira medicao', () => {
    expect(explicarVariacao(null)).toContain('Primeira medição');
  });

  it('conta o que mudou desde a ultima', () => {
    const anterior = marco('2026-07-08', { score: 60, concluidas: 17, atrasadas: 14 });
    const atual = marco('2026-07-15', { score: 63, concluidas: 20, atrasadas: 12 });
    const frase = explicarVariacao(compararComAnterior(atual, [anterior]));
    expect(frase).toContain('há 7 dias');
    expect(frase).toContain('score +3');
    expect(frase).toContain('+3 ação(ões) concluída(s)');
    expect(frase).toContain('-2 em atraso');
  });

  it('nao enfeita quando nada mudou', () => {
    const anterior = marco('2026-07-14');
    const atual = marco('2026-07-15');
    expect(explicarVariacao(compararComAnterior(atual, [anterior]))).toContain('Sem mudança');
  });
});
