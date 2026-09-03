import { describe, expect, it } from 'vitest';
import {
  avancoDoGrupo, ehRaiz, filhosDe, folhas, generoDoRotulo, nomeCompleto, raizes,
  rotuloDosFilhos, singularDoRotulo, temFilhos,
} from '../src/dominio/arvore';
import type { Projeto } from '../src/dominio/tipos';

const base = {
  rotulo_filhos: null,
  codigo: null, descricao: null, area: null, responsavel_id: null,
  prioridade: 'media', inicio_previsto: null, fim_previsto: null,
  inicio_real: null, fim_real: null, criado_por: null, criado_em: '', atualizado_em: '',
} as const;

const carteira: Projeto[] = [
  { ...base, id: 'pai', projeto_pai_id: null, nome: 'Melhorias Bseller', status: 'em_andamento', percentual: 0 },
  { ...base, id: 'f1', projeto_pai_id: 'pai', nome: 'Entrada massiva', status: 'em_andamento', percentual: 40 },
  { ...base, id: 'f2', projeto_pai_id: 'pai', nome: 'Trava de paletes', status: 'concluido', percentual: 100 },
  { ...base, id: 'f3', projeto_pai_id: 'pai', nome: 'Ideia descartada', status: 'cancelado', percentual: 0 },
  { ...base, id: 'solto', projeto_pai_id: null, nome: 'Reendereçamento', status: 'em_andamento', percentual: 20 },
];

describe('árvore de projetos', () => {
  it('separa os projetos de topo', () => {
    expect(raizes(carteira).map((p) => p.id)).toEqual(['pai', 'solto']);
  });

  it('lista os filhos de um grupo', () => {
    expect(filhosDe(carteira, 'pai').map((p) => p.id)).toEqual(['f1', 'f2', 'f3']);
    expect(temFilhos(carteira, 'pai')).toBe(true);
    expect(temFilhos(carteira, 'solto')).toBe(false);
  });

  it('as folhas excluem o grupo, para não contar o mesmo trabalho duas vezes', () => {
    expect(folhas(carteira).map((p) => p.id)).toEqual(['f1', 'f2', 'f3', 'solto']);
  });

  it('mostra o nome com o grupo na frente', () => {
    expect(nomeCompleto(carteira, carteira[1])).toBe('Melhorias Bseller · Entrada massiva');
    expect(nomeCompleto(carteira, carteira[4])).toBe('Reendereçamento');
  });

  it('calcula o avanço do grupo ignorando cancelados', () => {
    // (40 + 100) / 2, sem o cancelado.
    expect(avancoDoGrupo(carteira, 'pai')).toBe(70);
  });

  it('não calcula avanço de quem não tem filhos', () => {
    expect(avancoDoGrupo(carteira, 'solto')).toBeNull();
  });
});

describe('rótulo dos itens do grupo', () => {
  const grupo = { ...carteira[0], rotulo_filhos: 'Melhorias' };

  it('usa o nome escolhido no projeto', () => {
    expect(rotuloDosFilhos(grupo)).toBe('Melhorias');
    expect(singularDoRotulo(grupo)).toBe('melhoria');
  });

  it('cai em "Atividades" quando ninguém escolheu', () => {
    expect(rotuloDosFilhos(carteira[0])).toBe('Atividades');
    expect(singularDoRotulo(carteira[0])).toBe('atividade');
  });

  it('tira o s de nomes que não estão na tabela', () => {
    expect(singularDoRotulo({ ...grupo, rotulo_filhos: 'Ondas' })).toBe('Onda');
  });

  it('acerta o gênero, para o botão não sair "Novo melhoria"', () => {
    expect(generoDoRotulo(grupo)).toBe('f');
    expect(generoDoRotulo(carteira[0])).toBe('f');
    expect(generoDoRotulo({ ...grupo, rotulo_filhos: 'Frentes' })).toBe('f');
    expect(generoDoRotulo({ ...grupo, rotulo_filhos: 'Módulos' })).toBe('m');
    // "atividade" não termina em A, mas é feminina: a terminação DADE decide.
    expect(generoDoRotulo({ ...grupo, rotulo_filhos: 'Atividades' })).toBe('f');
  });

  it('projeto de topo é pasta de atividades; o filho é o trabalho', () => {
    expect(ehRaiz(carteira[0])).toBe(true);
    expect(ehRaiz(carteira[1])).toBe(false);
  });
});
