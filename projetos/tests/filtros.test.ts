import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { alternar, aplicarFiltros, filtrosAtivos, filtrosVazios } from '../src/dominio/filtros';
import type { MapaDeConteudo } from '../src/estado/conteudo';
import type { Projeto } from '../src/dominio/tipos';

const base = {
  projeto_pai_id: 'pai', rotulo_filhos: null, codigo: null, descricao: null,
  area: null, responsavel_id: null, status: 'em_andamento', prioridade: 'media',
  inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null,
  percentual: 0, criado_por: null, criado_em: '', atualizado_em: '',
} as const;

const lista: Projeto[] = [
  { ...base, id: 'a', nome: 'Inventário por RG', prioridade: 'alta' },
  { ...base, id: 'b', nome: 'Compactação de estoque', responsavel_id: 'p1' },
  { ...base, id: 'c', nome: 'Trava de paletes', status: 'concluido', fim_previsto: '2026-02-01' },
];

const conteudo: MapaDeConteudo = {
  a: { paginas: 2, tarefas: 0, marcos: 0, anexos: 0, documentos: 1 },
  b: { paginas: 0, tarefas: 3, marcos: 0, anexos: 0, documentos: 0 },
  c: { paginas: 0, tarefas: 0, marcos: 0, anexos: 0, documentos: 0 },
};

const ids = (l: Projeto[]) => l.map((p) => p.id);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 2, 1, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());

describe('aplicarFiltros', () => {
  it('sem filtro devolve tudo', () => {
    expect(ids(aplicarFiltros(lista, conteudo, filtrosVazios()))).toEqual(['a', 'b', 'c']);
  });

  it('separa quem tem de quem não tem documentação', () => {
    expect(ids(aplicarFiltros(lista, conteudo, { ...filtrosVazios(), paginas: 'com' }))).toEqual(['a']);
    expect(ids(aplicarFiltros(lista, conteudo, { ...filtrosVazios(), paginas: 'sem' }))).toEqual(['b', 'c']);
  });

  it('cruza dois conteúdos ao mesmo tempo', () => {
    // Sem páginas mas com tarefa: e a que esta sendo tocada sem documentar.
    const f = { ...filtrosVazios(), paginas: 'sem' as const, tarefas: 'com' as const };
    expect(ids(aplicarFiltros(lista, conteudo, f))).toEqual(['b']);
  });

  it('trata atividade sem contagem como quem não tem nada', () => {
    expect(ids(aplicarFiltros(lista, {}, { ...filtrosVazios(), paginas: 'sem' }))).toEqual(['a', 'b', 'c']);
  });

  it('busca sem acento e sem caixa', () => {
    expect(ids(aplicarFiltros(lista, conteudo, { ...filtrosVazios(), texto: 'inventario' }))).toEqual(['a']);
  });

  it('filtra por situação, prioridade e responsável', () => {
    expect(ids(aplicarFiltros(lista, conteudo, { ...filtrosVazios(), status: ['concluido'] }))).toEqual(['c']);
    expect(ids(aplicarFiltros(lista, conteudo, { ...filtrosVazios(), prioridades: ['alta'] }))).toEqual(['a']);
    expect(ids(aplicarFiltros(lista, conteudo, { ...filtrosVazios(), responsavelId: 'p1' }))).toEqual(['b']);
  });

  it('não conta como vencida a atividade já concluída', () => {
    // 'c' passou do prazo, mas esta concluida: nao e mais cobranca.
    expect(ids(aplicarFiltros(lista, conteudo, { ...filtrosVazios(), prazo: 'vencidas' }))).toEqual([]);
    expect(ids(aplicarFiltros(lista, conteudo, { ...filtrosVazios(), prazo: 'sem_prazo' }))).toEqual(['a', 'b']);
  });
});

describe('filtrosAtivos', () => {
  it('conta quantos filtros estão valendo', () => {
    expect(filtrosAtivos(filtrosVazios())).toBe(0);
    expect(filtrosAtivos({ ...filtrosVazios(), paginas: 'sem', texto: 'x', status: ['pausado'] })).toBe(3);
  });
});

describe('alternar', () => {
  it('marca e desmarca o mesmo item', () => {
    expect(alternar(['a'], 'b')).toEqual(['a', 'b']);
    expect(alternar(['a', 'b'], 'a')).toEqual(['b']);
  });
});
