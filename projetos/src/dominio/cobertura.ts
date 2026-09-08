import { temDocumentacao } from './filtros';
import type { MapaDeConteudo } from '@/estado/conteudo';
import type { Projeto } from './tipos';

/* Onde a esteira esta, em numero: quantas melhorias ja tem documento
   escrito e quantas ja viraram chamado no BSeller.

   A situacao de cada atividade responde "o que estou fazendo"; isto
   responde "quanto do caminho ja andou" — que e a pergunta de quem
   precisa dizer ao gestor o que ja foi documentado e o que ja foi
   pedido. Fica fora do componente para ser testado sem montar tela. */

export const temChamado = (p: Projeto): boolean =>
  !!(p.chamado?.trim() || p.chamado_url?.trim());

export interface Cobertura {
  total: number;
  documentadas: number;
  comChamado: number;
  /* Documentada e ainda sem chamado: e a fila de trabalho, o que da
     para pedir hoje. */
  aAbrir: number;
  semDocumento: number;
}

export function cobertura(atividades: Projeto[], conteudo: MapaDeConteudo): Cobertura {
  let documentadas = 0;
  let comChamado = 0;
  let aAbrir = 0;

  for (const p of atividades) {
    const documentada = temDocumentacao(conteudo[p.id]);
    const chamado = temChamado(p);
    if (documentada) documentadas += 1;
    if (chamado) comChamado += 1;
    if (documentada && !chamado) aAbrir += 1;
  }

  return {
    total: atividades.length,
    documentadas,
    comChamado,
    aAbrir,
    semDocumento: atividades.length - documentadas,
  };
}

/* Sem atividade nenhuma o percentual e zero, e nao "nada a dividir":
   a tela precisa de um numero para desenhar a barra. */
export const porcentagem = (parte: number, total: number): number =>
  total > 0 ? Math.round((parte * 100) / total) : 0;
