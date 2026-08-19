/* ============================================================
   Ajustes manuais das divergencias do SAC.

   O responsavel de cada caso e deduzido do texto do Comentario. O
   texto nem sempre conta a historia toda: ha caso em que quem apurou
   sabe o que aconteceu e o comentario nao diz. Sem uma saida para
   isso o painel obriga a conviver com um numero que quem le sabe
   estar errado - e indicador em que a pessoa nao confia deixa de ser
   usado.

   Duas decisoes cabem aqui, e elas sao diferentes:

   - trocar o responsavel: o caso continua no painel, contado, mas na
     gaveta de quem de fato respondeu por ele;
   - desconsiderar: o caso sai do painel inteiro. Serve para o que nao
     foi culpa do CD nem diretamente nem indiretamente, e que so
     polui a leitura da operacao.

   As duas ficam registradas com motivo, e a tela nunca as aplica em
   silencio: numero corrigido sem rastro e indistinguivel de numero
   errado.

   O ajuste vale por entrega (ou pelo pedido, quando nao houve
   entrega), que e como a operacao se refere ao caso. Uma entrega com
   dois produtos divergentes recebe o mesmo ajuste nos dois: eles
   saem da mesma expedicao.
   ============================================================ */
import type { DivergenciaSAC, Responsavel } from './divergencias';
import { responsavelDe } from './divergencias';

/* FORA tira o caso do painel; o resto so troca a gaveta. */
export const FORA = 'FORA';
export type Decisao = Responsavel | typeof FORA;

export interface AjusteCaso {
  /* Entrega, ou pedido quando a devolucao nao virou entrega. */
  caso: string;
  decisao: Decisao;
  /* Por que foi mexido. Fica na tela junto do caso: ajuste sem
     justificativa nao se distingue de erro de digitacao daqui a um
     mes. */
  motivo: string;
  em: string; // ISO
}

/* Como o caso e identificado. E o mesmo texto que a coluna Entrega da
   tabela mostra, para quem le a tela conseguir achar o que ajustou. */
export function identificarCaso(d: Pick<DivergenciaSAC, 'entrega' | 'pedido'>): string {
  return String(d.entrega ?? '').trim() || String(d.pedido ?? '').trim();
}

export type MapaAjustes = Map<string, AjusteCaso>;

export function mapaDeAjustes(lista: AjusteCaso[]): MapaAjustes {
  return new Map(lista.map((a) => [a.caso, a]));
}

export function ajusteDe(d: DivergenciaSAC, ajustes: MapaAjustes): AjusteCaso | undefined {
  return ajustes.get(identificarCaso(d));
}

export function foiDesconsiderado(d: DivergenciaSAC, ajustes: MapaAjustes): boolean {
  return ajusteDe(d, ajustes)?.decisao === FORA;
}

/* O responsavel que vale: o ajustado a mao, quando existir; senao o
   que saiu do texto. Caso desconsiderado nao deveria chegar aqui -
   ele e filtrado antes -, mas se chegar continua valendo o texto, e
   nao um responsavel inventado. */
export function responsavelFinal(d: DivergenciaSAC, ajustes: MapaAjustes): Responsavel {
  const decisao = ajusteDe(d, ajustes)?.decisao;
  return decisao != null && decisao !== FORA ? decisao : responsavelDe(d);
}

/* Os casos que o painel conta. Tudo que a tela mostra - totais,
   grafico por mes, transportadoras, causas e responsaveis - sai
   daqui, para nao existir numero que ignore a decisao tomada. */
export function casosConsiderados(
  lista: DivergenciaSAC[],
  ajustes: MapaAjustes
): DivergenciaSAC[] {
  return lista.filter((d) => !foiDesconsiderado(d, ajustes));
}

/* Os que foram tirados. A tela lista para que a decisao possa ser
   conferida e desfeita: caso escondido sem rastro vira numero que
   ninguem consegue explicar depois. */
export function casosDesconsiderados(
  lista: DivergenciaSAC[],
  ajustes: MapaAjustes
): DivergenciaSAC[] {
  return lista.filter((d) => foiDesconsiderado(d, ajustes));
}

/* Grava o ajuste. Reajustar o mesmo caso substitui o anterior: vale
   sempre a ultima decisao de quem apurou. */
export function registrarAjuste(lista: AjusteCaso[], novo: AjusteCaso): AjusteCaso[] {
  return [...lista.filter((a) => a.caso !== novo.caso), novo];
}

/* Desfaz: o caso volta a ser classificado pelo texto e a contar. */
export function removerAjuste(lista: AjusteCaso[], caso: string): AjusteCaso[] {
  return lista.filter((a) => a.caso !== caso);
}

/* Quantos casos do recorte em tela tiveram o responsavel trocado a
   mao. Desconsiderados nao entram: eles tem contagem propria, e somar
   os dois esconderia a diferenca entre "mudou de dono" e "saiu". */
export function reclassificadosEmTela(
  lista: DivergenciaSAC[],
  ajustes: MapaAjustes
): number {
  return lista.filter((d) => {
    const a = ajusteDe(d, ajustes);
    return a != null && a.decisao !== FORA;
  }).length;
}

/* Formato anterior, quando o ajuste so sabia trocar o responsavel.
   Importacao ja gravada volta com o campo antigo; converter na
   leitura evita perder decisao que a pessoa ja tomou. */
interface AjusteAntigo {
  caso: string;
  responsavel?: Responsavel;
  decisao?: Decisao;
  motivo?: string;
  em?: string;
}

export function migrarAjustes(lista: unknown): AjusteCaso[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((bruto) => {
    const a = bruto as AjusteAntigo;
    const caso = String(a?.caso ?? '').trim();
    const decisao = a?.decisao ?? a?.responsavel;
    if (!caso || !decisao) return [];
    return [{ caso, decisao, motivo: String(a.motivo ?? ''), em: String(a.em ?? '') }];
  });
}
