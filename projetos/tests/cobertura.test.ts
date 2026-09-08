import { afterEach, describe, expect, it } from 'vitest';
import { cobertura, porcentagem, temChamado } from '../src/dominio/cobertura';
import type { MapaDeConteudo } from '../src/estado/conteudo';
import type { Projeto } from '../src/dominio/tipos';
import { SITUACOES_PADRAO, definirSituacoes } from '../src/dominio/situacoes';

const projeto = (id: string, chamado: string | null = null): Projeto => ({
  id, codigo: null, nome: id, descricao: null, projeto_pai_id: 'g1', rotulo_filhos: null,
  area: null, responsavel_id: null, status: 'em_andamento', prioridade: 'media',
  inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null,
  percentual: 0, criado_por: null, criado_em: '', atualizado_em: '',
  chamado, chamado_url: null, ticket_jira: null,
});

const conteudo = (mapa: Record<string, Partial<{ paginas: number; documentos: number; anexos: number }>>): MapaDeConteudo =>
  Object.fromEntries(Object.entries(mapa).map(([id, c]) => [id, {
    paginas: c.paginas ?? 0, tarefas: 0, marcos: 0, anexos: c.anexos ?? 0, documentos: c.documentos ?? 0,
  }]));

describe('cobertura', () => {
  afterEach(() => definirSituacoes(SITUACOES_PADRAO));

  it('conta documentada por qualquer formato: página, documento gerado ou anexo', () => {
    const c = cobertura(
      [projeto('a'), projeto('b'), projeto('c'), projeto('d')],
      conteudo({ a: { paginas: 1 }, b: { documentos: 1 }, c: { anexos: 2 } }),
    );
    expect(c.documentadas).toBe(3);
    expect(c.semDocumento).toBe(1);
  });

  it('separa o que já virou chamado do que está pronto para abrir', () => {
    const c = cobertura(
      [projeto('a', '145537'), projeto('b'), projeto('c')],
      conteudo({ a: { documentos: 1 }, b: { documentos: 1 } }),
    );
    expect(c.comChamado).toBe(1);
    expect(c.aAbrir).toBe(1);
    expect(c.total).toBe(3);
  });

  it('chamado só conta quando tem número ou link de verdade', () => {
    expect(temChamado(projeto('a', '  '))).toBe(false);
    expect(temChamado({ ...projeto('a'), chamado_url: 'https://exemplo/145537' })).toBe(true);
  });

  it('sem atividade, tudo é zero e a porcentagem não estoura', () => {
    const c = cobertura([], {});
    expect(c).toEqual({ total: 0, documentadas: 0, comChamado: 0, jaPedidas: 0, aAbrir: 0, semDocumento: 0 });
    expect(porcentagem(0, 0)).toBe(0);
  });

  it('arredonda a porcentagem', () => {
    expect(porcentagem(1, 3)).toBe(33);
    expect(porcentagem(2, 3)).toBe(67);
    expect(porcentagem(12, 12)).toBe(100);
  });

  it('conta como pedida quem passou da situação de chamado, mesmo sem o número', () => {
    definirSituacoes(SITUACOES_PADRAO.map((s) => (
      s.chave === 'em_risco' ? { ...s, chamado: true } : s
    )));
    const emDesenvolvimento = { ...projeto('a'), status: 'pausado' };
    const c = cobertura(
      [emDesenvolvimento, projeto('b'), projeto('c', '145537')],
      conteudo({ a: { documentos: 1 }, b: { documentos: 1 } }),
    );
    /* "Pausado" vem depois de "Em risco" na fila padrão. */
    expect(c.jaPedidas).toBe(2);
    expect(c.comChamado).toBe(1);
    /* Só "b" continua na fila do que dá para pedir. */
    expect(c.aAbrir).toBe(1);
  });

  it('sem situação marcada, pedida é só quem tem o número', () => {
    const c = cobertura([projeto('a', '1'), { ...projeto('b'), status: 'concluido' }], {});
    expect(c.jaPedidas).toBe(1);
  });
});
