/* ============================================================
   Leitura da aba Multiplos -> Componente[] (secao 6 do brief).
   Cabecalho na linha 3. Recebe a matriz (array de arrays) da aba
   e devolve os componentes ja tipados. A protecao contra a coluna
   "Marca" duplicada mora em montarObjetos (regressao 8.1).
   ============================================================ */
import type { Componente } from '../domain/tipos';
import { montarObjetos, criarSeletor, paraNumero, paraTexto } from './utilData';

/* Cabecalho na linha 3 da planilha (indice 2, base zero). */
export const LINHA_CABECALHO_MULTIPLOS = 2;

export function lerMultiplos(aoa: unknown[][]): Componente[] {
  const { linhas } = montarObjetos(aoa, LINHA_CABECALHO_MULTIPLOS);
  const componentes: Componente[] = [];

  for (const linha of linhas) {
    const s = criarSeletor(linha);
    const itemVolMultiplo = paraTexto(s('Item Vol.Multiplo'));
    const itemComponente = paraTexto(s('Item Componente'));
    // Descarta linhas sem identificacao (sobras de formatacao).
    if (!itemVolMultiplo && !itemComponente) continue;

    componentes.push({
      itemVolMultiplo,
      nomeItemVolMultiplo: paraTexto(s('Nome Item Vol.Multiplo')),
      itemComponente,
      nomeItemComponente: paraTexto(s('Nome Item Componente')),
      quantidade: paraNumero(s('Quantidade')),
      inInterface: paraTexto(s('in interface')).toUpperCase(),
      peso: paraNumero(s('Peso')),
      linhaProduto: paraTexto(s('Linha do Produto')),
      marca: paraTexto(s('Marca')),
      componenteBaseColuna: paraTexto(s('Componente BASE/COLUNA', 'Componente BASE COLUNA')),
      filtrar: paraTexto(s('Filtrar ?', 'Filtrar')),
      cd: paraNumero(s('CD')),
      reversa: paraNumero(s('REVERSA')),
      ds: paraNumero(s('DS')),
      outros: paraNumero(s('OUTROS')),
      chave: paraTexto(s('Chave')),
      toneladaFixa: paraTexto(s('Tonelada FIXA')),
      fabricante: paraTexto(s('Fabricante')),
    });
  }

  return componentes;
}
