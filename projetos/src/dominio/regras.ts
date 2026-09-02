import type { Marco, Projeto, StatusProjeto, Tarefa } from './tipos';

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

const ENCERRADOS: StatusProjeto[] = ['concluido', 'cancelado'];

export function encerrado(p: Projeto): boolean {
  return ENCERRADOS.includes(p.status);
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
   assim muito atras do ritmo necessario. */
export function saude(p: Projeto): Saude {
  if (encerrado(p)) return 'encerrado';
  if (p.status === 'em_risco' || atrasado(p)) return 'critico';
  const esperado = percentualEsperado(p);
  if (esperado !== null && esperado - p.percentual >= 20) return 'atencao';
  if (p.status === 'pausado' || venceEm(p, 7)) return 'atencao';
  return 'no_prazo';
}

export interface Indicadores {
  total: number;
  ativos: number;
  concluidos: number;
  atrasados: number;
  vencendo: number;
  percentualMedio: number;
  porStatus: Record<StatusProjeto, number>;
}

export function calcularIndicadores(lista: Projeto[]): Indicadores {
  const porStatus = {
    nao_iniciado: 0, em_andamento: 0, em_risco: 0, pausado: 0, concluido: 0, cancelado: 0,
  } as Record<StatusProjeto, number>;
  let soma = 0;
  let vivos = 0;
  for (const p of lista) {
    porStatus[p.status] += 1;
    if (!encerrado(p)) { vivos += 1; soma += p.percentual; }
  }
  return {
    total: lista.length,
    ativos: vivos,
    concluidos: porStatus.concluido,
    atrasados: lista.filter(atrasado).length,
    vencendo: lista.filter((p) => venceEm(p, 15)).length,
    percentualMedio: vivos ? Math.round(soma / vivos) : 0,
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
    if (p.status !== 'concluido') continue;
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
