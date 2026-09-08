import { temDocumentacao } from './filtros';
import { ehConcluida, passouDoChamado } from './situacoes';
import type { MapaDeConteudo } from '@/estado/conteudo';
import type { Projeto } from './tipos';

/* Onde a esteira esta, em numero: quanto ja foi escrito, quanto ja foi
   pedido e quanto ja foi entregue.

   A situacao de cada atividade responde "o que estou fazendo"; isto
   responde "quanto do caminho ja andou", que e a pergunta de quem
   precisa dizer ao gestor como esta a fila. Fica fora do componente
   para ser testado sem montar tela. */

export const temChamado = (p: Projeto): boolean =>
  !!(p.chamado?.trim() || p.chamado_url?.trim());

export interface Cobertura {
  total: number;
  documentadas: number;
  /* Chamado aberto: numero (ou link) anotado, ou situacao a partir da
     abertura do chamado. Quem ja esta em desenvolvimento passou por ali,
     mesmo que ninguem tenha copiado o numero para a linha. */
  comChamado: number;
  /* Documentada e ainda sem chamado: e a fila de trabalho, o que da
     para pedir hoje. */
  aAbrir: number;
  concluidas: number;
  semDocumento: number;
}

export function cobertura(atividades: Projeto[], conteudo: MapaDeConteudo): Cobertura {
  let documentadas = 0;
  let comChamado = 0;
  let aAbrir = 0;
  let concluidas = 0;

  for (const p of atividades) {
    const documentada = temDocumentacao(conteudo[p.id]);
    const chamado = temChamado(p) || passouDoChamado(p.status);
    if (documentada) documentadas += 1;
    if (chamado) comChamado += 1;
    if (documentada && !chamado) aAbrir += 1;
    if (ehConcluida(p.status)) concluidas += 1;
  }

  return {
    total: atividades.length,
    documentadas,
    comChamado,
    aAbrir,
    concluidas,
    semDocumento: atividades.length - documentadas,
  };
}

/* Sem atividade nenhuma o percentual e zero, e nao "nada a dividir":
   a tela precisa de um numero para desenhar a barra. */
export const porcentagem = (parte: number, total: number): number =>
  total > 0 ? Math.round((parte * 100) / total) : 0;
