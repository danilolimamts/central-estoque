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
  /* Quanto a atividade ja andou quando esta nesta situacao. Nulo quer
     dizer "calcule pela posicao": a esteira dividida em partes iguais.
     Preenchido, manda — e como Pausado fica em zero mesmo estando no
     meio da fila. */
  avanco: number | null;
  /* Marca o passo em que o chamado passa a existir. A partir dele — e
     em tudo que vem depois na fila — a atividade conta como ja pedida
     ao BSeller, mesmo que o numero do chamado nao tenha sido digitado.
     Nenhuma situacao vem marcada de fabrica: e a equipe que sabe onde
     fica esse ponto no seu processo. */
  chamado?: boolean;
}

export const SITUACOES_PADRAO: Situacao[] = [
  { chave: 'nao_iniciado', rotulo: 'Não iniciado', cor: '#9E86D8', usar: true, significado: 'aberta', avanco: 0 },
  { chave: 'em_andamento', rotulo: 'Em andamento', cor: '#2F6FE0', usar: true, significado: 'aberta', avanco: null },
  { chave: 'em_risco', rotulo: 'Em risco', cor: '#C79212', usar: true, significado: 'aberta', avanco: null },
  /* Parado nao e progresso: quem pausou nao andou mais um passo. */
  { chave: 'pausado', rotulo: 'Pausado', cor: '#B0568F', usar: true, significado: 'aberta', avanco: 0 },
  { chave: 'concluido', rotulo: 'Concluído', cor: '#2E8B57', usar: true, significado: 'concluida', avanco: null },
  { chave: 'cancelado', rotulo: 'Cancelado', cor: '#D2453A', usar: true, significado: 'cancelada', avanco: null },
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
    ?? { chave, rotulo: chave, cor: '#6A6F94', usar: false, significado: 'aberta', avanco: null };
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

/* As situacoes que formam a esteira: as ligadas, menos a cancelada, que
   e saida do processo e nao um passo dele. */
const etapas = (): Situacao[] => registro.filter((s) => s.usar && s.significado !== 'cancelada');

/* Quanto uma atividade ja andou so por estar nesta situacao.

   A regra que a equipe pediu: a esteira dividida em partes iguais, a
   primeira situacao em zero e a concluida em cem. Com seis etapas, cada
   passo vale 20% — estar "em andamento" ja e um passo dado.

   Concluida vale 100 esteja onde estiver na ordem, e cancelada vale
   zero: significado manda mais do que posicao. E quem quiser fugir da
   divisao igual preenche o avanco da situacao na configuracao (e o que
   deixa Pausado em zero no meio da fila). */
export function percentualDaSituacao(chave: string): number {
  const situacao = situacaoDe(chave);
  if (situacao.avanco !== null && situacao.avanco !== undefined) {
    return Math.min(100, Math.max(0, Math.round(situacao.avanco)));
  }
  if (situacao.significado === 'concluida') return 100;
  if (situacao.significado === 'cancelada') return 0;

  const fila = etapas();
  const i = fila.findIndex((s) => s.chave === chave);
  /* Situacao apagada da configuracao, ou esteira de um passo so: nao ha
     de onde tirar fracao. */
  if (i < 0 || fila.length < 2) return 0;
  return Math.round((i * 100) / (fila.length - 1));
}

/* A atividade nesta situacao ja foi pedida ao BSeller? Vale a situacao
   marcada e todas as seguintes: quem esta em desenvolvimento passou
   pela abertura do chamado, mesmo que ninguem tenha anotado o numero. */
export function passouDoChamado(chave: string): boolean {
  const fila = etapas();
  const marco = fila.findIndex((s) => s.chamado);
  if (marco < 0) return false;
  const i = fila.findIndex((s) => s.chave === chave);
  return i >= 0 && i >= marco;
}

/* Mover uma situacao na ordem, pulando as desligadas: quem clica na
   seta da coluna espera ve-la andar uma casa no quadro, e uma situacao
   escondida no meio faria o clique parecer sem efeito. */
export function moverSituacao(lista: Situacao[], chave: string, direcao: -1 | 1): Situacao[] {
  const de = lista.findIndex((s) => s.chave === chave);
  if (de < 0) return lista;

  let para = de + direcao;
  while (para >= 0 && para < lista.length && !lista[para].usar) para += direcao;
  if (para < 0 || para >= lista.length) return lista;

  const copia = [...lista];
  const [movida] = copia.splice(de, 1);
  copia.splice(para, 0, movida);
  return copia;
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
