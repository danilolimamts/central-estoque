/* ============================================================
   Configuracao das regras de negocio (secao 7 do brief).
   Constantes concentradas aqui, fora do codigo de tela e de
   dominio, para poderem ser ajustadas em um so lugar.
   ============================================================ */

/* 7.2 Ratio Coluna por Base, definido pela tonelada (nao pelo peso bruto).
   Ate 3,2 t: 1 base + 1 coluna. De 4 t para cima: 1 base + 2 colunas. */
export function ratioDaTonelada(ton: string): number {
  const t = String(ton ?? '').trim().toUpperCase();
  return t.startsWith('4') || t.startsWith('5') ? 2 : 1;
}

/* 7.2 Valores que contam como componente de kit. Filtro estrito:
   somente BASE e COLUNA. BOMBA, COMANDO, MOTOR e outros ficam de fora
   (regressao 8.2). */
export const TIPO_BASE = 'BASE';
export const TIPO_COLUNA = 'COLUNA';

/* 7.4 Valor do kit fica na COLUNA: o S deve estar na coluna e a base em N. */
export const VALORACAO_S = 'S';
export const VALORACAO_N = 'N';

/* 7.5 Pesos dos quatro pilares do score do projeto (0 a 1, somam 1). */
export const PESOS_SCORE = {
  entrega: 0.4,
  prazo: 0.25,
  estabilidade: 0.2,
  retorno: 0.15,
} as const;

/* 7.5 Normalizacao do pilar de retorno. */
export const RETORNO = {
  impactoMax: 5,
  esforcoMax: 15,
  pesoEsforco: 0.5,
} as const;

/* 7.5 Cortes de saude do projeto. */
export const SAUDE = {
  scoreSaudavel: 70,
  atrasoSaudavel: 0.1,
  scoreAtencao: 50,
  atrasoAtencao: 0.3,
} as const;

/* 7.6 Cortes da matriz Impacto x Esforco (divididos exatamente ao meio). */
export const MATRIZ = {
  corteEsforco: 8,
  corteImpacto: 3,
  eixoEsforcoMax: 16,
  eixoImpactoMax: 6,
  /* Escala Fibonacci usada no eixo de esforco. */
  escalaEsforco: [3, 5, 7, 8, 15],
} as const;

/* 7.5 Impacto que marca uma acao como critica (usado nos alertas). */
export const IMPACTO_CRITICO = 5;

/* 8.7 Esforco alto que dispara alerta. */
export const ESFORCO_ALTO = 10;
