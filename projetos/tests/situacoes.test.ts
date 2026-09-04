import { afterEach, describe, expect, it } from 'vitest';
import {
  SITUACOES_PADRAO, chaveNova, definirSituacoes, ehCancelada, ehConcluida, ehEncerrada,
  ordemDaSituacao, situacaoDe, situacoesVisiveis,
} from '../src/dominio/situacoes';
import { avancoPorConclusao, percentualEfetivo } from '../src/dominio/arvore';
import { calcularIndicadores, encerrado } from '../src/dominio/regras';
import type { Projeto } from '../src/dominio/tipos';

const base = {
  projeto_pai_id: null, rotulo_filhos: null, codigo: null, descricao: null, area: null,
  responsavel_id: null, prioridade: 'media', inicio_previsto: null, fim_previsto: null,
  inicio_real: null, fim_real: null, percentual: 0, criado_por: null, criado_em: '', atualizado_em: '',
} as const;

const projeto = (id: string, status: string, pai: string | null = null): Projeto =>
  ({ ...base, id, nome: id, status, projeto_pai_id: pai });

// O registro e global: cada teste que mexe nele devolve o padrao no fim.
afterEach(() => definirSituacoes(SITUACOES_PADRAO));

describe('situações de fábrica', () => {
  it('separa aberta, concluída e cancelada', () => {
    expect(ehConcluida('concluido')).toBe(true);
    expect(ehCancelada('cancelado')).toBe(true);
    expect(ehEncerrada('em_andamento')).toBe(false);
    expect(encerrado(projeto('a', 'concluido'))).toBe(true);
  });

  it('situação desconhecida vale como trabalho aberto, com o próprio nome', () => {
    const s = situacaoDe('aguardando_bseller');
    expect(s.rotulo).toBe('aguardando_bseller');
    expect(s.significado).toBe('aberta');
    expect(encerrado(projeto('a', 'aguardando_bseller'))).toBe(false);
  });
});

describe('situações criadas pela equipe', () => {
  it('uma situação nova pode encerrar e contar no avanço', () => {
    definirSituacoes([
      { chave: 'fazendo', rotulo: 'Fazendo', cor: '#000', usar: true, significado: 'aberta' },
      { chave: 'entregue', rotulo: 'Entregue ao Bseller', cor: '#0a0', usar: true, significado: 'concluida' },
      { chave: 'descartada', rotulo: 'Descartada', cor: '#a00', usar: true, significado: 'cancelada' },
    ]);

    const carteira = [
      projeto('pai', 'fazendo'),
      projeto('f1', 'entregue', 'pai'),
      projeto('f2', 'fazendo', 'pai'),
      projeto('f3', 'descartada', 'pai'),
    ];

    // Uma entregue de duas que valem; a descartada sai da conta.
    expect(avancoPorConclusao(carteira, 'pai')).toEqual({ concluidas: 1, total: 2, percentual: 50 });
    expect(percentualEfetivo(carteira, carteira[1])).toBe(100);
    expect(encerrado(carteira[1])).toBe(true);

    const i = calcularIndicadores(carteira.slice(1));
    expect(i.concluidos).toBe(1);
    // Uma entregue de duas que valem (a descartada nao entra).
    expect(i.percentualConcluido).toBe(50);
  });

  it('a ordem das colunas é a da configuração', () => {
    definirSituacoes([
      { chave: 'b', rotulo: 'B', cor: '#000', usar: true, significado: 'aberta' },
      { chave: 'a', rotulo: 'A', cor: '#000', usar: true, significado: 'aberta' },
    ]);
    expect(ordemDaSituacao('b')).toBeLessThan(ordemDaSituacao('a'));
    expect(ordemDaSituacao('sumiu')).toBe(2);
  });

  it('situação desligada só aparece enquanto houver atividade nela', () => {
    definirSituacoes([
      { chave: 'ativa', rotulo: 'Ativa', cor: '#000', usar: true, significado: 'aberta' },
      { chave: 'guardada', rotulo: 'Guardada', cor: '#000', usar: false, significado: 'aberta' },
    ]);
    expect(situacoesVisiveis().map((s) => s.chave)).toEqual(['ativa']);
    expect(situacoesVisiveis(['guardada']).map((s) => s.chave)).toEqual(['ativa', 'guardada']);
    // Situacao que nem esta na configuracao, mas existe no dado, tambem entra.
    expect(situacoesVisiveis(['antiga']).map((s) => s.chave)).toEqual(['ativa', 'antiga']);
  });
});

describe('chaveNova', () => {
  it('tira acento e espaço e nunca repete', () => {
    expect(chaveNova('Aguardando Bseller', [])).toBe('aguardando_bseller');
    expect(chaveNova('Em homologação', [])).toBe('em_homologacao');
    expect(chaveNova('Fazendo', ['fazendo'])).toBe('fazendo_2');
    expect(chaveNova('Fazendo', ['fazendo', 'fazendo_2'])).toBe('fazendo_3');
    expect(chaveNova('???', [])).toBe('situacao');
  });
});
