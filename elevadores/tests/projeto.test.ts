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
  explicarSaude,
  pilarMaisFraco,
  proximosPassos,
  ganhosDaAcao,
  resumirGanhos,
  acoesUnicas,
  inicioDoProjeto,
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

describe('leitura em texto do status', () => {
  const comAtraso = derivarAcoes(
    [
      acao({ situacao: 'Concluída', dataConclusao: new Date(Date.UTC(2026, 5, 9)), fim: new Date(Date.UTC(2026, 5, 10)) }),
      acao({ situacao: 'Pendente', fim: new Date(Date.UTC(2026, 5, 5)) }),
      acao({ situacao: 'Pendente', fim: new Date(Date.UTC(2026, 5, 5)) }),
      acao({ situacao: 'Concluída', dataConclusao: null, fim: new Date(Date.UTC(2026, 5, 10)) }),
    ],
    HOJE
  );
  const met = calcularMetricas(comAtraso);

  it('a explicacao da saude cita os numeros que a decidiram', () => {
    const texto = explicarSaude(met);
    expect(texto).toContain('2 de 4');
    expect(texto).toMatch(/crítico|atenção|em dia/i);
  });

  it('aponta o pilar que mais custou pontos', () => {
    const fraco = pilarMaisFraco(met);
    expect(fraco).not.toBeNull();
    expect(fraco!.perdido).toBeGreaterThan(0);
    // Nenhum outro pilar pode ter perdido mais que o apontado.
    for (const p of met.pilares) {
      expect((100 - p.valor) * p.peso).toBeLessThanOrEqual(fraco!.perdido + 0.001);
    }
  });

  it('os proximos passos saem dos dados, em ordem do que trava mais', () => {
    const passos = proximosPassos(comAtraso, met, montarMatriz(comAtraso));
    expect(passos[0].texto).toContain('2 ações em atraso');
    expect(passos.some((p) => p.texto.includes('data de conclusão'))).toBe(true);
  });

  it('plano em dia nao inventa pendencia', () => {
    const emDia = derivarAcoes(
      [acao({ situacao: 'Concluída', dataConclusao: new Date(Date.UTC(2026, 5, 9)), fim: new Date(Date.UTC(2026, 5, 10)), proposta: '' })],
      HOJE
    );
    const passos = proximosPassos(emDia, calcularMetricas(emDia), []);
    expect(passos).toHaveLength(1);
    expect(passos[0].texto).toContain('em dia');
  });
});

describe('ganhos de cada acao', () => {
  it('le as colunas de beneficio da planilha, na ordem fixa', () => {
    const a = acao({
      reduzErro: 'SIM', melhoraProdutividade: 'NAO', melhoraCliente: 'Sim',
      reduzCusto: '', aumentaSeguranca: 'SIM',
    });
    expect(ganhosDaAcao(a)).toEqual(['erro', 'cliente', 'seguranca']);
  });

  it('acao sem nenhum beneficio marcado devolve lista vazia', () => {
    expect(ganhosDaAcao(acao({
      reduzErro: 'NAO', melhoraProdutividade: 'NAO', melhoraCliente: 'NAO',
      reduzCusto: 'NAO', aumentaSeguranca: 'NAO',
    }))).toEqual([]);
  });

  it('resume quantas acoes endereçam cada ganho e quantas ja entregaram', () => {
    const lista = derivarAcoes([
      acao({ situacao: 'Concluída', dataConclusao: new Date(Date.UTC(2026, 5, 9)), reduzErro: 'SIM', reduzCusto: 'SIM' }),
      acao({ situacao: 'Pendente', reduzErro: 'SIM', reduzCusto: 'NAO' }),
    ], HOJE);
    const r = resumirGanhos(lista);
    const erro = r.find((x) => x.chave === 'erro')!;
    expect(erro.total).toBe(2);
    expect(erro.entregues).toBe(1);
    expect(erro.pct).toBe(50);
    const custo = r.find((x) => x.chave === 'custo')!;
    expect(custo.total).toBe(1);
    expect(custo.pct).toBe(100);
  });
});

describe('linhas repetidas da planilha', () => {
  const repetida = {
    numPlanAction: '9', proposta: 'EQUALIZAÇÃO DE SALDO', oQueFazer: 'Ajustar saldo',
    responsavel: 'DARLAN SANTOS', situacao: 'Pendente',
    fim: new Date(Date.UTC(2026, 6, 27)),
  };

  it('a mesma linha duas vezes conta uma vez so', () => {
    const { lista, repetidas } = acoesUnicas(derivarAcoes([acao(repetida), acao(repetida)], HOJE));
    expect(lista).toHaveLength(1);
    expect(repetidas).toBe(1);
  });

  it('atividades diferentes do mesmo PLAN ACTION continuam as duas', () => {
    const { lista, repetidas } = acoesUnicas(
      derivarAcoes(
        [acao(repetida), acao({ ...repetida, oQueFazer: 'Capacidade do local' })],
        HOJE
      )
    );
    expect(lista).toHaveLength(2);
    expect(repetidas).toBe(0);
  });

  it('mesmo texto com responsavel diferente sao duas acoes', () => {
    const { lista } = acoesUnicas(
      derivarAcoes([acao(repetida), acao({ ...repetida, responsavel: 'ANA SOUZA' })], HOJE)
    );
    expect(lista).toHaveLength(2);
  });

  it('mantem a ordem original, guardando a primeira aparicao', () => {
    const { lista } = acoesUnicas(
      derivarAcoes(
        [
          acao({ ...repetida, oQueFazer: 'Primeira' }),
          acao({ ...repetida, oQueFazer: 'Segunda' }),
          acao({ ...repetida, oQueFazer: 'Primeira' }),
        ],
        HOJE
      )
    );
    expect(lista.map((a) => a.oQueFazer)).toEqual(['Primeira', 'Segunda']);
  });
});

describe('recorte concluida contra nao concluida', () => {
  const lista = derivarAcoes(
    [
      acao({ situacao: 'Concluída', dataConclusao: new Date(Date.UTC(2026, 5, 9)) }),
      acao({ situacao: 'Pendente', fim: new Date(Date.UTC(2026, 5, 5)) }), // atrasada
      acao({ situacao: 'Em andamento', fim: new Date(Date.UTC(2026, 8, 5)) }),
    ],
    HOJE
  );

  it('os dois recortes somam o total, sem sobra nem repeticao', () => {
    const concluidas = lista.filter((a) => a.concluida);
    const abertas = lista.filter((a) => !a.concluida);
    expect(concluidas).toHaveLength(1);
    expect(abertas).toHaveLength(2);
    expect(concluidas.length + abertas.length).toBe(lista.length);
    /* Nenhuma acao cai nos dois lados: era o que acontecia com o recorte
       de atrasadas, que repetia as pendentes e as em andamento. */
    expect(concluidas.filter((a) => abertas.includes(a))).toHaveLength(0);
  });

  it('a acao atrasada entra em nao concluida', () => {
    const atrasada = lista.find((a) => a.atrasada)!;
    expect(atrasada.concluida).toBe(false);
  });
});

describe('início do projeto', () => {
  const em = (mes: number, dia = 1) => new Date(Date.UTC(2026, mes, dia));

  it('é a data de início mais antiga do plano, esteja ela em qualquer posição', () => {
    /* A planilha não vem ordenada por data, então não basta pegar a
       primeira linha. */
    const inicio = inicioDoProjeto([
      acao({ inicio: em(4, 10) }),
      acao({ inicio: em(2, 3) }),
      acao({ inicio: em(7, 1) }),
    ]);
    expect(inicio?.getTime()).toBe(em(2, 3).getTime());
  });

  it('ação sem data de início não conta', () => {
    const inicio = inicioDoProjeto([acao({ inicio: null }), acao({ inicio: em(5, 20) })]);
    expect(inicio?.getTime()).toBe(em(5, 20).getTime());
  });

  it('plano sem nenhuma data não inventa um início', () => {
    /* Nulo faz o marco sumir do gráfico. Chutar uma data desenharia
       uma virada que ninguém pode confirmar. */
    expect(inicioDoProjeto([acao({ inicio: null })])).toBeNull();
    expect(inicioDoProjeto([])).toBeNull();
  });
});
