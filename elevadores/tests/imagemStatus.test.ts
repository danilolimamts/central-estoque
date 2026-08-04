/* ============================================================
   Testes da pagina de status em uma folha.

   O desenho no canvas nao entra aqui: o que se confere e o layout,
   que e calculado antes e sem navegador. A medida do texto e injetada
   com largura fixa por caractere, para o resultado nao depender das
   fontes instaladas na maquina que roda o teste.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  montarOnePage,
  quebrarLinhas,
  textoStatus,
  CORES_SITUACAO,
  LARGURA,
  FONTE_PASSO,
} from '../src/export/imagemStatus';
import { calcularMetricas, derivarAcoes } from '../src/domain/projeto';
import type { Acao } from '../src/domain/tipos';

const HOJE = new Date(Date.UTC(2026, 6, 22)); // 22/07/2026

/* 7px por caractere: previsivel e proximo o bastante do real. */
const medir = (texto: string) => texto.length * 7;

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

/* Plano com as tres situacoes representadas e alguns ganhos marcados. */
function planoExemplo(): Acao[] {
  return derivarAcoes(
    [
      acao({
        numPlanAction: '1', proposta: 'Cadastro', responsavel: 'Ana', situacao: 'CONCLUIDO',
        dataConclusao: new Date(Date.UTC(2026, 5, 10)), fim: new Date(Date.UTC(2026, 5, 12)),
        impacto: 9, esforco: 2, reduzErro: 'SIM', reduzCusto: 'SIM',
      }),
      acao({
        numPlanAction: '2', proposta: 'Cadastro', responsavel: 'Ana', situacao: 'EM ANDAMENTO',
        fim: new Date(Date.UTC(2026, 8, 30)), impacto: 7, esforco: 3, melhoraProdutividade: 'SIM',
      }),
      acao({
        numPlanAction: '3', proposta: 'Reversa', responsavel: 'Bruno', situacao: '',
        fim: new Date(Date.UTC(2026, 5, 1)), impacto: 10, esforco: 5, aumentaSeguranca: 'SIM',
      }),
      acao({
        numPlanAction: '4', proposta: 'Reversa', responsavel: 'Bruno', situacao: '',
        fim: new Date(Date.UTC(2026, 9, 15)), impacto: 4, esforco: 4,
      }),
    ],
    HOJE
  );
}

function montarExemplo() {
  const acoes = planoExemplo();
  return montarOnePage(acoes, calcularMetricas(acoes), medir, { data: HOJE });
}

describe('quebra de linhas', () => {
  it('quebra sem cortar palavra e respeita a largura', () => {
    const linhas = quebrarLinhas('uma frase bem comprida para quebrar', 70, FONTE_PASSO, medir);
    expect(linhas.length).toBeGreaterThan(1);
    for (const l of linhas) expect(medir(l)).toBeLessThanOrEqual(70);
    expect(linhas.join(' ')).toBe('uma frase bem comprida para quebrar');
  });

  it('texto vazio nao vira linha', () => {
    expect(quebrarLinhas('   ', 100, FONTE_PASSO, medir)).toEqual([]);
  });

  it('palavra maior que a largura fica na propria linha, sem travar', () => {
    const linhas = quebrarLinhas('antidesestabelecimentarismo ok', 20, FONTE_PASSO, medir);
    expect(linhas).toEqual(['antidesestabelecimentarismo', 'ok']);
  });
});

describe('pagina de status', () => {
  it('leva score, saude e a data da posicao', () => {
    const p = montarExemplo();
    expect(p.largura).toBe(LARGURA);
    expect(p.score).toBeGreaterThanOrEqual(0);
    expect(p.score).toBeLessThanOrEqual(100);
    expect(['Saudável', 'Atenção', 'Crítico']).toContain(p.saudeRotulo);
    expect(p.data).toBe('22/07/2026');
    expect(p.frase.length).toBeGreaterThan(0);
  });

  it('as fatias do andamento somam o total de acoes e fecham 100%', () => {
    const acoes = planoExemplo();
    const p = montarOnePage(acoes, calcularMetricas(acoes), medir, { data: HOJE });
    const soma = p.andamento.reduce((s, f) => s + f.quantidade, 0);
    expect(soma).toBe(acoes.length);
    expect(p.andamento.reduce((s, f) => s + f.pct, 0)).toBeCloseTo(100, 5);
  });

  it('usa verde para concluida, amarelo para andamento e vermelho para nao iniciada', () => {
    const p = montarExemplo();
    const cor = (c: string) => p.andamento.find((f) => f.chave === c)?.cor;
    expect(cor('concluida')).toBe(CORES_SITUACAO.concluida);
    expect(cor('andamento')).toBe(CORES_SITUACAO.andamento);
    expect(cor('pendente')).toBe(CORES_SITUACAO.pendente);
    /* A regra do projeto: verde, amarelo e vermelho, nesta ordem. */
    expect(CORES_SITUACAO.concluida).toBe('#1F7A4C');
    expect(CORES_SITUACAO.andamento).toBe('#B8860B');
    expect(CORES_SITUACAO.pendente).toBe('#C83812');
  });

  it('traz os quatro KPIs e os quatro pilares do score', () => {
    const p = montarExemplo();
    expect(p.kpis).toHaveLength(4);
    expect(p.kpis.map((k) => k.rotulo)).toEqual([
      'Ações no plano', 'Concluídas', 'Em andamento', 'Em atraso',
    ]);
    expect(p.pilares.map((b) => b.rotulo)).toEqual(['Entrega', 'Prazo', 'Estabilidade', 'Retorno']);
    for (const b of p.pilares) {
      expect(b.valor).toBeGreaterThanOrEqual(0);
      expect(b.valor).toBeLessThanOrEqual(100);
    }
  });

  it('lista os cinco ganhos do projeto, mesmo os sem acao', () => {
    const p = montarExemplo();
    expect(p.ganhos.map((g) => g.rotulo)).toEqual([
      'Reduz erro', 'Melhora produtividade', 'Melhora para o cliente',
      'Reduz custo', 'Aumenta segurança',
    ]);
    const erro = p.ganhos.find((g) => g.chave === 'erro')!;
    expect(erro.total).toBe(1);
    expect(erro.entregues).toBe(1);
    expect(erro.pct).toBe(100);
  });

  it('cabe em uma pagina: no maximo quatro passos, e conta os que sobraram', () => {
    const p = montarExemplo();
    expect(p.passos.length).toBeLessThanOrEqual(4);
    expect(p.passosOcultos).toBeGreaterThanOrEqual(0);
    for (const passo of p.passos) expect(passo.linhas.length).toBeGreaterThan(0);
  });

  it('nenhuma linha de passo passa da largura util da pagina', () => {
    const p = montarExemplo();
    const limite = LARGURA - 28 * 2 - 34;
    for (const passo of p.passos) {
      for (const linha of passo.linhas) expect(medir(linha)).toBeLessThanOrEqual(limite);
    }
  });

  it('a altura acompanha o tanto de texto dos passos', () => {
    const curto = montarExemplo();
    const acoes = planoExemplo();
    /* Medida mais larga por caractere gera mais quebras, logo mais altura. */
    const largo = montarOnePage(acoes, calcularMetricas(acoes), (t) => t.length * 12, { data: HOJE });
    expect(largo.altura).toBeGreaterThan(curto.altura);
  });

  it('plano vazio nao quebra e nao divide por zero', () => {
    const p = montarOnePage([], calcularMetricas([]), medir, { data: HOJE });
    expect(p.andamento.every((f) => f.quantidade === 0 && f.pct === 0)).toBe(true);
    expect(p.kpis[0].valor).toBe('0');
    expect(p.passos.length).toBeGreaterThan(0); // sempre sobra a orientacao de rotina
    expect(Number.isFinite(p.altura)).toBe(true);
  });
});

describe('resumo em texto para o corpo do e-mail', () => {
  it('repete score, saude, andamento e passos', () => {
    const acoes = planoExemplo();
    const m = calcularMetricas(acoes);
    const p = montarOnePage(acoes, m, medir, { data: HOJE });
    const texto = textoStatus(m, p, HOJE);

    expect(texto).toContain('22/07/2026');
    expect(texto).toContain(`Score: ${m.score}/100`);
    expect(texto).toContain(p.saudeRotulo);
    expect(texto).toContain('Concluídas:');
    expect(texto).toContain('Não iniciadas:');
    expect(texto).toContain('Próximos passos:');
    p.passos.forEach((_, i) => expect(texto).toContain(`  ${i + 1}. `));
  });
});
