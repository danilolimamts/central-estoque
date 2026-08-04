/* ============================================================
   Historico do projeto: o que o painel sabia em cada importacao.

   Sem isso o painel so tem a foto de agora, e a primeira pergunta de
   qualquer reuniao de status ("melhorou desde a ultima vez?") fica sem
   resposta.

   O historico nao pode ser reconstruido da planilha atual. Da para
   saber quando cada acao foi concluida, mas nao o que estava atrasado
   em uma data passada: o reagendamento reescreve o prazo e apaga o
   atraso que existia. Por isso cada importacao grava o que acreditava
   naquele momento.
   ============================================================ */
import type { MetricasProjeto, Saude } from './tipos';

export interface Marco {
  /* Momento da importacao, em ISO. */
  em: string;
  arquivo: string;
  /* Separa os dados de exemplo da planilha de verdade: uma coisa nunca
     pode virar historico da outra. */
  demonstracao: boolean;
  total: number;
  concluidas: number;
  emAndamento: number;
  pendentes: number;
  atrasadas: number;
  pctConcluidas: number;
  score: number;
  saude: Saude;
}

/* Quantos marcos guardar. Passa de um ano de importacoes semanais e
   ocupa poucos KB, entao nao vale complicar com limpeza. */
export const LIMITE_MARCOS = 60;

export function marcoDe(
  metricas: MetricasProjeto,
  arquivo: string,
  em: Date,
  demonstracao = false
): Marco {
  return {
    em: em.toISOString(),
    arquivo,
    demonstracao,
    total: metricas.total,
    concluidas: metricas.concluidas,
    emAndamento: metricas.emAndamento,
    pendentes: metricas.pendentes,
    atrasadas: metricas.atrasadas,
    pctConcluidas: metricas.pctConcluidas,
    score: metricas.score,
    saude: metricas.saude,
  };
}

function diaDe(iso: string): string {
  return iso.slice(0, 10);
}

/* Acrescenta o marco ao historico.

   Reimportar a mesma planilha tres vezes no mesmo dia nao pode virar
   tres pontos no grafico: o ultimo do dia substitui os anteriores. */
export function registrarMarco(historico: Marco[], novo: Marco): Marco[] {
  const semODia = historico.filter(
    (m) => !(m.demonstracao === novo.demonstracao && diaDe(m.em) === diaDe(novo.em))
  );
  const lista = [...semODia, novo].sort((a, z) => a.em.localeCompare(z.em));
  return lista.slice(-LIMITE_MARCOS);
}

/* Os marcos que valem para os dados em uso. */
export function marcosDe(historico: Marco[], demonstracao: boolean): Marco[] {
  return historico.filter((m) => m.demonstracao === demonstracao);
}

export interface Variacao {
  /* Marco usado como referencia: o anterior ao atual. */
  anterior: Marco;
  dias: number;
  score: number;
  concluidas: number;
  atrasadas: number;
  pctConcluidas: number;
}

/* Compara a posicao de agora com a importacao anterior.

   Devolve nulo quando ainda nao ha com o que comparar. E melhor a tela
   nao mostrar nada do que mostrar uma variacao inventada contra zero. */
export function compararComAnterior(atual: Marco, historico: Marco[]): Variacao | null {
  const meus = marcosDe(historico, atual.demonstracao).filter((m) => m.em < atual.em);
  const anterior = meus[meus.length - 1];
  if (!anterior) return null;

  const dias = Math.round(
    (new Date(atual.em).getTime() - new Date(anterior.em).getTime()) / 86400000
  );
  return {
    anterior,
    dias,
    score: atual.score - anterior.score,
    concluidas: atual.concluidas - anterior.concluidas,
    atrasadas: atual.atrasadas - anterior.atrasadas,
    pctConcluidas: atual.pctConcluidas - anterior.pctConcluidas,
  };
}

export interface PontoSerie {
  rotulo: string;
  em: string;
  score: number;
  pctConcluidas: number;
  atrasadas: number;
}

/* Serie para o grafico de evolucao, na ordem do tempo. */
export function serieDoHistorico(historico: Marco[], demonstracao: boolean): PontoSerie[] {
  return marcosDe(historico, demonstracao).map((m) => ({
    rotulo: new Date(m.em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    em: m.em,
    score: m.score,
    pctConcluidas: Math.round(m.pctConcluidas),
    atrasadas: m.atrasadas,
  }));
}

/* Frase curta da variacao, para o cartao de status e para o e-mail. */
export function explicarVariacao(v: Variacao | null): string {
  if (!v) return 'Primeira medição: sem histórico para comparar ainda.';
  const quando =
    v.dias <= 0 ? 'hoje mesmo' : v.dias === 1 ? 'ontem' : `há ${v.dias} dias`;
  if (v.score === 0 && v.concluidas === 0) {
    return `Sem mudança desde a medição de ${quando}.`;
  }
  const partes: string[] = [];
  if (v.score !== 0) partes.push(`score ${v.score > 0 ? '+' : ''}${v.score}`);
  if (v.concluidas !== 0) {
    partes.push(`${v.concluidas > 0 ? '+' : ''}${v.concluidas} ação(ões) concluída(s)`);
  }
  if (v.atrasadas !== 0) {
    partes.push(`${v.atrasadas > 0 ? '+' : ''}${v.atrasadas} em atraso`);
  }
  return `Desde a medição de ${quando}: ${partes.join(', ')}.`;
}
