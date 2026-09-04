/* As situações deixaram de ser uma lista fixa: a equipe cria as suas.
   O que o resto do módulo precisa saber de cada uma é o significado —
   se ela conta como trabalho aberto, entregue ou descartado. Nome e cor
   são aparência; significado é regra (entra no avanço, encerra a
   atividade, sai da conta).

   O registro é módulo, não contexto de React, porque quem pergunta
   "isso está encerrado?" são funções puras (regras de prazo, avanço,
   planilha) que não vivem dentro de componente. A tela define o
   registro assim que a configuração da equipe chega. */

export type Significado = 'aberta' | 'concluida' | 'cancelada';

export interface Situacao {
  chave: string;
  rotulo: string;
  cor: string;
  usar: boolean;
  significado: Significado;
}

export const SITUACOES_PADRAO: Situacao[] = [
  { chave: 'nao_iniciado', rotulo: 'Não iniciado', cor: '#9E86D8', usar: true, significado: 'aberta' },
  { chave: 'em_andamento', rotulo: 'Em andamento', cor: '#2F6FE0', usar: true, significado: 'aberta' },
  { chave: 'em_risco', rotulo: 'Em risco', cor: '#C79212', usar: true, significado: 'aberta' },
  { chave: 'pausado', rotulo: 'Pausado', cor: '#B0568F', usar: true, significado: 'aberta' },
  { chave: 'concluido', rotulo: 'Concluído', cor: '#2E8B57', usar: true, significado: 'concluida' },
  { chave: 'cancelado', rotulo: 'Cancelado', cor: '#D2453A', usar: true, significado: 'cancelada' },
];

let registro: Situacao[] = SITUACOES_PADRAO;

export function definirSituacoes(lista: Situacao[]): void {
  registro = lista.length ? lista : SITUACOES_PADRAO;
}

export const situacoes = (): Situacao[] => registro;

/* Situação gravada que não está mais na configuração (renomeada,
   apagada, ou de antes da mudança) não pode sumir da tela: aparece com
   a própria chave e conta como trabalho aberto. */
export function situacaoDe(chave: string): Situacao {
  return registro.find((s) => s.chave === chave)
    ?? { chave, rotulo: chave, cor: '#6A6F94', usar: false, significado: 'aberta' };
}

export const rotuloDaSituacao = (chave: string) => situacaoDe(chave).rotulo;
export const corDaSituacao = (chave: string) => situacaoDe(chave).cor;
export const significadoDe = (chave: string) => situacaoDe(chave).significado;

export const ehConcluida = (chave: string) => significadoDe(chave) === 'concluida';
export const ehCancelada = (chave: string) => significadoDe(chave) === 'cancelada';
export const ehEncerrada = (chave: string) => significadoDe(chave) !== 'aberta';

/* Ordem para listas e colunas: a da configuração, que é a do processo
   da equipe. Situação fora dela vai para o fim. */
export function ordemDaSituacao(chave: string): number {
  const i = registro.findIndex((s) => s.chave === chave);
  return i < 0 ? registro.length : i;
}

/* O que a tela oferece: as ligadas, mais as que já estão em uso — quem
   tem atividade numa situação desligada precisa continuar vendo o
   cartão. */
export function situacoesVisiveis(usadas: string[] = []): Situacao[] {
  const extras = usadas
    .filter((c) => !registro.some((s) => s.chave === c))
    .map(situacaoDe);
  return [...registro.filter((s) => s.usar || usadas.includes(s.chave)), ...extras];
}

/* Chave a partir do nome digitado: sem acento, sem espaço e única.
   A chave é o que vai para o banco e nunca muda depois — renomear a
   situação não pode reescrever as atividades. */
export function chaveNova(rotulo: string, existentes: string[]): string {
  const base = rotulo
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'situacao';
  if (!existentes.includes(base)) return base;
  let n = 2;
  while (existentes.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}
