/* ============================================================
   Tipos do dominio (secao 5 do brief).
   Contratos compartilhados entre parsers, dominio e tela.
   ============================================================ */

/* Uma linha da aba Multiplos (secao 6). */
export interface Componente {
  itemVolMultiplo: string; // item pai (elevador)
  nomeItemVolMultiplo: string;
  itemComponente: string;
  nomeItemComponente: string;
  quantidade: number;
  inInterface: string; // 'S' | 'N' | ''
  peso: number;
  linhaProduto: string;
  marca: string;
  componenteBaseColuna: string; // 14 valores distintos; so BASE e COLUNA entram no kit
  filtrar: string;
  cd: number; // saldo no CD
  reversa: number;
  ds: number;
  outros: number;
  chave: string; // Marca + Fabricante + Tonelada
  toneladaFixa: string; // ex.: '4 t'
  fabricante: string;
}

export type StatusConjunto = 'CASADO' | 'REVERSA' | 'DESCASADO' | 'SEM ESTOQUE';

/* Um conjunto e o agrupamento pela coluna Chave (secao 7.1). */
export interface Conjunto {
  chave: string;
  marca: string;
  fabricante: string;
  toneladaFixa: string;
  ratio: number;

  baseCD: number; // soma do saldo CD das linhas BASE
  colCD: number; // soma do saldo CD das linhas COLUNA
  reversa: number; // soma do saldo reversa (base + coluna)
  ds: number;
  outros: number;

  colunasNecessarias: number;
  deficit: number; // colunasNecessarias - colCD
  kits: number;
  status: StatusConjunto;

  comprarBase: number;
  comprarColuna: number;

  componentes: Componente[];
}

export type DiagnosticoValoracao = 'OK' | 'CORRIGIR' | 'DUPLICADO' | 'SEM S';

/* Auditoria do campo "in interface" por elevador (item pai) (secao 7.4). */
export interface Valoracao {
  itemVolMultiplo: string;
  nomeItemVolMultiplo: string;
  marca: string;
  fabricante: string;
  diagnostico: DiagnosticoValoracao;
  itensBase: string[]; // itemComponente das linhas BASE
  itensColuna: string[]; // itemComponente das linhas COLUNA
  /* Instrucoes prontas para o Bseller, ex.: 'BASE 965793: S -> N'. */
  correcoes: string[];
}

/* Uma linha da aba Projeto (secao 6). */
export interface Acao {
  numPlanAction: string;
  proposta: string;
  oQueFazer: string;
  porque: string;
  comoSolucionar: string;
  responsavel: string;
  inicio: Date | null;
  fim: Date | null;
  reagendamento: Date | null;
  situacao: string;
  dataConclusao: Date | null;
  duracao: string;
  status: string;
  obs: string;
  esforco: number;
  reduzErro: string;
  melhoraProdutividade: string;
  melhoraCliente: string;
  reduzCusto: string;
  aumentaSeguranca: string;
  impacto: number;

  /* Derivados (secao 7.7). */
  concluida: boolean;
  prazoValido: Date | null; // reagendamento quando existe, senao fim
  atrasada: boolean;
  reagendada: boolean;
  concluidaSemData: boolean;
}

export type Saude = 'saudavel' | 'atencao' | 'critico';

export interface PilarScore {
  chave: 'entrega' | 'prazo' | 'estabilidade' | 'retorno';
  rotulo: string;
  valor: number; // 0 a 100
  peso: number;
  contribuicao: number; // valor * peso
}

export interface MetricasProjeto {
  total: number;
  concluidas: number;
  emAndamento: number;
  pendentes: number;
  atrasadas: number;
  reagendadas: number;
  concluidasSemData: number;

  pctConcluidas: number;
  mediaImpacto: number;
  mediaEsforco: number;

  pilares: PilarScore[];
  score: number;
  saude: Saude;

  responsaveis: number;
  propostas: number;
}

export type Quadrante =
  | 'ganhos_rapidos'
  | 'estrategicos'
  | 'incrementais'
  | 'baixa_prioridade';

/* Ponto da matriz Impacto x Esforco, plotado por proposta (secao 7.6). */
export interface PontoMatriz {
  proposta: string;
  esforco: number;
  impacto: number;
  quadrante: Quadrante;
  acoes: number; // quantas acoes compoem a proposta
}
