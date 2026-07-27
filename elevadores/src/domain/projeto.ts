/* ============================================================
   Status do projeto (secao 7.5, 7.6 e 7.7 do brief).
   Score decomposto, saude, matriz Impacto x Esforco e derivados
   de prazo. Todas as funcoes sao puras: recebem a lista de acoes
   ja filtrada, para que os indicadores respeitem os filtros da
   tela (inclusive o score).
   ============================================================ */
import type {
  Acao,
  MetricasProjeto,
  PilarScore,
  PontoMatriz,
  Quadrante,
  Saude,
} from './tipos';
import { PESOS_SCORE, RETORNO, SAUDE, MATRIZ } from '../config/regras';

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function ehConcluida(a: { situacao?: string; status?: string }): boolean {
  const alvo = `${a.situacao ?? ''} ${a.status ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return alvo.includes('conclu');
}

/* 7.7 Deriva prazo, atraso, reagendamento e conclusao sem data.
   O prazo valido e o Reagendamento quando existe; senao o Fim original.
   Atrasada = nao concluida e prazo < hoje. */
export function derivarAcao(base: Acao, hoje: Date): Acao {
  const concluida = ehConcluida(base);
  const prazoValido = base.reagendamento ?? base.fim ?? null;
  const reagendada = base.reagendamento != null;
  const atrasada = !concluida && prazoValido != null && prazoValido.getTime() < hoje.getTime();
  const concluidaSemData = concluida && base.dataConclusao == null;
  return { ...base, concluida, prazoValido, reagendada, atrasada, concluidaSemData };
}

export function derivarAcoes(acoes: Acao[], hoje: Date): Acao[] {
  return acoes.map((a) => derivarAcao(a, hoje));
}

/* 7.5 Score do projeto (0 a 100) decomposto em quatro pilares. */
export function calcularPilares(acoes: Acao[]): {
  pilares: PilarScore[];
  score: number;
  mediaImpacto: number;
  mediaEsforco: number;
} {
  const total = acoes.length || 1;
  const concluidas = acoes.filter((a) => a.concluida).length;
  const atrasadas = acoes.filter((a) => a.atrasada).length;
  const reagendadas = acoes.filter((a) => a.reagendada).length;

  const mediaImpacto = acoes.reduce((s, a) => s + (a.impacto || 0), 0) / total;
  const mediaEsforco = acoes.reduce((s, a) => s + (a.esforco || 0), 0) / total;

  const entrega = (concluidas / total) * 100;
  const prazo = (1 - atrasadas / total) * 100;
  const estabilidade = (1 - reagendadas / total) * 100;

  const impNorm = mediaImpacto / RETORNO.impactoMax;
  const esfNorm = Math.min(mediaEsforco / RETORNO.esforcoMax, 1);
  const retorno = clamp01(impNorm * (1 - esfNorm * RETORNO.pesoEsforco)) * 100;

  const brutos: { chave: PilarScore['chave']; rotulo: string; valor: number; peso: number }[] = [
    { chave: 'entrega', rotulo: 'Entrega', valor: entrega, peso: PESOS_SCORE.entrega },
    { chave: 'prazo', rotulo: 'Prazo', valor: prazo, peso: PESOS_SCORE.prazo },
    { chave: 'estabilidade', rotulo: 'Estabilidade', valor: estabilidade, peso: PESOS_SCORE.estabilidade },
    { chave: 'retorno', rotulo: 'Retorno', valor: retorno, peso: PESOS_SCORE.retorno },
  ];
  const pilares: PilarScore[] = brutos.map((p) => ({ ...p, contribuicao: p.valor * p.peso }));
  const score = Math.round(pilares.reduce((s, p) => s + p.contribuicao, 0));
  return { pilares, score, mediaImpacto, mediaEsforco };
}

/* 7.5 Saude do projeto. */
export function calcularSaude(score: number, atrasadas: number, total: number): Saude {
  const pctAtraso = total > 0 ? atrasadas / total : 0;
  if (score >= SAUDE.scoreSaudavel && pctAtraso <= SAUDE.atrasoSaudavel) return 'saudavel';
  if (score >= SAUDE.scoreAtencao && pctAtraso <= SAUDE.atrasoAtencao) return 'atencao';
  return 'critico';
}

export function calcularMetricas(acoes: Acao[]): MetricasProjeto {
  const total = acoes.length;
  const concluidas = acoes.filter((a) => a.concluida).length;
  const emAndamento = acoes.filter((a) => !a.concluida && a.reagendada).length;
  const pendentes = acoes.filter((a) => !a.concluida && !a.reagendada).length;
  const atrasadas = acoes.filter((a) => a.atrasada).length;
  const reagendadas = acoes.filter((a) => a.reagendada).length;
  const concluidasSemData = acoes.filter((a) => a.concluidaSemData).length;

  const { pilares, score, mediaImpacto, mediaEsforco } = calcularPilares(acoes);
  const saude = calcularSaude(score, atrasadas, total);

  const responsaveis = new Set(acoes.map((a) => a.responsavel).filter(Boolean)).size;
  const propostas = new Set(acoes.map((a) => a.proposta).filter(Boolean)).size;

  return {
    total,
    concluidas,
    emAndamento,
    pendentes,
    atrasadas,
    reagendadas,
    concluidasSemData,
    pctConcluidas: total > 0 ? (concluidas / total) * 100 : 0,
    mediaImpacto,
    mediaEsforco,
    pilares,
    score,
    saude,
    responsaveis,
    propostas,
  };
}

/* 7.6 Quadrante da matriz Impacto x Esforco (cortes ao meio: X=8, Y=3). */
export function quadranteDe(impacto: number, esforco: number): Quadrante {
  const altoImpacto = impacto > MATRIZ.corteImpacto;
  const baixoEsforco = esforco <= MATRIZ.corteEsforco;
  if (altoImpacto && baixoEsforco) return 'ganhos_rapidos';
  if (altoImpacto && !baixoEsforco) return 'estrategicos';
  if (!altoImpacto && baixoEsforco) return 'incrementais';
  return 'baixa_prioridade';
}

/* 7.6 Matriz plotada por proposta (esforco e impacto sao constantes
   dentro de cada proposta), gerando um ponto por proposta. */
export function montarMatriz(acoes: Acao[]): PontoMatriz[] {
  const grupos = new Map<string, Acao[]>();
  for (const a of acoes) {
    const p = String(a.proposta ?? '').trim();
    if (!p) continue;
    const lista = grupos.get(p);
    if (lista) lista.push(a);
    else grupos.set(p, [a]);
  }
  const pontos: PontoMatriz[] = [];
  for (const [proposta, lista] of grupos) {
    const esforco = lista[0].esforco || 0;
    const impacto = lista[0].impacto || 0;
    pontos.push({
      proposta,
      esforco,
      impacto,
      quadrante: quadranteDe(impacto, esforco),
      acoes: lista.length,
    });
  }
  return pontos;
}
