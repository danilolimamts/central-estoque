/* ============================================================
   Testes do status do projeto (secao 7.5, 7.6 e 7.7).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  derivarAcao,
  derivarAcoes,
  calcularMetricas,
  calcularSaude,
  quadranteDe,
  montarMatriz,
} from '../src/domain/projeto';
import type { Acao } from '../src/domain/tipos';

const HOJE = new Date(Date.UTC(2026, 6, 22)); // 22/07/2026

function acao(p: Partial<Acao>): Acao {
  return {
    numPlanAction: '', proposta: '', oQueFazer: '', porque: '', comoSolucionar: '',
    responsavel: '', inicio: null, fim: null, reagendamento: null, situacao: '',
    dataConclusao: null, duracao: '', status: '', obs: '', esforco: 0,
    reduzErro: '', melhoraProdutividade: '', melhoraCliente: '', reduzCusto: '',
    aumentaSeguranca: '', impacto: 0,
    concluida: false, prazoValido: null, atrasada: false, reagendada: false, concluidaSemData: false,
    ...p,
  };
}

describe('7.7 derivados de prazo', () => {
  it('o prazo valido e o reagendamento quando existe', () => {
    const d = derivarAcao(
      acao({ fim: new Date(Date.UTC(2026, 5, 30)), reagendamento: new Date(Date.UTC(2026, 6, 15)) }),
      HOJE
    );
    expect(d.prazoValido?.getTime()).toBe(Date.UTC(2026, 6, 15));
    expect(d.reagendada).toBe(true);
  });

  it('sem reagendamento usa o fim', () => {
    const d = derivarAcao(acao({ fim: new Date(Date.UTC(2026, 5, 30)) }), HOJE);
    expect(d.prazoValido?.getTime()).toBe(Date.UTC(2026, 5, 30));
  });

  it('atrasada = nao concluida e prazo no passado', () => {
    const atrasada = derivarAcao(acao({ situacao: 'Pendente', fim: new Date(Date.UTC(2026, 5, 5)) }), HOJE);
    expect(atrasada.atrasada).toBe(true);
    const concluida = derivarAcao(acao({ situacao: 'Concluida', fim: new Date(Date.UTC(2026, 5, 5)) }), HOJE);
    expect(concluida.atrasada).toBe(false);
  });

  it('8.7 concluida sem data de conclusao', () => {
    const d = derivarAcao(acao({ situacao: 'Concluida', dataConclusao: null }), HOJE);
    expect(d.concluida).toBe(true);
    expect(d.concluidaSemData).toBe(true);
  });
});

describe('7.5 score decomposto e saude', () => {
  const brutas: Acao[] = [
    acao({ proposta: 'A', responsavel: 'Ana', situacao: 'Concluida', dataConclusao: new Date(Date.UTC(2026, 5, 9)), fim: new Date(Date.UTC(2026, 5, 10)), impacto: 5, esforco: 5 }),
    acao({ proposta: 'A', responsavel: 'Ana', situacao: 'Concluida', dataConclusao: new Date(Date.UTC(2026, 5, 9)), fim: new Date(Date.UTC(2026, 5, 10)), impacto: 5, esforco: 5 }),
    acao({ proposta: 'B', responsavel: 'Bruno', situacao: 'Pendente', fim: new Date(Date.UTC(2026, 5, 5)), impacto: 1, esforco: 15 }),
    acao({ proposta: 'B', responsavel: 'Bruno', situacao: 'Andamento', reagendamento: new Date(Date.UTC(2026, 7, 30)), fim: new Date(Date.UTC(2026, 5, 5)), impacto: 1, esforco: 15 }),
  ];
  const derivadas = derivarAcoes(brutas, HOJE);
  const m = calcularMetricas(derivadas);

  it('conta situacoes', () => {
    expect(m.total).toBe(4);
    expect(m.concluidas).toBe(2);
    expect(m.atrasadas).toBe(1); // acao 3, pendente e vencida
    expect(m.reagendadas).toBe(1); // acao 4
    expect(m.responsaveis).toBe(2);
    expect(m.propostas).toBe(2);
  });

  it('pilares e score conferem com a formula', () => {
    const pilar = (c: string) => m.pilares.find((p) => p.chave === c)!;
    expect(pilar('entrega').valor).toBeCloseTo(50);
    expect(pilar('prazo').valor).toBeCloseTo(75);
    expect(pilar('estabilidade').valor).toBeCloseTo(75);
    expect(pilar('retorno').valor).toBeCloseTo(40, 1);
    expect(m.score).toBe(60);
  });

  it('saude amarela em score medio com atraso moderado', () => {
    expect(m.saude).toBe('atencao');
  });

  it('cortes de saude', () => {
    expect(calcularSaude(75, 0, 10)).toBe('saudavel');
    expect(calcularSaude(75, 3, 10)).toBe('atencao'); // atraso 30%
    expect(calcularSaude(40, 0, 10)).toBe('critico');
  });
});

describe('7.6 matriz Impacto x Esforco', () => {
  it('quadrantes com cortes ao meio (X=8, Y=3)', () => {
    expect(quadranteDe(5, 5)).toBe('ganhos_rapidos');
    expect(quadranteDe(4, 15)).toBe('estrategicos'); // Melhoria Bseller
    expect(quadranteDe(3, 5)).toBe('incrementais'); // impacto 3 nao e alto
    expect(quadranteDe(2, 15)).toBe('baixa_prioridade');
    expect(quadranteDe(4, 8)).toBe('ganhos_rapidos'); // esforco 8 e baixo
  });

  it('um ponto por proposta', () => {
    const acoes = derivarAcoes([
      acao({ proposta: 'A', impacto: 5, esforco: 5 }),
      acao({ proposta: 'A', impacto: 5, esforco: 5 }),
      acao({ proposta: 'B', impacto: 4, esforco: 15 }),
    ], HOJE);
    const pontos = montarMatriz(acoes);
    expect(pontos).toHaveLength(2);
    expect(pontos.find((p) => p.proposta === 'A')?.acoes).toBe(2);
  });
});
