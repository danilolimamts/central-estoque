/* ============================================================
   Design tokens da Loja do Mecanico (secao 10 do brief).
   Fonte unica de cores e tipografia. Nunca usar fundo
   totalmente preto.
   ============================================================ */

export const cores = {
  laranja: {
    base: '#FA4616',
    escuro: '#C83812',
    medio: '#E13F14',
    claro: '#F8592D',
    suave: '#FB6B45',
  },
  navy: {
    base: '#001A72',
    escuro: '#00155B',
    medio: '#001767',
    claro: '#1A3180',
    suave: '#33488E',
  },
  dark: {
    base: '#1D1F2A',
    d2: '#171922',
    d3: '#1A1C26',
    d4: '#34353F',
    d5: '#4C4A55',
  },
  fundo: {
    profundo: '#0A0B23',
    azulProfundo: '#0B1934',
  },
  semantico: {
    verde: '#1F7A4C',
    ambar: '#B8860B',
    cinza: '#5B5E6B',
    linha: '#E4E6EE',
  },
} as const;

export const tipografia = {
  titulos: "'Poppins', sans-serif",
  numeros: "'Poppins', sans-serif",
  texto: "'Inter', sans-serif",
} as const;

/* Cores semanticas por situacao de conjunto, usadas no mapa de calor
   Fornecedor x Tonelada (secao 11). */
export const coresStatus = {
  CASADO: cores.semantico.verde,
  REVERSA: cores.semantico.ambar,
  DESCASADO: cores.laranja.base,
  'SEM ESTOQUE': cores.semantico.cinza,
} as const;

/* Cores dos quadrantes da matriz Impacto x Esforco (secao 7.6). */
export const coresQuadrante = {
  ganhos_rapidos: cores.semantico.verde,
  estrategicos: cores.navy.base,
  incrementais: cores.laranja.suave,
  baixa_prioridade: cores.laranja.escuro,
} as const;

/* Cores da saude do projeto (secao 7.5). */
export const coresSaude = {
  saudavel: cores.semantico.verde,
  atencao: cores.semantico.ambar,
  critico: cores.laranja.base,
} as const;
