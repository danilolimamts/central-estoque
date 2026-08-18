/* ============================================================
   Leitura da aba Divergencias SAC (tabela f_divergenciasSAC).

   A coluna Produto vem como "codigo - descricao"; o codigo e separado
   para poder cruzar com o item pai da equalizacao.
   ============================================================ */
import type { DivergenciaSAC } from '../domain/divergencias';
import { origemDaFilial } from '../domain/divergencias';
import { montarObjetos, criarSeletor, paraTexto, paraNumero, converterData } from './utilData';

/* Campo de data em branco na planilha nao chega vazio: chega como a
   data zero do Excel, que aparece na tela como 00/01/1900. Em texto o
   conversor ja recusa (dia 0 nao existe), mas em serial ela vira
   30/12/1899 - uma data valida, que entraria no painel como se fosse
   informacao. Qualquer coisa anterior a este ano e campo em branco
   disfarcado. */
const PRIMEIRO_ANO_VALIDO = 2000;

export function dataDaPlanilha(v: unknown): Date | null {
  const d = converterData(v);
  return d != null && d.getUTCFullYear() >= PRIMEIRO_ANO_VALIDO ? d : null;
}

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

    /* A data que o painel usa e a da saida da mercadoria. Quando ela
       nao veio, o caso cai na emissao do pedido em vez de sumir do
       painel: devolucao sem data de saida continua sendo devolucao. A
       origem fica registrada para a tela poder avisar. */
    const dataSaida = dataDaPlanilha(s('Data Saída', 'Data Saida', 'Data_Saida'));
    const dataPedido = dataDaPlanilha(s('Data Emissão Pedido', 'Data Emissao Pedido'));

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
      data: dataSaida ?? dataPedido,
      dataPelaSaida: dataSaida != null,
    });
  }
  return saida;
}
