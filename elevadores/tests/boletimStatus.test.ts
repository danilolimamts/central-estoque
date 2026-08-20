/* ============================================================
   Testes do boletim do Status do Projeto.

   A captura em si depende do navegador e fica na verificacao com
   Playwright. Aqui se confere o que da para conferir sem tela: os
   dados do cabecalho e o resumo em texto que vai no corpo do e-mail.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { dadosDoBoletim, nomeDoArquivo, textoBoletim, CLASSE_FORA, coletarCss } from '../src/export/boletimStatus';
import { calcularMetricas, derivarAcoes } from '../src/domain/projeto';
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

/* Plano com as tres situacoes representadas. */
function planoExemplo(): Acao[] {
  return derivarAcoes(
    [
      acao({
        numPlanAction: '1', proposta: 'Cadastro', responsavel: 'Ana', situacao: 'CONCLUIDO',
        dataConclusao: new Date(Date.UTC(2026, 5, 10)), fim: new Date(Date.UTC(2026, 5, 12)),
        impacto: 9, esforco: 2, reduzErro: 'SIM',
      }),
      acao({
        numPlanAction: '2', proposta: 'Cadastro', responsavel: 'Ana', situacao: 'EM ANDAMENTO',
        fim: new Date(Date.UTC(2026, 8, 30)), impacto: 7, esforco: 3,
      }),
      acao({
        numPlanAction: '3', proposta: 'Reversa', responsavel: 'Bruno', situacao: '',
        fim: new Date(Date.UTC(2026, 5, 1)), impacto: 10, esforco: 5,
      }),
      acao({
        numPlanAction: '4', proposta: 'Reversa', responsavel: 'Bruno', situacao: '',
        fim: new Date(Date.UTC(2026, 9, 15)), impacto: 4, esforco: 4,
      }),
    ],
    HOJE
  );
}

describe('cabecalho do boletim', () => {
  it('leva score, saude traduzida e a data da posicao', () => {
    const acoes = planoExemplo();
    const m = calcularMetricas(acoes);
    const d = dadosDoBoletim(m, HOJE);

    expect(d.titulo).toBe('Equalização de Elevadores');
    expect(d.subtitulo).toContain('CD Cajamar');
    expect(d.data).toBe('22/07/2026');
    expect(d.score).toBe(m.score);
    expect(['Saudável', 'Atenção', 'Crítico']).toContain(d.saudeRotulo);
    expect(d.saudeCor).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('aceita outro local no subtitulo', () => {
    const d = dadosDoBoletim(calcularMetricas(planoExemplo()), HOJE, 'CD Extrema');
    expect(d.subtitulo).toContain('CD Extrema');
  });

  it('a saude critica sai em vermelho e a saudavel em verde', () => {
    const criticas = derivarAcoes(
      [1, 2, 3, 4].map((n) =>
        acao({ numPlanAction: String(n), fim: new Date(Date.UTC(2026, 0, 1)), impacto: 5, esforco: 5 })
      ),
      HOJE
    );
    expect(dadosDoBoletim(calcularMetricas(criticas), HOJE).saudeCor).toBe('#C83812');

    const boas = derivarAcoes(
      [1, 2, 3, 4].map((n) =>
        acao({
          numPlanAction: String(n), situacao: 'CONCLUIDO', impacto: 10, esforco: 1,
          dataConclusao: new Date(Date.UTC(2026, 5, 1)), fim: new Date(Date.UTC(2026, 5, 2)),
        })
      ),
      HOJE
    );
    expect(dadosDoBoletim(calcularMetricas(boas), HOJE).saudeCor).toBe('#1F7A4C');
  });
});

describe('nome do arquivo', () => {
  it('carrega a data, para as versoes nao se sobrescreverem', () => {
    expect(nomeDoArquivo(HOJE)).toBe('boletim-status-projeto-2026-07-22.png');
  });
});

describe('resumo em texto para o corpo do e-mail', () => {
  it('traz score, saude, andamento e proximos passos', () => {
    const acoes = planoExemplo();
    const m = calcularMetricas(acoes);
    const texto = textoBoletim(acoes, m, HOJE);

    expect(texto).toContain('22/07/2026');
    expect(texto).toContain(`Score: ${m.score}/100`);
    expect(texto).toContain('Concluídas:');
    expect(texto).toContain('Em andamento:');
    expect(texto).toContain('Não iniciadas:');
    expect(texto).toContain('Em atraso:');
    expect(texto).toContain('Próximos passos:');
    expect(texto).toContain('  1. ');
  });

  it('as tres situacoes somam o total de acoes', () => {
    const acoes = planoExemplo();
    const texto = textoBoletim(acoes, calcularMetricas(acoes), HOJE);
    const numero = (rotulo: string) => Number(texto.match(new RegExp(`${rotulo}: (\\d+)`))![1]);
    const soma =
      numero('Concluídas') + numero('Em andamento') + numero('Não iniciadas');
    expect(soma).toBe(acoes.length);
  });

  it('plano vazio nao quebra nem divide por zero', () => {
    const texto = textoBoletim([], calcularMetricas([]), HOJE);
    expect(texto).toContain('Concluídas: 0 (0%)');
    expect(texto).toContain('Próximos passos:');
  });

  it('no maximo quatro passos, para o e-mail nao virar relatorio', () => {
    const acoes = planoExemplo();
    const texto = textoBoletim(acoes, calcularMetricas(acoes), HOJE);
    const passos = texto.match(/^ {2}\d\. /gm) ?? [];
    expect(passos.length).toBeGreaterThan(0);
    expect(passos.length).toBeLessThanOrEqual(4);
  });
});

describe('marcacao do que sai da imagem', () => {
  it('a classe e estavel: a pagina e o modal dependem dela', () => {
    expect(CLASSE_FORA).toBe('fora-do-boletim');
  });
});

describe('estilos embutidos na captura', () => {
  /* Uma folha de estilo falsa, no formato que o navegador entrega. */
  const folha = (regras: string[]): CSSStyleSheet =>
    ({ cssRules: regras.map((cssText) => ({ cssText })) } as unknown as CSSStyleSheet);

  const lista = (folhas: CSSStyleSheet[]): StyleSheetList =>
    folhas as unknown as StyleSheetList;

  it('junta as regras de todas as folhas da página', () => {
    const css = coletarCss(lista([folha(['.a{color:red}']), folha(['.b{color:blue}'])]));
    expect(css).toContain('.a{color:red}');
    expect(css).toContain('.b{color:blue}');
  });

  it('folha de outra origem não derruba a captura', () => {
    /* A do Google Fonts bloqueia cssRules. Antes disso ser tratado, a
       exceção interrompia a leitura e o clone ficava sem estilo
       nenhum - a imagem saía como texto solto. */
    const bloqueada = {
      get cssRules(): CSSRuleList {
        throw new DOMException('cross-origin', 'SecurityError');
      },
    } as unknown as CSSStyleSheet;

    const css = coletarCss(lista([bloqueada, folha(['.c{color:green}'])]));
    expect(css).toContain('.c{color:green}');
  });

  it('página sem folha nenhuma devolve vazio, e não quebra', () => {
    expect(coletarCss(lista([]))).toBe('');
  });
});
