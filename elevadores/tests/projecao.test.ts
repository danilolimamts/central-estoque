/* ============================================================
   Testes da projecao de termino.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { projetarTermino, explicarProjecao, ritmoNecessario, SEMANAS_DA_JANELA } from '../src/domain/projecao';
import { derivarAcoes } from '../src/domain/projeto';
import type { Acao } from '../src/domain/tipos';

const HOJE = new Date(Date.UTC(2026, 6, 22)); // 22/07/2026
const DIA = 86400000;

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

/* Concluida ha N dias. */
function entregue(n: number, diasAtras: number): Acao {
  return acao({
    numPlanAction: `c${n}`,
    situacao: 'CONCLUIDO',
    dataConclusao: new Date(HOJE.getTime() - diasAtras * DIA),
    fim: new Date(HOJE.getTime() - diasAtras * DIA),
  });
}

/* Em aberto, com prazo daqui a N dias. */
function aberta(n: number, prazoEmDias: number): Acao {
  return acao({
    numPlanAction: `a${n}`,
    fim: new Date(HOJE.getTime() + prazoEmDias * DIA),
  });
}

describe('ritmo', () => {
  it('conta so o que foi entregue dentro da janela', () => {
    const acoes = derivarAcoes(
      [
        entregue(1, 3), entregue(2, 10), entregue(3, 20), // dentro de 8 semanas
        entregue(4, 200), // fora da janela
        aberta(1, 30),
      ],
      HOJE
    );
    const p = projetarTermino(acoes, HOJE);
    expect(p.concluidasNaJanela).toBe(3);
    expect(p.ritmo).toBeCloseTo(3 / SEMANAS_DA_JANELA, 1);
  });

  it('concluida sem data de conclusao nao entra no ritmo', () => {
    const semData = acao({ numPlanAction: 'x', situacao: 'CONCLUIDO', dataConclusao: null, fim: null });
    const acoes = derivarAcoes([semData, aberta(1, 30)], HOJE);
    const p = projetarTermino(acoes, HOJE);
    expect(p.concluidasNaJanela).toBe(0);
    expect(p.situacao).toBe('parado');
  });
});

describe('projecao de termino', () => {
  it('projeta a data pelo que falta dividido pelo ritmo', () => {
    /* 8 entregues na janela = 1 por semana; 4 em aberto = 4 semanas. */
    const acoes = derivarAcoes(
      [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => entregue(n, n * 6)),
        ...[1, 2, 3, 4].map((n) => aberta(n, 90)),
      ],
      HOJE
    );
    const p = projetarTermino(acoes, HOJE);
    expect(p.ritmo).toBe(1);
    expect(p.abertas).toBe(4);
    expect(p.semanasRestantes).toBe(4);
    const esperado = new Date(HOJE.getTime() + 28 * DIA);
    expect(p.dataProjetada?.toISOString().slice(0, 10)).toBe(esperado.toISOString().slice(0, 10));
  });

  it('acusa atraso quando a projecao passa do prazo do plano', () => {
    /* 1 por semana, 8 em aberto = 8 semanas, mas o prazo e em 2. */
    const acoes = derivarAcoes(
      [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => entregue(n, n * 6)),
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => aberta(n, 14)),
      ],
      HOJE
    );
    const p = projetarTermino(acoes, HOJE);
    expect(p.situacao).toBe('atrasado');
    expect(p.desvioDias).toBeGreaterThan(0);
    expect(explicarProjecao(p)).toContain('depois do prazo');
  });

  it('diz no prazo quando a projecao cai antes do combinado', () => {
    const acoes = derivarAcoes(
      [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => entregue(n, n * 6)),
        aberta(1, 120),
      ],
      HOJE
    );
    const p = projetarTermino(acoes, HOJE);
    expect(p.situacao).toBe('no_prazo');
    expect(p.desvioDias).toBeLessThanOrEqual(0);
    expect(explicarProjecao(p)).toContain('antes do prazo');
  });

  it('sem entrega na janela nao inventa data', () => {
    const acoes = derivarAcoes([entregue(1, 300), aberta(1, 30)], HOJE);
    const p = projetarTermino(acoes, HOJE);
    expect(p.situacao).toBe('parado');
    expect(p.dataProjetada).toBeNull();
    expect(p.desvioDias).toBeNull();
    expect(explicarProjecao(p)).toContain('sem ritmo');
  });

  it('plano todo concluido nao projeta nada', () => {
    const acoes = derivarAcoes([entregue(1, 5), entregue(2, 9)], HOJE);
    const p = projetarTermino(acoes, HOJE);
    expect(p.situacao).toBe('concluido');
    expect(p.abertas).toBe(0);
    expect(explicarProjecao(p)).toContain('concluídas');
  });

  it('plano vazio nao quebra', () => {
    const p = projetarTermino([], HOJE);
    expect(p.situacao).toBe('concluido');
    expect(p.ritmo).toBe(0);
    expect(Number.isFinite(p.abertas)).toBe(true);
  });

  it('em aberto sem prazo nenhum: projeta, mas avisa que nao ha com que comparar', () => {
    const acoes = derivarAcoes(
      [...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => entregue(n, n * 6)), acao({ numPlanAction: 'z' })],
      HOJE
    );
    const p = projetarTermino(acoes, HOJE);
    expect(p.situacao).toBe('sem_prazo');
    expect(p.prazoPlano).toBeNull();
    expect(p.dataProjetada).not.toBeNull();
  });

  it('o prazo do plano e o ultimo entre as acoes em aberto', () => {
    const acoes = derivarAcoes(
      [...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => entregue(n, n * 6)), aberta(1, 10), aberta(2, 100)],
      HOJE
    );
    const p = projetarTermino(acoes, HOJE);
    const esperado = new Date(HOJE.getTime() + 100 * DIA);
    expect(p.prazoPlano?.toISOString().slice(0, 10)).toBe(esperado.toISOString().slice(0, 10));
  });
});

describe('ritmo necessario para bater o prazo', () => {
  it('diz quanto precisa acelerar quando esta atrasado', () => {
    const acoes = derivarAcoes(
      [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => entregue(n, n * 6)),
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => aberta(n, 14)),
      ],
      HOJE
    );
    const p = projetarTermino(acoes, HOJE);
    const preciso = ritmoNecessario(p, HOJE);
    expect(preciso).not.toBeNull();
    /* 8 acoes em 2 semanas = 4 por semana, contra o ritmo atual de 1. */
    expect(preciso).toBe(4);
    expect(preciso!).toBeGreaterThan(p.ritmo);
  });

  it('nao se aplica a quem esta no prazo', () => {
    const acoes = derivarAcoes(
      [...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => entregue(n, n * 6)), aberta(1, 120)],
      HOJE
    );
    expect(ritmoNecessario(projetarTermino(acoes, HOJE), HOJE)).toBeNull();
  });

  it('prazo ja vencido nao vira divisao por zero', () => {
    const acoes = derivarAcoes(
      [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => entregue(n, n * 6)),
        ...[1, 2].map((n) => aberta(n, -10)),
      ],
      HOJE
    );
    const p = projetarTermino(acoes, HOJE);
    expect(p.situacao).toBe('atrasado');
    expect(ritmoNecessario(p, HOJE)).toBeNull();
  });
});
