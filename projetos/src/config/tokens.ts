/* Cores do modulo. O roxo vem do card "Projetos" do hub (index.html da
   raiz) para que o modulo seja reconhecido pela mesma cor de origem.
   Navy e laranja seguem a marca Loja do Mecanico. */
export const cores = {
  roxo: { base: '#8B5CF6', escuro: '#6D28D9', medio: '#7C3AED', claro: '#C4B5FD', suave: '#F1EAFE' },
  navy: { base: '#0A0E3D', medio: '#161933', claro: '#2A3AA8' },
  laranja: '#FA4616',
  tinta: { base: '#161933', suave: '#6A6F94' },
  linha: '#E7E8F5',
  papel: '#F3F4FB',
  verde: '#2E8B57',
  ambar: '#C79212',
  vermelho: '#D2453A',
} as const;

/* Uma cor por situacao, usada em selo, grafico e cronograma ao mesmo
   tempo - a leitura so funciona se for sempre a mesma. */
/* Paleta validada para daltonismo (scripts/validate_palette.js do guia
   de dataviz): todos os tons dentro da faixa de luminosidade, croma
   acima do piso e separacao suficiente entre vizinhos. As duas
   situacoes encerradas (concluido x cancelado) ficam na faixa 6-8 de
   separacao para deuteranopia, o que so e aceitavel porque todo grafico
   aqui traz rotulo e legenda - cor nunca e o unico codigo. */
export const coresStatus = {
  nao_iniciado: '#9E86D8',
  em_andamento: '#2F6FE0',
  em_risco: '#C79212',
  pausado: '#B0568F',
  concluido: '#2E8B57',
  cancelado: '#D2453A',
} as const;

export const coresPrioridade = {
  baixa: '#6A6F94',
  media: '#2F6FE0',
  alta: '#FA4616',
  critica: '#D2453A',
} as const;
