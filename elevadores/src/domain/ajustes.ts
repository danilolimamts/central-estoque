/* ============================================================
   Reclassificacao manual das divergencias do SAC.

   O responsavel de cada caso e deduzido do texto do Comentario. O
   texto nem sempre conta a historia toda: ha caso em que quem apurou
   sabe de quem foi, e o comentario nao diz. Sem uma saida para isso o
   painel obriga a conviver com um numero que quem le sabe estar
   errado - e indicador em que a pessoa nao confia deixa de ser usado.

   Aqui fica o ajuste feito a mao: uma entrega, o responsavel que
   passa a valer e o motivo. Ele vence a leitura do texto, e nunca em
   silencio - a tela marca a linha e conta quantos ajustes existem.

   O ajuste vale por entrega (ou pelo pedido, quando nao houve
   entrega), que e como a operacao se refere ao caso. Uma entrega com
   dois produtos divergentes recebe o mesmo ajuste nos dois: eles
   saem da mesma expedicao.
   ============================================================ */
import type { DivergenciaSAC, Responsavel } from './divergencias';
import { responsavelDe } from './divergencias';

export interface AjusteResponsavel {
  /* Entrega, ou pedido quando a devolucao nao virou entrega. */
  caso: string;
  responsavel: Responsavel;
  /* Por que foi mudado. Fica na tela e no Excel: ajuste sem
     justificativa e indistinguivel de erro de digitacao. */
  motivo: string;
  em: string; // ISO
}

/* Como o caso e identificado. E o mesmo texto que a coluna Entrega da
   tabela mostra, para quem le a tela conseguir achar o que ajustou. */
export function identificarCaso(d: Pick<DivergenciaSAC, 'entrega' | 'pedido'>): string {
  return String(d.entrega ?? '').trim() || String(d.pedido ?? '').trim();
}

export type MapaAjustes = Map<string, AjusteResponsavel>;

export function mapaDeAjustes(lista: AjusteResponsavel[]): MapaAjustes {
  return new Map(lista.map((a) => [a.caso, a]));
}

/* O responsavel que vale: o ajustado a mao, quando existir; senao o
   que saiu do texto. */
export function responsavelFinal(d: DivergenciaSAC, ajustes: MapaAjustes): Responsavel {
  return ajustes.get(identificarCaso(d))?.responsavel ?? responsavelDe(d);
}

export function ajusteDe(d: DivergenciaSAC, ajustes: MapaAjustes): AjusteResponsavel | undefined {
  return ajustes.get(identificarCaso(d));
}

/* Grava o ajuste. Reajustar o mesmo caso substitui o anterior: vale
   sempre a ultima decisao de quem apurou. */
export function registrarAjuste(
  lista: AjusteResponsavel[],
  novo: AjusteResponsavel
): AjusteResponsavel[] {
  return [...lista.filter((a) => a.caso !== novo.caso), novo];
}

/* Desfaz o ajuste: o caso volta a ser classificado pelo texto. */
export function removerAjuste(lista: AjusteResponsavel[], caso: string): AjusteResponsavel[] {
  return lista.filter((a) => a.caso !== caso);
}

/* Quantos ajustes valem para a lista em tela. Ajuste de caso que nao
   esta no recorte atual nao conta: o numero tem que bater com o que a
   pessoa esta vendo. */
export function ajustesAplicados(lista: DivergenciaSAC[], ajustes: MapaAjustes): number {
  return lista.filter((d) => ajustes.has(identificarCaso(d))).length;
}
