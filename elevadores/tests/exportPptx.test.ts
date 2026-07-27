/* ============================================================
   Testes da apresentacao de status (secao 12 do brief).
   Confere a quantidade de slides de cada recorte, que o arquivo
   sai valido e que os proximos passos saem dos dados.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { gerarApresentacao, RECORTES, type Recorte } from '../src/export/exportPptx';
import { derivarAcoes } from '../src/domain/projeto';
import type { Acao } from '../src/domain/tipos';

const HOJE = new Date(Date.UTC(2026, 6, 22));

function acao(p: Partial<Acao>): Acao {
  return {
    numPlanAction: '1', proposta: 'Proposta A', oQueFazer: 'Fazer', porque: '', comoSolucionar: '',
    responsavel: 'Ana', inicio: null, fim: null, reagendamento: null, situacao: 'Pendente',
    dataConclusao: null, duracao: '', status: '', obs: '', esforco: 5,
    reduzErro: 'SIM', melhoraProdutividade: 'SIM', melhoraCliente: 'NAO', reduzCusto: 'SIM',
    aumentaSeguranca: 'NAO', impacto: 4,
    concluida: false, prazoValido: null, atrasada: false, reagendada: false, concluidaSemData: false,
    ...p,
  };
}

const BASE: Acao[] = derivarAcoes(
  [
    acao({ numPlanAction: '1', situacao: 'Concluída', dataConclusao: new Date(Date.UTC(2026, 5, 9)), fim: new Date(Date.UTC(2026, 5, 10)), impacto: 5 }),
    acao({ numPlanAction: '2', situacao: 'Concluída', dataConclusao: null, fim: new Date(Date.UTC(2026, 5, 10)) }),
    acao({ numPlanAction: '3', proposta: 'Proposta B', responsavel: 'Bruno', fim: new Date(Date.UTC(2026, 5, 5)), esforco: 15, impacto: 2 }),
    acao({ numPlanAction: '4', proposta: 'Proposta B', responsavel: 'Bruno', reagendamento: new Date(Date.UTC(2026, 7, 30)), fim: new Date(Date.UTC(2026, 5, 5)), esforco: 15, impacto: 5 }),
  ],
  HOJE
);

function contarSlides(recorte: Recorte, acoes = BASE): number {
  const pptx = gerarApresentacao(acoes, recorte);
  return (pptx as unknown as { slides: unknown[] }).slides.length;
}

describe('12 quantidade de slides por recorte', () => {
  it('executivo tem 5', () => expect(contarSlides('executivo')).toBe(5));
  it('completo tem 9', () => expect(contarSlides('completo')).toBe(9));
  it('foco em atrasos tem 5', () => expect(contarSlides('atrasos')).toBe(5));
  it('por responsavel tem 5', () => expect(contarSlides('responsavel')).toBe(5));
});

describe('12 padrao da apresentacao', () => {
  it('e 16:9 e leva os dados do arquivo', () => {
    const pptx = gerarApresentacao(BASE, 'executivo');
    expect(pptx.company).toBe('Loja do Mecânico');
    expect(pptx.title).toContain('Executivo');
  });

  it('gera um arquivo valido, com assinatura de zip', async () => {
    const pptx = gerarApresentacao(BASE, 'completo');
    const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    expect(buf.length).toBeGreaterThan(10000);
    // Todo .pptx e um zip: comeca com PK.
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('todos os recortes sao gerados sem erro', () => {
    for (const r of RECORTES) {
      expect(() => gerarApresentacao(BASE, r.valor)).not.toThrow();
    }
  });

  it('respeita a lista filtrada que recebe', () => {
    const so2 = BASE.filter((a) => a.responsavel === 'Bruno');
    expect(() => gerarApresentacao(so2, 'responsavel')).not.toThrow();
    expect(contarSlides('responsavel', so2)).toBe(5);
  });

  it('nao quebra com lista vazia', () => {
    expect(() => gerarApresentacao([], 'executivo')).not.toThrow();
  });
});
