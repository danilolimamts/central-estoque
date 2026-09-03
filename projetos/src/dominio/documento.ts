/* Campos da Proposta de Melhoria Sistemica. Espelha a especificacao de
   geracao de documentos do Bseller (secao 9), com os acrescimos que o
   modulo consegue preencher sozinho a partir do projeto. */

export type PrioridadeDoDocumento = 'ALTA' | 'MÉDIA' | 'BAIXA';

export interface Par {
  a: string;
  b: string;
}

export interface Trio {
  a: string;
  b: string;
  c: string;
}

export interface ImagemDoDocumento {
  url: string;
  legenda: string;
  /* Onde a imagem entra: o AS IS mostra o problema, o TO BE mostra o
     resultado, e o resto vira anexo visual no fim. */
  secao: 'as_is' | 'to_be' | 'anexo';
}

export interface FluxogramaDoDocumento {
  titulo: string;
  codigo: string;
}

export interface DadosDoDocumento {
  // A. Identificação
  numero: number;
  titulo: string;
  subtitulo: string;
  categoria: string;
  data: string;
  elaborado_por: string;
  destinatario: string;
  versao: string;
  status: string;
  documento_relacionado: string;
  contexto_especial: string;

  // B. Essência
  objetivo: string;
  dor: string;
  to_be: string;
  problema_central: string;
  ganhos: Par[];
  exemplo_pratico: string;

  // C. Regras e fluxo
  regras_negocio: string[];
  pontos_aberto: string[];
  fluxo: Trio[];

  // D. Consequências
  impactos: Par[];
  riscos: Par[];
  esforco: string;
  esforco_justificativa: string;
  esforco_bullets: string[];
  prioridade: PrioridadeDoDocumento;
  prioridade_justificativa: string;

  // E. Validação e resultado
  criterios_aceite: string[];
  cenarios_validacao: string[];
  kpis: Par[];
  rollout: Par[];
  roi_bullets: string[];
  roi_fechamento: string;
  resumo_executivo: string;

  // F. Material visual
  imagens: ImagemDoDocumento[];
  fluxogramas: FluxogramaDoDocumento[];
}

export interface Documento {
  id: string;
  projeto_id: string;
  numero: number;
  titulo: string;
  subtitulo: string | null;
  categoria: string | null;
  dados: DadosDoDocumento;
  gerado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export const ELABORADO_POR_PADRAO = 'Danilo Matos de Lima | Controle de Estoque';
export const DESTINATARIO_PADRAO = 'Jorran Ribeiro | PM/PO';
export const ESFORCO_PADRAO = 'A DEFINIR PELO TIME TÉCNICO';

export const ESFORCOS = [
  'A DEFINIR PELO TIME TÉCNICO',
  'BAIXO | A CONFIRMAR COM O TIME TÉCNICO',
  'BAIXO',
  'MÉDIO',
  'ALTO',
];

export function documentoVazio(numero: number): DadosDoDocumento {
  return {
    numero,
    titulo: '',
    subtitulo: '',
    categoria: '',
    data: dataPorExtenso(new Date()),
    elaborado_por: ELABORADO_POR_PADRAO,
    destinatario: DESTINATARIO_PADRAO,
    versao: '1.0',
    status: 'Para análise',
    documento_relacionado: '',
    contexto_especial: '',
    objetivo: '',
    dor: '',
    to_be: '',
    problema_central: '',
    ganhos: [],
    exemplo_pratico: '',
    regras_negocio: [],
    pontos_aberto: [],
    fluxo: [],
    impactos: [],
    riscos: [],
    esforco: ESFORCO_PADRAO,
    esforco_justificativa: '',
    esforco_bullets: [],
    prioridade: 'MÉDIA',
    prioridade_justificativa: '',
    criterios_aceite: [],
    cenarios_validacao: [],
    kpis: [],
    rollout: [],
    roi_bullets: [],
    roi_fechamento: '',
    resumo_executivo: '',
    imagens: [],
    fluxogramas: [],
  };
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function dataPorExtenso(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/* Nome do arquivo no padrao NN__Proposta_Melhoria_Sistemica_[Nome].docx
   (secao 10 da especificacao). */
export function nomeDoArquivo(dados: DadosDoDocumento): string {
  const resumo = dados.titulo
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || 'Proposta';
  return `${String(dados.numero).padStart(2, '0')}__Proposta_Melhoria_Sistemica_${resumo}.docx`;
}

/* A especificacao proibe travessao no conteudo (secao 8.1). Quem
   escreve nem sempre lembra, entao o texto e corrigido na geracao. */
export function semTravessao(texto: string): string {
  return texto
    .replace(/\s+[—–]\s+/g, ': ')
    .replace(/[—–]/g, '-');
}
