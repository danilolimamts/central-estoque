/* ============================================================
   Orquestrador de leitura da planilha (secao 6 do brief).
   Le APENAS as abas Multiplos e Projeto no XLSX.read (as abas
   EstoqueAtual e Cadastros tem centenas de milhares de linhas e
   travam a leitura - regressao 8.6), sempre com cellDates: true.
   ============================================================ */
import * as XLSX from 'xlsx';
import type { Componente, Acao } from '../domain/tipos';
import { lerMultiplos } from './lerMultiplos';
import { lerProjeto } from './lerProjeto';
import { normalizarCabecalho, paraTexto } from './utilData';
import { montarObjetos, criarSeletor } from './utilData';

export const ABAS_UTEIS = ['Multiplos', 'Projeto'] as const;

export interface DadosPlanilha {
  componentes: Componente[];
  acoes: Acao[];
}

function acharAba(wb: XLSX.WorkBook, nome: string): XLSX.WorkSheet | null {
  const alvo = normalizarCabecalho(nome);
  const encontrado = wb.SheetNames.find((n) => normalizarCabecalho(n) === alvo);
  return encontrado ? wb.Sheets[encontrado] : null;
}

function abaParaMatriz(ws: XLSX.WorkSheet | null): unknown[][] {
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  }) as unknown[][];
}

export function lerWorkbook(wb: XLSX.WorkBook): DadosPlanilha {
  const componentes = lerMultiplos(abaParaMatriz(acharAba(wb, 'Multiplos')));
  const acoes = lerProjeto(abaParaMatriz(acharAba(wb, 'Projeto')));
  return { componentes, acoes };
}

export function lerArquivo(data: ArrayBuffer | Uint8Array): DadosPlanilha {
  const wb = XLSX.read(data, {
    type: 'array',
    cellDates: true,
    // So as abas uteis, para nao travar em EstoqueAtual/Cadastros.
    sheets: ABAS_UTEIS as unknown as string[],
  });
  return lerWorkbook(wb);
}

/* ---------------------------------------------------------------
   Base auxiliar de fotos: DE_PARA_LINK_FOTO.xlsx, aba Export.
   Coluna E = Id Item (string), coluna AP = URL Foto. Cruzar com
   Item Vol.Multiplo. Id Item precisa ser comparado como string
   (regressao 8.4).
   --------------------------------------------------------------- */
export type MapaFotos = Map<string, string>;

export function lerFotos(wb: XLSX.WorkBook): MapaFotos {
  const ws = acharAba(wb, 'Export');
  const aoa = abaParaMatriz(ws);
  const mapa: MapaFotos = new Map();
  if (aoa.length === 0) return mapa;

  const { linhas } = montarObjetos(aoa, 0);
  for (const linha of linhas) {
    const s = criarSeletor(linha);
    const idItem = paraTexto(s('Id Item')); // sempre comparado como string
    const url = paraTexto(s('URL Foto'));
    if (idItem && url) mapa.set(String(idItem), url);
  }
  return mapa;
}

export function lerArquivoFotos(data: ArrayBuffer | Uint8Array): MapaFotos {
  const wb = XLSX.read(data, { type: 'array', cellDates: true, sheets: ['Export'] });
  return lerFotos(wb);
}
