import type { Projeto } from './tipos';

/* Um projeto pode agrupar outros. Estas funcoes separam o que e grupo
   do que e trabalho de verdade - a distincao importa nos indicadores:
   contar o pai junto com os filhos dobraria o mesmo trabalho no painel. */

/* Todo projeto de topo e uma pasta de atividades: abrir o projeto mostra
   a lista do que ha para fazer, e o trabalho de verdade (marcos,
   tarefas, paginas, anexos, documento) vive dentro de cada atividade.
   Nao ha configuracao para isso - e a estrutura do modulo. */
export const ehRaiz = (projeto: Projeto) => !projeto.projeto_pai_id;

/* O nome das atividades muda conforme o projeto: "Melhorias" no
   Bseller, "Frentes" ou "Etapas" em outro. */
export const rotuloDosFilhos = (projeto: Projeto) =>
  projeto.rotulo_filhos?.trim() || 'Atividades';

/* Singular do rotulo, para o botao de criar ("+ Nova melhoria").
   Portugues nao tem regra unica, entao os casos que importam ficam na
   tabela e o resto cai na queda do "s" final. */
const SINGULARES: Record<string, string> = {
  atividades: 'atividade',
  itens: 'item',
  melhorias: 'melhoria',
  frentes: 'frente',
  etapas: 'etapa',
  entregas: 'entrega',
  demandas: 'demanda',
  acoes: 'ação',
  ações: 'ação',
  projetos: 'projeto',
  modulos: 'módulo',
  módulos: 'módulo',
};

/* Genero do rotulo, para o botao sair "+ Nova melhoria" e nao
   "+ Novo melhoria". Palavra terminada em A ou em AO fechado e
   feminina na pratica dos nomes usados aqui; o resto e masculino, e os
   casos que fogem da regra ficam listados. */
const FEMININOS = new Set(['frente', 'ação', 'fase', 'ordem']);
/* Terminacoes que sao femininas em portugues mesmo sem o A final. */
const TERMINACOES_FEMININAS = ['dade', 'ção', 'são', 'gem', 'ez'];
const MASCULINOS = new Set(['item', 'dia', 'mapa']);

export function generoDoRotulo(projeto: Projeto): 'f' | 'm' {
  const singular = singularDoRotulo(projeto).toLowerCase();
  if (FEMININOS.has(singular)) return 'f';
  if (MASCULINOS.has(singular)) return 'm';
  if (TERMINACOES_FEMININAS.some((t) => singular.endsWith(t))) return 'f';
  return singular.endsWith('a') ? 'f' : 'm';
}

export function singularDoRotulo(projeto: Projeto): string {
  const plural = rotuloDosFilhos(projeto);
  const conhecido = SINGULARES[plural.toLowerCase()];
  if (conhecido) return conhecido;
  if (plural.toLowerCase().endsWith('ões')) return `${plural.slice(0, -3)}ão`;
  return plural.endsWith('s') ? plural.slice(0, -1) : plural;
}

export const raizes = (lista: Projeto[]) => lista.filter((p) => !p.projeto_pai_id);

export const filhosDe = (lista: Projeto[], paiId: string) =>
  lista.filter((p) => p.projeto_pai_id === paiId);

export const temFilhos = (lista: Projeto[], id: string) =>
  lista.some((p) => p.projeto_pai_id === id);

/* Folhas: projetos sem filhos. Sao eles que representam trabalho a
   fazer; o pai e apenas a pasta que os reune. */
export const folhas = (lista: Projeto[]) =>
  lista.filter((p) => !lista.some((f) => f.projeto_pai_id === p.id));

export function nomeCompleto(lista: Projeto[], projeto: Projeto): string {
  const pai = projeto.projeto_pai_id
    ? lista.find((p) => p.id === projeto.projeto_pai_id)
    : undefined;
  return pai ? `${pai.nome} · ${projeto.nome}` : projeto.nome;
}

export interface AvancoDoProjeto {
  concluidas: number;
  total: number;
  percentual: number;
}

/* Avanco do projeto: quantas atividades foram concluidas, nao a media
   dos percentuais digitados. Percentual escrito a mao envelhece e
   ninguem lembra de atualizar; atividade concluida e fato.
   Cancelada sai da conta: nao e trabalho pendente nem entregue. */
export function avancoPorConclusao(lista: Projeto[], paiId: string): AvancoDoProjeto | null {
  const filhos = filhosDe(lista, paiId).filter((f) => f.status !== 'cancelado');
  if (!filhos.length) return null;
  const concluidas = filhos.filter((f) => f.status === 'concluido').length;
  return {
    concluidas,
    total: filhos.length,
    percentual: Math.round((concluidas / filhos.length) * 100),
  };
}

/* Atividade sem filhos: concluida vale 100, o resto vale 0. Nao ha
   meio termo, porque nao ha mais campo para digitar meio termo. */
export const percentualDoStatus = (projeto: Projeto): number =>
  (projeto.status === 'concluido' ? 100 : 0);

/* O numero que vale na tela: projeto com atividades usa a conclusao
   delas; atividade sozinha usa a propria situacao. */
export function percentualEfetivo(lista: Projeto[], projeto: Projeto): number {
  return avancoPorConclusao(lista, projeto.id)?.percentual ?? percentualDoStatus(projeto);
}

/* Ordem de urgencia para ordenar a lista de atividades. */
const PESO_DA_PRIORIDADE: Record<string, number> = {
  critica: 0, alta: 1, media: 2, baixa: 3,
};

export function porPrioridade(a: Projeto, b: Projeto): number {
  const peso = PESO_DA_PRIORIDADE[a.prioridade] - PESO_DA_PRIORIDADE[b.prioridade];
  if (peso !== 0) return peso;
  /* Empate na prioridade: quem vence antes aparece antes, e quem nao
     tem prazo vai para o fim. */
  return (a.fim_previsto ?? '9999').localeCompare(b.fim_previsto ?? '9999');
}
