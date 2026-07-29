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
import { PESOS_SCORE, RETORNO, SAUDE, MATRIZ, IMPACTO_CRITICO } from '../config/regras';

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
  const emAndamento = acoes.filter((a) => situacaoDe(a) === 'andamento').length;
  const pendentes = acoes.filter((a) => situacaoDe(a) === 'pendente').length;
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

/* ============================================================
   Leitura em texto do que os numeros querem dizer.

   Serve tanto a tela quanto a apresentacao, para as duas darem a
   mesma explicacao. Nada aqui e fixo: tudo sai dos dados que
   chegam, ja filtrados.
   ============================================================ */

/* Por que a saude esta nesse nivel, com os numeros que decidiram. */
export function explicarSaude(m: MetricasProjeto): string {
  const pctAtraso = m.total > 0 ? (m.atrasadas / m.total) * 100 : 0;
  const atraso = `${m.atrasadas} de ${m.total} ações com prazo vencido (${pctAtraso.toFixed(0)}%)`;

  if (m.saude === 'saudavel') {
    return `O plano está em dia: ${m.concluidas} ações concluídas e ${atraso}.`;
  }
  if (m.saude === 'critico') {
    const motivo =
      m.score < SAUDE.scoreAtencao
        ? `o score está em ${m.score}, abaixo de ${SAUDE.scoreAtencao}`
        : `o atraso passou de ${SAUDE.atrasoAtencao * 100}%`;
    return `O projeto está crítico porque ${motivo}: ${atraso}.`;
  }
  return `O projeto pede atenção: ${atraso}, com ${m.concluidas} de ${m.total} ações concluídas.`;
}

/* O pilar que mais puxa o score para baixo, com quanto ele deixou
   de somar. E a resposta para "onde mexer primeiro". */
export function pilarMaisFraco(m: MetricasProjeto): { pilar: PilarScore; perdido: number } | null {
  if (m.pilares.length === 0) return null;
  const comPerda = m.pilares.map((p) => ({ pilar: p, perdido: (100 - p.valor) * p.peso }));
  return comPerda.sort((a, b) => b.perdido - a.perdido)[0];
}

export interface Passo {
  texto: string;
  quantidade: number;
}

/* Os proximos passos, em ordem do que trava mais. */
export function proximosPassos(acoes: Acao[], m: MetricasProjeto, pontos: PontoMatriz[]): Passo[] {
  const passos: Passo[] = [];

  const atrasadas = acoes.filter((a) => a.atrasada);
  if (atrasadas.length) {
    const nomes = [...new Set(atrasadas.map((a) => a.responsavel).filter(Boolean))].slice(0, 3);
    passos.push({
      quantidade: atrasadas.length,
      texto: `Repactuar as ${atrasadas.length} ações em atraso com ${nomes.join(', ') || 'os responsáveis'}, definindo nova data ou tirando do plano.`,
    });
  }

  if (m.concluidasSemData > 0) {
    passos.push({
      quantidade: m.concluidasSemData,
      texto: `Preencher a data de conclusão das ${m.concluidasSemData} ações já concluídas, senão o acompanhamento continua distorcido.`,
    });
  }

  const ganhos = pontos.filter((p) => p.quadrante === 'ganhos_rapidos');
  if (ganhos.length) {
    passos.push({
      quantidade: ganhos.length,
      texto: `Priorizar os ganhos rápidos (${ganhos.slice(0, 3).map((p) => p.proposta).join(', ')}): muito impacto com pouco esforço.`,
    });
  }

  const criticas = acoes.filter((a) => a.impacto >= IMPACTO_CRITICO && !a.concluida);
  if (criticas.length) {
    passos.push({
      quantidade: criticas.length,
      texto: `Destravar as ${criticas.length} ações de impacto ${IMPACTO_CRITICO} que seguem em aberto.`,
    });
  }

  if (m.total > 0 && m.reagendadas / m.total > 0.3) {
    passos.push({
      quantidade: m.reagendadas,
      texto: `Revisar o tamanho do plano: ${m.reagendadas} de ${m.total} ações já foram reagendadas ao menos uma vez.`,
    });
  }

  if (passos.length === 0) {
    passos.push({ quantidade: 0, texto: 'Plano em dia. Manter a rotina de acompanhamento semanal.' });
  }
  return passos;
}

/* ============================================================
   Plano de acao consolidado (uma linha por PLAN ACTION).

   E a visao que a operacao usa para reportar: quantas atividades
   cada frente tem, em que pe estao, o periodo e o quanto ja
   avancou.
   ============================================================ */

export type SituacaoAcao = 'concluida' | 'andamento' | 'pendente';

/* A situacao vem da coluna SITUACAO da planilha. So quando ela nao
   diz nada e que o reagendamento decide, porque uma acao remarcada
   ja saiu do papel. */
export function situacaoDe(a: Acao): SituacaoAcao {
  if (a.concluida) return 'concluida';
  const texto = `${a.situacao ?? ''} ${a.status ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (texto.includes('andamento') || texto.includes('execucao')) return 'andamento';
  if (texto.includes('pendente') || texto.includes('nao iniciad')) return 'pendente';
  return a.reagendada ? 'andamento' : 'pendente';
}

export interface LinhaPlano {
  numero: number;
  proposta: string;
  atividades: number;
  emAndamento: number;
  pendentes: number;
  concluidas: number;
  inicio: Date | null;
  fim: Date | null;
  reagendamento: Date | null;
  pctConcluido: number;
}

function menorData(datas: (Date | null)[]): Date | null {
  const validas = datas.filter((d): d is Date => d != null);
  return validas.length ? new Date(Math.min(...validas.map((d) => d.getTime()))) : null;
}

function maiorData(datas: (Date | null)[]): Date | null {
  const validas = datas.filter((d): d is Date => d != null);
  return validas.length ? new Date(Math.max(...validas.map((d) => d.getTime()))) : null;
}

export function planoPorAcao(acoes: Acao[]): LinhaPlano[] {
  const grupos = new Map<string, Acao[]>();
  for (const a of acoes) {
    const p = String(a.proposta ?? '').trim() || 'Sem proposta';
    const lista = grupos.get(p);
    if (lista) lista.push(a);
    else grupos.set(p, [a]);
  }

  const linhas = [...grupos.entries()].map(([proposta, lista]) => {
    const concluidas = lista.filter((a) => situacaoDe(a) === 'concluida').length;
    return {
      numero: 0,
      proposta,
      atividades: lista.length,
      emAndamento: lista.filter((a) => situacaoDe(a) === 'andamento').length,
      pendentes: lista.filter((a) => situacaoDe(a) === 'pendente').length,
      concluidas,
      inicio: menorData(lista.map((a) => a.inicio)),
      fim: maiorData(lista.map((a) => a.fim)),
      reagendamento: maiorData(lista.map((a) => a.reagendamento)),
      pctConcluido: lista.length ? Math.round((concluidas / lista.length) * 100) : 0,
    };
  });

  /* A numeracao segue a ordem em que as acoes aparecem na planilha,
     que e a ordem que a operacao conhece. */
  return linhas
    .sort((a, z) => {
      const na = Math.min(...(grupos.get(a.proposta) ?? []).map((x) => Number(x.numPlanAction) || 9999));
      const nz = Math.min(...(grupos.get(z.proposta) ?? []).map((x) => Number(x.numPlanAction) || 9999));
      return na - nz;
    })
    .map((l, i) => ({ ...l, numero: i + 1 }));
}

export interface TotalPlano {
  atividades: number;
  emAndamento: number;
  pendentes: number;
  concluidas: number;
  pctConcluido: number;
}

export function totalDoPlano(linhas: LinhaPlano[]): TotalPlano {
  const t = linhas.reduce(
    (acc, l) => ({
      atividades: acc.atividades + l.atividades,
      emAndamento: acc.emAndamento + l.emAndamento,
      pendentes: acc.pendentes + l.pendentes,
      concluidas: acc.concluidas + l.concluidas,
      pctConcluido: 0,
    }),
    { atividades: 0, emAndamento: 0, pendentes: 0, concluidas: 0, pctConcluido: 0 }
  );
  return { ...t, pctConcluido: t.atividades ? Math.round((t.concluidas / t.atividades) * 100) : 0 };
}
