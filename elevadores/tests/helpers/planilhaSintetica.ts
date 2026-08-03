/* ============================================================
   Fixture sintetica: gera um .xlsx em memoria que reproduz os
   cenarios de regressao da secao 8, para os testes rodarem sem
   depender da planilha real. A planilha real (secao 9) entra pela
   fixture tests/fixtures e e validada em *.real.test.ts.
   ============================================================ */
import * as XLSX from 'xlsx-js-style';

/* Cabecalho da aba Multiplos (colunas A a R), seguido de duas colunas
   vazias e de uma tabela dinamica com uma SEGUNDA coluna "Marca" (col U).
   O parser deve ignorar tudo depois do intervalo de duas colunas vazias
   e manter a primeira "Marca" (regressao 8.1). */
const CAB_MULTIPLOS = [
  'Item Vol.Multiplo',
  'Nome Item Vol.Multiplo',
  'Item Componente',
  'Nome Item Componente',
  'Quantidade',
  'in interface',
  'Peso',
  'Linha do Produto',
  'Marca',
  'Componente BASE/COLUNA',
  'Filtrar ?',
  'CD',
  'REVERSA',
  'DS',
  'OUTROS',
  'Chave',
  'Tonelada FIXA',
  'Fabricante',
  null,
  null,
  'Marca', // coluna U: cabecalho da tabela dinamica, deve ser ignorada
  'Contagem',
];

interface LinhaMult {
  pai: string;
  nomePai: string;
  comp: string;
  nomeComp: string;
  qtd: number;
  inInterface: string;
  peso: number;
  linha: string;
  marca: string;
  tipo: string;
  filtrar: string;
  cd: number;
  reversa: number;
  ds: number;
  outros: number;
  chave: string;
  ton: string;
  fabricante: string;
  marcaPivot: string; // valor ERRADO na coluna U, nunca deve aparecer
}

function linhaParaArray(l: LinhaMult): unknown[] {
  return [
    l.pai, l.nomePai, l.comp, l.nomeComp, l.qtd, l.inInterface, l.peso, l.linha,
    l.marca, l.tipo, l.filtrar, l.cd, l.reversa, l.ds, l.outros, l.chave, l.ton,
    l.fabricante, null, null, l.marcaPivot, 1,
  ];
}

export const LINHAS_MULTIPLOS: LinhaMult[] = [
  { pai: 'P1', nomePai: 'Elevador FORTG 4t', comp: 'B1', nomeComp: 'Base FORTG', qtd: 1, inInterface: 'N', peso: 4000, linha: 'ELEVADOR', marca: 'FORTG', tipo: 'BASE', filtrar: 'SIM', cd: 5, reversa: 0, ds: 0, outros: 0, chave: 'FORTG JM 4 t', ton: '4 t', fabricante: 'JM MAQUINAS', marcaPivot: 'ERRADO' },
  { pai: 'P1', nomePai: 'Elevador FORTG 4t', comp: 'C1', nomeComp: 'Coluna FORTG', qtd: 2, inInterface: 'S', peso: 4000, linha: 'ELEVADOR', marca: 'FORTG', tipo: 'COLUNA', filtrar: 'SIM', cd: 8, reversa: 3, ds: 0, outros: 0, chave: 'FORTG JM 4 t', ton: '4 t', fabricante: 'JM MAQUINAS', marcaPivot: 'ERRADO' },
  { pai: 'P1', nomePai: 'Elevador FORTG 4t', comp: 'BB1', nomeComp: 'Bomba', qtd: 1, inInterface: '', peso: 10, linha: 'ELEVADOR', marca: 'FORTG', tipo: 'BOMBA', filtrar: 'SIM', cd: 99, reversa: 0, ds: 0, outros: 0, chave: 'FORTG JM 4 t', ton: '4 t', fabricante: 'JM MAQUINAS', marcaPivot: 'ERRADO' },
  { pai: 'P2', nomePai: 'Elevador KREBS 2t', comp: 'B2', nomeComp: 'Base KREBS', qtd: 1, inInterface: 'N', peso: 2000, linha: 'ELEVADOR', marca: 'KREBS', tipo: 'BASE', filtrar: 'SIM', cd: 3, reversa: 0, ds: 0, outros: 0, chave: 'KREBS 2 t', ton: '2 t', fabricante: 'KREBS', marcaPivot: 'ERRADO' },
  { pai: 'P2', nomePai: 'Elevador KREBS 2t', comp: 'C2', nomeComp: 'Coluna KREBS', qtd: 1, inInterface: 'S', peso: 2000, linha: 'ELEVADOR', marca: 'KREBS', tipo: 'COLUNA', filtrar: 'SIM', cd: 3, reversa: 0, ds: 0, outros: 0, chave: 'KREBS 2 t', ton: '2 t', fabricante: 'KREBS', marcaPivot: 'ERRADO' },
];

/* Aba Projeto: cabecalho na linha 1, com datas em formatos variados
   (Date e string dd/mm/aaaa) e uma acao concluida sem data (regressao 8.7). */
const CAB_PROJETO = [
  'N° PLAN ACTION', 'PROPOSTA', 'O QUE FAZER?', 'POR QUÊ?', 'COMO SOLUCIONAR?',
  'QUEM? (RESPONSAVEL)', 'ÍNICIO', 'FIM', 'REAGENDAMENTO', 'SITUAÇÃO',
  'DATA CONCLUSÃO', 'DURAÇÃO', 'STATUS', 'OBS', 'ESFORÇO', 'REDUZ ERRO ?',
  'MELHORA PRODUTIVIDADE ?', 'MELHORA P/ CLIENTE ?', 'REDUZ CUSTO ?',
  'AUMENTA SEGURANÇA ?', 'IMPACTO',
];

const LINHAS_PROJETO: unknown[][] = [
  ['1', 'Proposta A', 'Fazer A', 'Porque A', 'Como A', 'Ana', new Date(Date.UTC(2026, 4, 26)), new Date(Date.UTC(2026, 5, 10)), null, 'Concluida', new Date(Date.UTC(2026, 5, 9)), '15d', 'CONCLUIDO', '', 5, 'SIM', 'SIM', 'NAO', 'SIM', 'NAO', 5],
  ['2', 'Proposta A', 'Fazer A2', 'Porque A2', 'Como A2', 'Ana', new Date(Date.UTC(2026, 4, 26)), new Date(Date.UTC(2026, 5, 10)), null, 'Concluida', null, '15d', 'CONCLUIDO', 'sem data', 5, 'SIM', 'SIM', 'NAO', 'SIM', 'NAO', 5],
  ['3', 'Proposta B', 'Fazer B', 'Porque B', 'Como B', 'Bruno', '01/06/2026', '30/06/2026', '15/07/2026', 'Em andamento', null, '29d', 'ANDAMENTO', '', 15, 'NAO', 'SIM', 'SIM', 'NAO', 'NAO', 4],
  ['4', 'Proposta B', 'Fazer B2', 'Porque B2', 'Como B2', 'Bruno', '01/06/2026', '05/06/2026', null, 'Pendente', null, '4d', 'PENDENTE', '', 15, 'NAO', 'SIM', 'SIM', 'NAO', 'NAO', 4],
];

export function gerarWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Multiplos: duas linhas de titulo, cabecalho na linha 3 (indice 2).
  const aoaMult: unknown[][] = [
    ['Equalizacao de Elevadores CD Cajamar', null],
    [null, null],
    CAB_MULTIPLOS,
    ...LINHAS_MULTIPLOS.map(linhaParaArray),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaMult), 'Multiplos');

  // Projeto: cabecalho na linha 1 (indice 0).
  const aoaProj: unknown[][] = [CAB_PROJETO, ...LINHAS_PROJETO];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaProj), 'Projeto');

  // Aba pesada que NAO deve ser lida (regressao 8.6).
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['nao', 'ler'], [1, 2]]),
    'EstoqueAtual'
  );

  return wb;
}

export function gerarBufferXlsx(): Uint8Array {
  return XLSX.write(gerarWorkbook(), { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
