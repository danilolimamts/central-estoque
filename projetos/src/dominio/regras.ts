import { avancoPorConclusao } from './arvore';
import { ehCancelada, ehConcluida, ehEncerrada, situacoes } from './situacoes';
import type { Marco, Projeto, Tarefa } from './tipos';

/* Datas do banco chegam como 'AAAA-MM-DD'. new Date('2026-03-01') e
   interpretado em UTC e volta um dia atras no fuso de Sao Paulo, entao
   a data e montada a partir das partes. */
export function paraData(iso: string | null): Date | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
}

export function hoje(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatarData(iso: string | null): string {
  const d = paraData(iso);
  return d ? d.toLocaleDateString('pt-BR') : '—';
}

export function isoDeHoje(): string {
  const d = hoje();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function diasEntre(inicio: Date, fim: Date): number {
  return Math.round((fim.getTime() - inicio.getTime()) / 86400000);
}



export function encerrado(p: Projeto): boolean {
  return ehEncerrada(p.status);
}

/* Atraso so faz sentido para projeto vivo: concluido e cancelado saem
   da conta para nao inflar o indicador do painel. */
export function diasDeAtraso(p: Projeto): number {
  if (encerrado(p)) return 0;
  const fim = paraData(p.fim_previsto);
  if (!fim) return 0;
  const dias = diasEntre(fim, hoje());
  return dias > 0 ? dias : 0;
}

export function atrasado(p: Projeto): boolean {
  return diasDeAtraso(p) > 0;
}

/* Vence nos proximos N dias e ainda nao encerrado. */
export function venceEm(p: Projeto, dias: number): boolean {
  if (encerrado(p)) return false;
  const fim = paraData(p.fim_previsto);
  if (!fim) return false;
  const restantes = diasEntre(hoje(), fim);
  return restantes >= 0 && restantes <= dias;
}

/* Percentual esperado pela linha do tempo: quanto do prazo ja passou.
   Comparado com o percentual informado, mostra se a entrega esta
   andando no ritmo do cronograma. */
export function percentualEsperado(p: Projeto): number | null {
  const inicio = paraData(p.inicio_previsto);
  const fim = paraData(p.fim_previsto);
  if (!inicio || !fim) return null;
  const total = diasEntre(inicio, fim);
  if (total <= 0) return 100;
  const corridos = diasEntre(inicio, hoje());
  return Math.min(100, Math.max(0, Math.round((corridos / total) * 100)));
}

export type Saude = 'no_prazo' | 'atencao' | 'critico' | 'encerrado';

export const rotuloSaude: Record<Saude, string> = {
  no_prazo: 'No prazo', atencao: 'Atenção', critico: 'Crítico', encerrado: 'Encerrado',
};

export const coresSaude: Record<Saude, string> = {
  no_prazo: '#2E8B57', atencao: '#C79212', critico: '#D2453A', encerrado: '#6A6F94',
};

/* Semaforo do projeto. A defasagem contra o esperado entra junto com o
   atraso de prazo porque um projeto pode estar dentro da data e ainda
   assim muito atras do ritmo necessario.
   O ritmo so vale para quem tem atividades dentro: ali o percentual
   mede entrega parcial. Numa atividade solta o avanco e 0 ate ela ser
   concluida, entao comparar com o esperado marcaria "atenção" em tudo
   que passou de um quinto do prazo — a data ja e cobrada pelas outras
   regras. */
export function saude(p: Projeto, carteira: Projeto[] = []): Saude {
  if (encerrado(p)) return 'encerrado';
  if (p.status === 'em_risco' || atrasado(p)) return 'critico';
  const avanco = avancoPorConclusao(carteira, p.id);
  const esperado = percentualEsperado(p);
  if (avanco && esperado !== null && esperado - avanco.percentual >= 20) return 'atencao';
  if (p.status === 'pausado' || venceEm(p, 7)) return 'atencao';
  return 'no_prazo';
}

export interface Indicadores {
  total: number;
  ativos: number;
  concluidos: number;
  atrasados: number;
  vencendo: number;
  percentualConcluido: number;
  porStatus: Record<string, number>;
}

export function calcularIndicadores(lista: Projeto[]): Indicadores {
  /* A contagem por situacao nasce com as configuradas (para a coluna
     zerada aparecer no grafico) e ganha as que so existem nos dados. */
  const porStatus: Record<string, number> = {};
  for (const s of situacoes()) porStatus[s.chave] = 0;

  let vivos = 0;
  /* O avanco da carteira e a fatia ja concluida, nao a media de
     percentuais: cancelada sai do denominador porque nao e trabalho
     pendente nem entregue. */
  let valem = 0;
  let concluidos = 0;
  for (const p of lista) {
    porStatus[p.status] = (porStatus[p.status] ?? 0) + 1;
    if (!encerrado(p)) vivos += 1;
    if (!ehCancelada(p.status)) valem += 1;
    if (ehConcluida(p.status)) concluidos += 1;
  }
  return {
    total: lista.length,
    ativos: vivos,
    concluidos,
    atrasados: lista.filter(atrasado).length,
    vencendo: lista.filter((p) => venceEm(p, 15)).length,
    percentualConcluido: valem ? Math.round((concluidos / valem) * 100) : 0,
    porStatus,
  };
}

/* Evolucao mensal de entregas: quantos projetos foram concluidos em
   cada um dos ultimos N meses. */
export function entregasPorMes(lista: Projeto[], meses = 12): { rotulo: string; total: number }[] {
  const base = hoje();
  const chaves: { chave: string; rotulo: string; total: number }[] = [];
  for (let i = meses - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    chaves.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      total: 0,
    });
  }
  for (const p of lista) {
    if (!ehConcluida(p.status)) continue;
    const fim = (p.fim_real ?? p.fim_previsto)?.slice(0, 7);
    const alvo = chaves.find((c) => c.chave === fim);
    if (alvo) alvo.total += 1;
  }
  return chaves.map(({ rotulo, total }) => ({ rotulo, total }));
}

export function progressoDeTarefas(tarefas: Tarefa[]): number {
  if (!tarefas.length) return 0;
  const feitas = tarefas.filter((t) => t.status === 'concluida').length;
  return Math.round((feitas / tarefas.length) * 100);
}

export function marcoAtrasado(m: Marco): boolean {
  if (m.concluido) return false;
  const d = paraData(m.data_prevista);
  return !!d && diasEntre(d, hoje()) > 0;
}

export function tarefaAtrasada(t: Tarefa): boolean {
  if (t.status === 'concluida') return false;
  const d = paraData(t.prazo);
  return !!d && diasEntre(d, hoje()) > 0;
}
