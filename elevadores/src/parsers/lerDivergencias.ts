/* ============================================================
   Leitura da aba Divergencias SAC (tabela f_divergenciasSAC).

   A coluna Produto vem como "codigo - descricao"; o codigo e separado
   para poder cruzar com o item pai da equalizacao.
   ============================================================ */
import type { DivergenciaSAC } from '../domain/divergencias';
import { origemDaFilial } from '../domain/divergencias';
import { montarObjetos, criarSeletor, paraTexto, paraNumero, converterData } from './utilData';

/* "929051 - RAMPA PARA ALINHAMENTO..." vira codigo e descricao. */
export function separarProduto(bruto: string): { item: string; descricao: string } {
  const texto = String(bruto ?? '').trim();
  const corte = texto.match(/^\s*(\d+)\s*-\s*(.*)$/);
  if (corte) return { item: corte[1], descricao: corte[2].trim() };
  return { item: '', descricao: texto };
}

export function lerDivergencias(aoa: unknown[][]): DivergenciaSAC[] {
  if (aoa.length === 0) return [];
  const { linhas } = montarObjetos(aoa, 0);

  const saida: DivergenciaSAC[] = [];
  for (const linha of linhas) {
    const s = criarSeletor(linha);
    const produtoBruto = paraTexto(s('Produto'));
    const pedido = paraTexto(s('Pedido'));
    /* Linha sem pedido e sem produto e sobra de formatacao da tabela. */
    if (!pedido && !produtoBruto) continue;

    const { item, descricao } = separarProduto(produtoBruto);
    const filial = paraTexto(s('Filial Envio', 'Filial'));
    /* O valor da devolucao vem negativo na planilha; o painel soma
       quanto a divergencia custou, entao guarda o modulo. */
    const valor = Math.abs(paraNumero(s('Valor Devolução', 'Valor Devolucao')));

    saida.push({
      pedido,
      entrega: paraTexto(s('Id Entrega', 'Id_Entrega', 'Entrega')),
      filial,
      origem: origemDaFilial(filial),
      itemProduto: item,
      produto: descricao,
      motivo: paraTexto(s('Motivo')),
      submotivo: paraTexto(s('Submotivo')),
      comentario: paraTexto(s('Comentário', 'Comentario')),
      transportadora: paraTexto(s('Transportadora')),
      estado: paraTexto(s('Estado')),
      canal: paraTexto(s('Canal_Agrupado', 'Canal Agrupado', 'Canal')),
      valor,
      data: converterData(s('Data Emissão Pedido', 'Data Emissao Pedido')),
    });
  }
  return saida;
}
