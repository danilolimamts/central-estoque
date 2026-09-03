import type { Projeto } from './tipos';

/* Um projeto pode agrupar outros. Estas funcoes separam o que e grupo
   do que e trabalho de verdade - a distincao importa nos indicadores:
   contar o pai junto com os filhos dobraria o mesmo trabalho no painel. */

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
