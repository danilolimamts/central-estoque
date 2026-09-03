import type { Projeto } from './tipos';

/* Um projeto pode agrupar outros. Estas funcoes separam o que e grupo
   do que e trabalho de verdade - a distincao importa nos indicadores:
   contar o pai junto com os filhos dobraria o mesmo trabalho no painel. */

/* Guarda-chuva: agrupa itens em vez de guardar trabalho proprio. Ter
   filhos ja basta, mesmo sem o rotulo preenchido - projeto criado antes
   deste campo continua funcionando. */
export const ehGrupo = (lista: Projeto[], projeto: Projeto) =>
  !!projeto.rotulo_filhos?.trim() || temFilhos(lista, projeto.id);

export const rotuloDosFilhos = (projeto: Projeto) =>
  projeto.rotulo_filhos?.trim() || 'Itens';

/* Singular do rotulo, para o botao de criar ("+ Nova melhoria").
   Portugues nao tem regra unica, entao os casos que importam ficam na
   tabela e o resto cai na queda do "s" final. */
const SINGULARES: Record<string, string> = {
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
const MASCULINOS = new Set(['item', 'dia', 'mapa']);

export function generoDoRotulo(projeto: Projeto): 'f' | 'm' {
  const singular = singularDoRotulo(projeto).toLowerCase();
  if (FEMININOS.has(singular)) return 'f';
  if (MASCULINOS.has(singular)) return 'm';
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

/* Avanco do grupo: media do avanco dos filhos, ignorando cancelados.
   O percentual digitado no pai nao acompanha a realidade quando sao
   dezenas de melhorias. */
export function avancoDoGrupo(lista: Projeto[], paiId: string): number | null {
  const filhos = filhosDe(lista, paiId).filter((f) => f.status !== 'cancelado');
  if (!filhos.length) return null;
  return Math.round(filhos.reduce((soma, f) => soma + f.percentual, 0) / filhos.length);
}
