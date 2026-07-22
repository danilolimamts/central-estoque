/* ============================================================
   Inventário Rotativo — Regras e fórmulas compartilhadas
   (usado tanto pelo Web Worker quanto pela UI principal)
   ============================================================ */
const IR_META_ACURACIA = 0.97;

const IR_STATUS_LOCAL = {
  nao_iniciado:        {label:'Não iniciado',            cor:'#6B7280'},
  em_contagem:         {label:'Em contagem',              cor:'#FA4616'},
  convergido:          {label:'Convergido',               cor:'#1F8A52'},
  encerrado_sem_convergencia: {label:'Encerrado sem convergência (5ª rodada)', cor:'#C83812'}
};

const IR_KPI_FORMULAS = {
  acuraciaPecas: 'Acurácia Peças = 1 − (Σ|Diferença| ÷ Σ Qtde Lógica)',
  acuraciaLocal: 'Acurácia Local = 1 − (Locais com pelo menos 1 item divergente ÷ Locais congelados no ciclo)',
  acuraciaValor: 'Acurácia Valor = 1 − (Σ|Vl. Divergência| ÷ Σ Vl. Lógico)',
  andamentoCiclo: 'Andamento do Ciclo = Locais concluídos ÷ Locais congelados',
  qtdRecontagens: 'Locais que precisaram de mais de 2 rodadas de contagem',
  tempoMedioContagem: 'Média de (Data Fim Contagem − Data Início Contagem) por conferência, excluindo a contagem 1 (abertura)',
  diasRestantes: 'Locais pendentes ÷ ritmo médio de locais concluídos por dia',
  eficiencia: 'Eficiência = 60% × (Acurácia Local ÷ Meta) + 40% × (Locais concluídos ÷ Locais esperados até hoje, considerando ritmo linear até a data prevista de término)'
};

function irNormKey(s){
  if(s===undefined || s===null) return '';
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'')
    .trim();
}

/* Índice de Prioridade de Auditoria (0-100), pesos configuráveis.
   Cada componente já deve vir normalizado 0-1 antes de chamar esta função. */
function irCalcularPrioridade(pesos, nValor, nQtd, nRecontagens, nReincidencia){
  const score = (nValor*pesos.valor + nQtd*pesos.quantidade + nRecontagens*pesos.recontagens + nReincidencia*pesos.reincidencia) * 100;
  return Math.round(Math.max(0, Math.min(100, score)));
}
function irPrioridadeCor(score){
  if(score>=70) return '#C83812';
  if(score>=40) return '#FA4616';
  return '#33488E';
}
