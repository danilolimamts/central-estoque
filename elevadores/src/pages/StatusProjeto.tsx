/* ============================================================
   Pagina 2: Status Projeto (secao 11 do brief).
   Score decomposto, saude, alertas, BurnDown, matriz e Gantt.
   Todos os indicadores respeitam os filtros globais, inclusive
   o score: as metricas sao sempre recalculadas sobre a lista ja
   filtrada.
   ============================================================ */
import { useMemo, useRef, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import type { Acao, Componente, MetricasProjeto } from '../domain/tipos';
import { SaudeDoEstoque } from '../components/SaudeDoEstoque';
import { EvolucaoDivergencias } from '../components/EvolucaoDivergencias';
import type { DivergenciaSAC } from '../domain/divergencias';
import type { AjusteCaso } from '../domain/ajustes';
import {
  calcularMetricas, montarMatriz, planoPorAcao, totalDoPlano, situacaoDe, acoesUnicas,
  resumirGanhos, ganhosDaAcao, GANHOS,
} from '../domain/projeto';
import { cores } from '../config/tokens';
import { Grafico } from '../components/charts/Grafico';
import { MiniTabela, LinhaDica } from '../components/ui/MiniTabela';
import { BarraFiltros, Botao, Busca, Cartao, Chips, Selecao, Selo, Tabela, Td, Th, Vazio } from '../components/ui';
import { baixarPlanoProjeto } from '../export/exportExcel';
import { CompartilharStatus } from '../components/CompartilharStatus';
import { CLASSE_FORA, CLASSE_SO_BOLETIM } from '../export/boletimStatus';
import { compararComAnterior, explicarVariacao, marcoDe } from '../domain/historico';
import type { Marco } from '../domain/historico';
import { baixarApresentacao, RECORTES, type Recorte } from '../export/exportPptx';
import { MATRIZ } from '../config/regras';

/* Medidor de conclusao do plano. Mostra o quanto ja foi entregue,
   sem rotulo de julgamento: o andamento fala por si. */
function Medidor({ pct, metricas }: { pct: number; metricas: MetricasProjeto }) {
  const cor = pct === 100 ? cores.semantico.verde : cores.laranja.base;
  const r = 96;
  const cx = 118;
  const cy = 124;
  const a0 = (-220 * Math.PI) / 180;
  const a1 = (40 * Math.PI) / 180;
  const ponto = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  const arco = (frac: number) => {
    const a = a0 + (a1 - a0) * frac;
    const [x0, y0] = ponto(a0);
    const [x1, y1] = ponto(a);
    const grande = a - a0 > Math.PI ? 1 : 0;
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${grande} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };

  return (
    <div className="flex flex-col items-center">
      <svg width="236" height="196" viewBox="0 0 236 196" role="img" aria-label={`${pct}% do plano concluído`}>
        <path d={arco(1)} fill="none" stroke="var(--line)" strokeWidth="28" strokeLinecap="round" />
        <path d={arco(pct / 100)} fill="none" stroke={cor} strokeWidth="28" strokeLinecap="round" />
        <text x="118" y="120" textAnchor="middle" fontFamily="Poppins, sans-serif" fontSize="54" fontWeight="600" fill="var(--ink)">
          {pct}%
        </text>
        <text x="118" y="150" textAnchor="middle" fontSize="13" fill="var(--ink-soft)">
          do plano concluído
        </text>
      </svg>

      {/* Os numeros que antes ficavam em cartoes soltos passam a viver
          junto da rosca, que e o que a reuniao olha primeiro. */}
      <div className="eq-rosca-numeros">
        <div>
          <span className="n" style={{ color: cores.semantico.verde }}>
            {metricas.concluidas}<i>/{metricas.total}</i>
          </span>
          <span className="l">Concluídas</span>
        </div>
        <div>
          <span className="n" style={{ color: metricas.atrasadas > 0 ? cores.laranja.base : 'var(--ink)' }}>
            {metricas.atrasadas}
          </span>
          <span className="l">Atrasadas</span>
        </div>
        <div>
          <span className="n" style={{ color: metricas.concluidasSemData > 0 ? cores.semantico.ambar : 'var(--ink)' }}>
            {metricas.concluidasSemData}
          </span>
          <span className="l">Concluídas sem data</span>
        </div>
      </div>
    </div>
  );
}


/* Escala monocromatica do andamento. E sequencial, nao categorica: vai
   do pendente (claro) ao concluido (escuro), acompanhando o avanco. O
   laranja fica reservado ao atraso, que e estado, nao etapa. */
const ESCALA = {
  concluida: '#001A72',
  andamento: '#4F63AE',
  pendente: '#B9C0DC',
} as const;

/* Os quadrantes tambem sao uma ordem de prioridade, entao seguem a
   mesma escala: quanto mais escuro, mais cedo entra na fila. */
/* Cor de cada frente na matriz: verde quando fechou, amarelo quando
   comecou e vermelho quando nao saiu do papel. */
const COR_ANDAMENTO = {
  concluido: '#1F7A4C',
  iniciado: '#B8860B',
  nao_iniciado: '#C83812',
} as const;

const ROTULO_ANDAMENTO = {
  concluido: 'Concluído',
  iniciado: 'Iniciado',
  nao_iniciado: 'Não iniciado',
} as const;

const ESCALA_QUADRANTE = {
  ganhos_rapidos: '#001A72',
  estrategicos: '#4F63AE',
  incrementais: '#8B96C6',
  baixa_prioridade: '#B9C0DC',
} as const;

const ROTULO_SITUACAO = {
  concluida: 'Concluídas',
  andamento: 'Em andamento',
  pendente: 'Pendentes',
} as const;

/* Entregas por semana: mostra se o time esta entregando em ritmo
   constante ou em picos. */
function EntregasPorSemana({ acoes }: { acoes: Acao[] }) {
  const dados = useMemo(() => {
    const feitas = acoes
      .filter((a) => a.concluida)
      .map((a) => a.dataConclusao ?? a.prazoValido ?? a.fim)
      .filter((d): d is Date => d != null);
    if (feitas.length === 0) return null;

    const t0 = Math.min(...feitas.map((d) => d.getTime()));
    const t1 = Math.max(...feitas.map((d) => d.getTime()));
    const pontos: { semana: number; qtd: number; inicio: Date }[] = [];
    let n = 1;
    for (let t = t0; t <= t1 + 1; t += 7 * 86400000) {
      const fimBalde = t + 7 * 86400000;
      pontos.push({
        semana: n++,
        qtd: feitas.filter((d) => d.getTime() >= t && d.getTime() < fimBalde).length,
        inicio: new Date(t),
      });
    }
    return pontos;
  }, [acoes]);

  if (!dados || dados.length === 0) return null;

  const L = 640;
  const A = 240;
  const pad = { esq: 38, dir: 16, topo: 22, base: 40 };
  const maximo = Math.max(...dados.map((d) => d.qtd), 1);
  const X = (i: number) =>
    pad.esq + (dados.length === 1 ? (L - pad.esq - pad.dir) / 2 : (i / (dados.length - 1)) * (L - pad.esq - pad.dir));
  const Y = (v: number) => A - pad.base - (v / maximo) * (A - pad.base - pad.topo);

  const linha = dados.map((d, i) => `${X(i).toFixed(1)},${Y(d.qtd).toFixed(1)}`).join(' ');
  /* A area fecha na base para o gradiente ter onde se apoiar. */
  const area = `${X(0)},${Y(0)} ${linha} ${X(dados.length - 1)},${Y(0)}`;
  const media = dados.reduce((acc, d) => acc + d.qtd, 0) / dados.length;

  return (
    <Cartao
      titulo="Entregas por semana"
      descricao={`média de ${media.toFixed(1)} ações concluídas por semana`}
    >
      <svg width="100%" viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Entregas por semana">
        <defs>
          <linearGradient id="gradEntregas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FA4616" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#FA4616" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grade horizontal discreta, so para dar referencia de altura. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={pad.esq}
            y1={Y(maximo * f)}
            x2={L - pad.dir}
            y2={Y(maximo * f)}
            stroke="var(--line)"
            strokeWidth="1"
          />
        ))}

        <polygon points={area} fill="url(#gradEntregas)" />
        <polyline points={linha} fill="none" stroke="#FA4616" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {dados.map((d, i) => (
          <g key={d.semana}>
            <circle cx={X(i)} cy={Y(d.qtd)} r="4.5" fill="#FA4616" stroke="var(--surface)" strokeWidth="2">
              <title>{`Semana ${d.semana} (${d.inicio.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}): ${d.qtd} concluída(s)`}</title>
            </circle>
            {d.qtd > 0 && (
              <text x={X(i)} y={Y(d.qtd) - 11} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">
                {d.qtd}
              </text>
            )}
            <text x={X(i)} y={A - 16} textAnchor="middle" fontSize="10.5" fill="var(--ink-soft)">
              S{d.semana}
            </text>
          </g>
        ))}

        <text x={pad.esq - 8} y={Y(maximo) + 4} textAnchor="end" fontSize="10" fill="var(--ink-soft)">
          {maximo}
        </text>
        <text x={pad.esq - 8} y={Y(0) + 4} textAnchor="end" fontSize="10" fill="var(--ink-soft)">
          0
        </text>
      </svg>
    </Cartao>
  );
}

/* Ganhos do projeto: o que cada acao promete melhorar e o quanto disso
   ja chegou na operacao. Responde "para que serve esse plano". */
function GanhosDoProjeto({ acoes }: { acoes: Acao[] }) {
  const linhas = useMemo(() => resumirGanhos(acoes), [acoes]);
  const comAlgum = linhas.filter((l) => l.total > 0);
  if (comAlgum.length === 0) return null;

  return (
    <Cartao
      titulo="Ganhos do projeto"
      descricao="quantas ações endereçam cada ganho e quanto já foi entregue"
    >
      <div className="eq-frentes">
        {comAlgum.map((l) => (
          <div key={l.chave} className="eq-frente">
            <div className="eq-frente-nome" title={l.rotulo}>
              {l.rotulo}
            </div>
            <div className="eq-frente-barra" title={`${l.entregues} de ${l.total} já entregues`}>
              <span style={{ width: `${l.pct}%`, background: ESCALA.concluida }} />
              <span style={{ width: `${100 - l.pct}%`, background: ESCALA.pendente }} />
            </div>
            <div className="eq-frente-pct">
              {l.entregues}/{l.total}
            </div>
          </div>
        ))}
      </div>
      <div className="eq-legenda">
        <span>
          <i style={{ background: ESCALA.concluida }} />
          Já entregue
        </span>
        <span>
          <i style={{ background: ESCALA.pendente }} />
          Ainda em aberto
        </span>
      </div>
    </Cartao>
  );
}


function Matriz({ acoes }: { acoes: Acao[] }) {
  const pontos = useMemo(() => montarMatriz(acoes), [acoes]);
  /* O andamento de cada frente decide a cor do ponto, entao a matriz
     mostra prioridade e situacao ao mesmo tempo. */
  const andamento = useMemo(() => {
    const mapa = new Map<string, keyof typeof COR_ANDAMENTO>();
    for (const l of planoPorAcao(acoes)) {
      mapa.set(
        l.proposta,
        l.pctConcluido === 100 ? 'concluido' : l.concluidas + l.emAndamento > 0 ? 'iniciado' : 'nao_iniciado'
      );
    }
    return mapa;
  }, [acoes]);
  const L = 700;
  const A = 300;
  const pad = 48;
  /* O eixo ia de 0 a 6 mesmo quando todos os pontos ficavam entre 3 e 5,
     deixando metade do quadro vazio. Encolhe ate os dados, sem esconder
     a linha de corte. */
  const impactos = pontos.map((p) => p.impacto);
  const yMin = Math.max(0, Math.min(MATRIZ.corteImpacto - 1, ...impactos) - 0.5);
  const yMax = Math.max(MATRIZ.corteImpacto + 1, ...impactos) + 0.5;
  const X = (v: number) => pad + (v / MATRIZ.eixoEsforcoMax) * (L - pad - 18);
  const Y = (v: number) => A - pad - ((v - yMin) / (yMax - yMin)) * (A - pad - 18);

  return (
    <Cartao titulo="Matriz Impacto × Esforço" descricao={`${pontos.length} propostas · quanto mais à esquerda e acima, melhor a relação`}>
      <div className="flex justify-center">
        <svg width="100%" viewBox={`0 0 ${L} ${A}`} style={{ maxWidth: L }} role="img" aria-label="Matriz de impacto por esforço">
          <rect x={X(0)} y={Y(yMax)} width={X(MATRIZ.corteEsforco) - X(0)} height={Y(MATRIZ.corteImpacto) - Y(yMax)} fill={ESCALA_QUADRANTE.ganhos_rapidos} opacity="0.08" />
          <rect x={X(MATRIZ.corteEsforco)} y={Y(yMax)} width={X(MATRIZ.eixoEsforcoMax) - X(MATRIZ.corteEsforco)} height={Y(MATRIZ.corteImpacto) - Y(yMax)} fill={ESCALA_QUADRANTE.estrategicos} opacity="0.08" />
          <rect x={X(0)} y={Y(MATRIZ.corteImpacto)} width={X(MATRIZ.corteEsforco) - X(0)} height={Y(yMin) - Y(MATRIZ.corteImpacto)} fill={ESCALA_QUADRANTE.incrementais} opacity="0.08" />
          <rect x={X(MATRIZ.corteEsforco)} y={Y(MATRIZ.corteImpacto)} width={X(MATRIZ.eixoEsforcoMax) - X(MATRIZ.corteEsforco)} height={Y(yMin) - Y(MATRIZ.corteImpacto)} fill={ESCALA_QUADRANTE.baixa_prioridade} opacity="0.08" />

          <line x1={X(MATRIZ.corteEsforco)} y1={Y(yMin)} x2={X(MATRIZ.corteEsforco)} y2={Y(yMax)} stroke="var(--line)" strokeDasharray="4 4" />
          <line x1={X(0)} y1={Y(MATRIZ.corteImpacto)} x2={X(MATRIZ.eixoEsforcoMax)} y2={Y(MATRIZ.corteImpacto)} stroke="var(--line)" strokeDasharray="4 4" />
          <line x1={X(0)} y1={Y(yMin)} x2={X(MATRIZ.eixoEsforcoMax)} y2={Y(yMin)} stroke="var(--ink-soft)" />
          <line x1={X(0)} y1={Y(yMin)} x2={X(0)} y2={Y(yMax)} stroke="var(--ink-soft)" />

          {MATRIZ.escalaEsforco.map((e) => (
            <text key={e} x={X(e)} y={Y(yMin) + 15} textAnchor="middle" fontSize="10" fill="var(--ink-soft)">
              {e}
            </text>
          ))}
          {pontos.map((p) => {
            const cx = X(p.esforco);
            const cy = Y(p.impacto);
            /* Pontos na mesma faixa de impacto teriam os nomes um sobre o
               outro. Cada um recebe um degrau vertical conforme a ordem
               em que aparece na faixa. */
            const naFaixa = pontos
              .filter((o) => Math.abs(Y(o.impacto) - cy) < 14)
              .sort((a, b) => X(a.esforco) - X(b.esforco));
            const degrau = naFaixa.findIndex((o) => o.proposta === p.proposta);
            const dy = naFaixa.length > 1 ? (degrau - (naFaixa.length - 1) / 2) * 15 : 0;
            /* O nome vai para a esquerda quando o ponto esta na metade
               direita, senao o texto sai do quadro. */
            const aDireita = cx < L * 0.55;
            return (
              <g key={p.proposta}>
                <circle cx={cx} cy={cy} r="9" fill={COR_ANDAMENTO[andamento.get(p.proposta) ?? 'nao_iniciado']} opacity="0.95">
                  <title>{`${p.proposta} — esforço ${p.esforco}, impacto ${p.impacto}`}</title>
                </circle>
                <text
                  x={aDireita ? cx + 14 : cx - 14}
                  y={cy + 4 + dy}
                  textAnchor={aDireita ? 'start' : 'end'}
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--ink)"
                >
                  {p.proposta}
                </text>
              </g>
            );
          })}
          <text x={X(MATRIZ.eixoEsforcoMax / 2)} y={A - 10} textAnchor="middle" fontSize="11" fill="var(--ink-soft)">
            Esforço →
          </text>
          <text transform={`translate(14 ${Y(MATRIZ.eixoImpactoMax / 2)}) rotate(-90)`} textAnchor="middle" fontSize="11" fill="var(--ink-soft)">
            Impacto →
          </text>
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>
        {(['concluido', 'iniciado', 'nao_iniciado'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded" style={{ background: COR_ANDAMENTO[k] }} />
            {ROTULO_ANDAMENTO[k]} ({[...andamento.values()].filter((v) => v === k).length})
          </span>
        ))}
      </div>
    </Cartao>
  );
}

/* Ritmo de entrega: BurnDown e BurnUp sobre o mesmo escopo.

   A linha "Escopo total" saiu daqui de proposito. Ela era desenhada
   como acoes.length repetido em toda semana, e as outras duas series
   nascem desse mesmo numero: o que falta e total menos entregue, e o
   entregue e total menos o que falta. Somadas, davam o total em todos
   os pontos, sempre. Ou seja, a linha nunca poderia se mover, nem
   quando o escopo realmente mudasse - que e a unica coisa que uma
   linha de escopo existe para mostrar. Pior: ela afirmava que o
   escopo de hoje valia desde maio, e uma planilha so conta o que ela
   e agora. O topo da area do BurnUp ja marca o escopo, e o numero
   exato foi para o subtitulo do cartao. */
function BurnDown({ acoes, hoje }: { acoes: Acao[]; hoje: Date }) {
  const { config, total } = useMemo(() => {
    const total = acoes.length;
    const datas = acoes.flatMap((a) => [a.inicio, a.prazoValido].filter(Boolean) as Date[]);
    if (datas.length === 0) return { config: null, total };
    const ini = new Date(Math.min(...datas.map((d) => d.getTime())));
    const fim = new Date(Math.max(...datas.map((d) => d.getTime()), hoje.getTime()));

    const semanas: Date[] = [];
    for (let t = ini.getTime(); t <= fim.getTime(); t += 7 * 86400000) semanas.push(new Date(t));
    if (semanas[semanas.length - 1] < fim) semanas.push(fim);
    /* Hoje entra como ponto proprio. Sem isso o ultimo ponto com dado
       caia na semana cheia anterior, e o grafico mostrava a posicao de
       ate seis dias atras: apareciam mais pendencias do que a operacao
       tinha de fato no dia da reuniao. */
    if (!semanas.some((s) => Math.abs(s.getTime() - hoje.getTime()) < 86400000)) {
      semanas.push(new Date(hoje.getTime()));
      semanas.sort((a, z) => a.getTime() - z.getTime());
    }

    const real = semanas.map((s) => {
      if (s > hoje) return null;
      /* Acao concluida sem data de conclusao ainda foi entregue. Para
         nao inflar o que falta, ela conta na data que estava combinada.
         Sem isso a curva termina acima do numero real de pendentes. */
      const feitas = acoes.filter((a) => {
        if (!a.concluida) return false;
        const quando = a.dataConclusao ?? a.prazoValido ?? a.fim;
        return quando != null && quando <= s;
      }).length;
      return total - feitas;
    });
    /* O ideal cai com o tempo, nao com a posicao na lista. Como hoje
       entrou fora do passo de sete dias, contar por indice inclinaria
       a reta de leve no lugar errado. */
    const vao = fim.getTime() - ini.getTime() || 1;
    const ideal = semanas.map((s) =>
      Math.round(total * (1 - (s.getTime() - ini.getTime()) / vao))
    );
    /* BurnUp: o acumulado ja entregue. O BurnDown responde "quanto
       falta" e o BurnUp "quanto ja saiu". */
    const entregue = real.map((r) => (r == null ? null : total - r));

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: semanas.map((s) => s.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
        datasets: [
          /* O ideal e a referencia de leitura do grafico inteiro, entao
             precisa se sustentar ao lado das duas areas preenchidas.
             Fino e claro demais, ele sumia contra a grade. */
          { label: 'Ideal (plano)', data: ideal, borderColor: cores.navy.suave, borderDash: [7, 5], pointRadius: 0, borderWidth: 2.5 },
          { label: 'Ainda faltam (BurnDown)', data: real, borderColor: cores.laranja.base, backgroundColor: 'rgba(250,70,22,.12)', fill: true, tension: 0.25, pointRadius: 3, spanGaps: false },
          { label: 'Já entregue (BurnUp)', data: entregue, borderColor: cores.navy.base, backgroundColor: 'rgba(0,26,114,.10)', fill: true, tension: 0.25, pointRadius: 3, spanGaps: false },
        ],
      },
      options: {
        /* O cursor pega a semana inteira, e nao o ponto exato. Com o
           padrao era preciso acertar o marcador para ver qualquer
           numero, e na pratica nao aparecia nada. */
        interaction: { mode: 'index', intersect: false },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Ações', color: 'var(--ink-soft)' } } },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12 } },
          datalabels: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y;
                if (v == null) return '';
                return `${ctx.dataset.label}: ${v} de ${total}`;
              },
              /* A frase que a reuniao quer ouvir, ja pronta. */
              afterBody: (itens) => {
                const falta = itens.find((i) => i.datasetIndex === 1)?.parsed.y;
                if (falta == null) return '';
                return `\n${total - falta} de ${total} ações concluídas · faltam ${falta}`;
              },
            },
          },
        },
      },
    };
    return { config, total };
  }, [acoes, hoje]);

  return (
    <Cartao
      titulo="Ritmo de entrega"
      descricao={`BurnDown: quanto ainda falta · BurnUp: quanto já foi entregue · escopo de ${total} ação(ões)`}
    >
      {config ? <Grafico config={config} altura={300} rotulo="Ritmo de entrega do projeto" /> : <Vazio>Sem datas suficientes.</Vazio>}
    </Cartao>
  );
}


/* Tabela consolidada por PLAN ACTION, no formato que a operacao ja
   usa para reportar: quantas atividades, em que pe estao, o periodo
   e a barra de conclusao. */
function PlanoDeAcao({ acoes }: { acoes: Acao[] }) {
  const linhas = useMemo(() => planoPorAcao(acoes), [acoes]);
  const total = useMemo(() => totalDoPlano(linhas), [linhas]);

  if (linhas.length === 0) return null;

  const barra = (pct: number) => (
    <div className="eq-status-celula">
      <div className="eq-status-track">
        <div
          className="eq-status-fill"
          style={{
            width: `${Math.max(pct === 0 ? 0 : 4, pct)}%`,
            background: pct === 100 ? cores.semantico.verde : cores.laranja.base,
          }}
        />
      </div>
      <span style={{ color: pct === 100 ? cores.semantico.verde : cores.laranja.base }}>{pct}%</span>
    </div>
  );

  return (
    <Cartao titulo="Plano de ação" descricao="uma linha por PLAN ACTION, com o andamento de cada frente">
      <Tabela>
        <thead>
          <tr>
            <Th largura={44} alinha="centro">Nº</Th>
            <Th>Plan action</Th>
            <Th alinha="centro">Atividades</Th>
            <Th alinha="centro">Em andamento</Th>
            <Th alinha="centro">Pendentes</Th>
            <Th alinha="centro">Concluídas</Th>
            <Th alinha="centro">Início</Th>
            <Th alinha="centro">Fim</Th>
            <Th alinha="centro">Reagendamento</Th>
            <Th alinha="centro" largura={150}>Status</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.proposta}>
              <Td alinha="centro">{l.numero}</Td>
              <Td style={{ fontWeight: 600 }}>
                <MiniTabela
                  largura={340}
                  conteudo={
                    <>
                      <span className="eq-dica-titulo">
                        {l.proposta} — {l.concluidas}/{l.atividades} concluídas
                      </span>
                      {acoes
                        .filter((a) => (a.proposta || 'Sem proposta') === l.proposta)
                        .map((a) => {
                          const sit = situacaoDe(a);
                          return (
                            <span key={a.numPlanAction + a.oQueFazer} className="eq-dica-item">
                              <span>{a.oQueFazer || '—'}</span>
                              <span
                                style={{
                                  color: a.atrasada
                                    ? cores.laranja.base
                                    : sit === 'concluida'
                                      ? cores.semantico.verde
                                      : 'var(--ink-soft)',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {a.atrasada ? 'Atrasada' : ROTULO_SITUACAO[sit]}
                              </span>
                            </span>
                          );
                        })}
                    </>
                  }
                >
                  <span>{l.proposta}</span>
                </MiniTabela>
              </Td>
              <Td alinha="centro" numerico>{l.atividades}</Td>
              <Td alinha="centro" numerico>{l.emAndamento || '-'}</Td>
              <Td alinha="centro" numerico>{l.pendentes || '-'}</Td>
              <Td alinha="centro" numerico>{l.concluidas || '-'}</Td>
              <Td alinha="centro" numerico>{dataBR(l.inicio)}</Td>
              <Td alinha="centro" numerico>{dataBR(l.fim)}</Td>
              <Td alinha="centro" numerico>{dataBR(l.reagendamento)}</Td>
              <Td>{barra(l.pctConcluido)}</Td>
            </tr>
          ))}
          <tr className="eq-linha-total">
            <Td alinha="centro">—</Td>
            <Td>TOTAL</Td>
            <Td alinha="centro" numerico>{total.atividades}</Td>
            <Td alinha="centro" numerico>{total.emAndamento}</Td>
            <Td alinha="centro" numerico>{total.pendentes}</Td>
            <Td alinha="centro" numerico style={{ color: cores.semantico.verde }}>{total.concluidas}</Td>
            <Td alinha="centro">—</Td>
            <Td alinha="centro">—</Td>
            <Td alinha="centro">—</Td>
            <Td>{barra(total.pctConcluido)}</Td>
          </tr>
        </tbody>
      </Tabela>
    </Cartao>
  );
}

function dataBR(d: Date | null): string {
  return d ? d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-';
}

/* Ficha da atividade no Gantt. Fica em um lugar so porque aparece em
   dois alvos da mesma linha: o nome, a esquerda, e a barra. Quem le o
   Gantt aponta para a barra, que e onde o olho ja esta. */
function FichaDaAtividade({ a }: { a: Acao }) {
  const concluida = situacaoDe(a) === 'concluida';
  return (
    <>
      <span className="eq-dica-titulo">{a.oQueFazer || a.proposta}</span>
      <LinhaDica rotulo="Plan action" valor={a.proposta} />
      <LinhaDica rotulo="Responsável" valor={a.responsavel || '—'} />
      <LinhaDica rotulo="Início" valor={dataBR(a.inicio)} />
      <LinhaDica rotulo="Término previsto" valor={dataBR(a.fim)} />
      {/* O reagendamento aparece sempre, mesmo sem valor: a linha em
          branco responde "essa atividade nao foi remarcada", que e
          diferente de a informacao nao estar na ficha. */}
      <LinhaDica
        rotulo="Reagendamento"
        valor={
          a.reagendada ? (
            <b style={{ color: cores.semantico.ambar }}>{dataBR(a.reagendamento)}</b>
          ) : (
            '—'
          )
        }
      />
      <LinhaDica
        rotulo="Prazo válido"
        valor={
          <b style={{ color: a.atrasada ? cores.laranja.base : 'var(--ink)' }}>
            {dataBR(a.prazoValido)}
          </b>
        }
      />
      <LinhaDica rotulo="Conclusão" valor={dataBR(a.dataConclusao)} />
      <LinhaDica
        rotulo="Situação"
        valor={concluida ? 'Concluída' : a.atrasada ? 'Atrasada' : a.situacao || 'Em aberto'}
      />
    </>
  );
}

function Gantt({ acoes, hoje }: { acoes: Acao[]; hoje: Date }) {
  const dados = useMemo(() => {
    const comData = acoes.filter((a) => a.inicio && a.prazoValido);
    if (comData.length === 0) return null;
    const t0 = Math.min(...comData.map((a) => a.inicio!.getTime()));
    const t1 = Math.max(...comData.map((a) => a.prazoValido!.getTime()), hoje.getTime());
    const span = t1 - t0 || 1;
    const pct = (t: number) => ((t - t0) / span) * 100;

    /* Agrupa por PLAN ACTION para o Gantt contar a mesma historia da
       tabela: cada frente com o seu avanco, e dentro dela as
       atividades. */
    const porPlano = new Map<string, Acao[]>();
    for (const a of comData) {
      const chave = String(a.proposta ?? '').trim() || 'Sem proposta';
      const lista = porPlano.get(chave);
      if (lista) lista.push(a);
      else porPlano.set(chave, [a]);
    }
    const grupos = [...porPlano.entries()].map(([proposta, lista]) => {
      const concluidas = lista.filter((a) => situacaoDe(a) === 'concluida').length;
      return {
        proposta,
        lista,
        pctConcluido: Math.round((concluidas / lista.length) * 100),
        concluidas,
      };
    });

    /* Marcas de tempo no topo, para dar para ler o prazo de cada barra
       sem precisar passar o mouse. */
    const marcas: { rotulo: string; pct: number }[] = [];
    const passo = Math.max(1, Math.ceil((t1 - t0) / 86400000 / 8));
    for (let d = new Date(t0); d.getTime() <= t1; d = new Date(d.getTime() + passo * 86400000)) {
      marcas.push({
        rotulo: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
        pct: pct(d.getTime()),
      });
    }

    return { grupos, pct, marcas, hojePct: pct(hoje.getTime()) };
  }, [acoes, hoje]);

  if (!dados) return null;

  return (
    <Cartao
      titulo="Gantt"
      descricao="cada frente com o seu avanço · barra tracejada = reagendamento · linha vertical = hoje"
    >
      {/* Regua de datas: fica fixa no topo e as linhas descem por tras
          das barras, para o prazo ser lido na vertical. */}
      <div className="eq-gantt-regua" style={{ gridTemplateColumns: '230px 1fr 52px' }}>
        <div />
        <div className="eq-gantt-regua-faixa">
          {dados.marcas.map((mk) => (
            <span key={mk.rotulo + mk.pct} style={{ left: `${mk.pct}%` }}>
              {mk.rotulo}
            </span>
          ))}
          <span className="eq-gantt-hoje-rotulo" style={{ left: `${dados.hojePct}%` }}>
            hoje
          </span>
        </div>
        <div />
      </div>

      <div className="relative">
        <div
          className="pointer-events-none absolute inset-0 grid gap-2"
          style={{ gridTemplateColumns: '230px 1fr 52px' }}
          aria-hidden="true"
        >
          <div />
          <div className="relative">
            {dados.marcas.map((mk) => (
              <div
                key={`linha-${mk.pct}`}
                className="absolute inset-y-0 w-px"
                style={{ left: `${mk.pct}%`, background: 'var(--line)' }}
              />
            ))}
            <div
              className="absolute inset-y-0"
              style={{ left: `${dados.hojePct}%`, width: 2, background: cores.laranja.base }}
            />
          </div>
          <div />
        </div>

        {dados.grupos.map((g) => (
          <div key={g.proposta}>
            {/* Cabecalho da frente, com a porcentagem do plano de acao. */}
            <div
              className="eq-gantt-grupo"
              style={{ gridTemplateColumns: '230px 1fr 52px' }}
            >
              <div className="eq-gantt-grupo-nome" title={g.proposta}>
                {g.proposta}
              </div>
              <div className="eq-gantt-grupo-track">
                <div
                  className="eq-gantt-grupo-fill"
                  style={{
                    width: `${g.pctConcluido}%`,
                    background: g.pctConcluido === 100 ? cores.semantico.verde : cores.laranja.base,
                  }}
                />
              </div>
              <div
                className="eq-gantt-pct"
                style={{ color: g.pctConcluido === 100 ? cores.semantico.verde : cores.laranja.base }}
              >
                {g.pctConcluido}%
              </div>
            </div>

            {g.lista.map((a) => {
              const inicio = dados.pct(a.inicio!.getTime());
              const fimOriginal = a.fim ? dados.pct(a.fim.getTime()) : inicio;
              const fimReal = dados.pct(a.prazoValido!.getTime());
              const concluida = situacaoDe(a) === 'concluida';
              const cor = concluida ? cores.semantico.verde : cores.laranja.base;
              return (
                <div
                  key={a.numPlanAction + a.oQueFazer}
                  className="mb-1.5 grid items-center gap-2"
                  style={{ gridTemplateColumns: '230px 1fr 52px' }}
                >
                  <MiniTabela largura={320} conteudo={<FichaDaAtividade a={a} />}>
                    <span className="block truncate pl-3 text-[11.5px]">{a.oQueFazer || a.proposta}</span>
                  </MiniTabela>
                  {/* A mesma ficha na barra: e para ela que o cursor vai
                      quando alguem quer saber de quem e a atividade e
                      ate quando ela vale. */}
                  <MiniTabela largura={320} conteudo={<FichaDaAtividade a={a} />}>
                    <span className="relative block h-4 rounded" style={{ background: 'var(--surface2)' }}>
                      <span
                        className="absolute inset-y-0 block rounded"
                        style={{
                          left: `${inicio}%`,
                          width: `${Math.max(1, fimOriginal - inicio)}%`,
                          background: cor,
                        }}
                      />
                      {a.reagendada && fimReal > fimOriginal && (
                        <span
                          className="absolute inset-y-0.5 block rounded"
                          style={{
                            left: `${fimOriginal}%`,
                            width: `${Math.max(1, fimReal - fimOriginal)}%`,
                            border: `1.5px dashed ${cores.semantico.ambar}`,
                          }}
                        />
                      )}
                    </span>
                  </MiniTabela>
                  {/* Cada atividade so pode estar feita ou nao, entao a
                      porcentagem dela e 100 ou 0. */}
                  <div
                    className="eq-gantt-pct"
                    style={{ color: concluida ? cores.semantico.verde : 'var(--ink-soft)' }}
                  >
                    {concluida ? '100%' : '0%'}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Cartao>
  );
}

export function StatusProjeto({
  acoes,
  hoje,
  busca: buscaGlobal = '',
  historico = [],
  demonstracao = false,
  componentes = [],
  divergencias = [],
  ajustes = [],
}: {
  acoes: Acao[];
  hoje: Date;
  /* Texto da busca da barra de topo, que vale para todas as telas. */
  busca?: string;
  /* Medicoes das importacoes anteriores. */
  historico?: Marco[];
  demonstracao?: boolean;
  /* Base do estoque. Nao aparece nesta tela: serve so para a saude do
     estoque entrar no boletim, junto do andamento do projeto. */
  componentes?: Componente[];
  /* Devolucoes do SAC: entram aqui como medida de resultado do plano. */
  divergencias?: DivergenciaSAC[];
  ajustes?: AjusteCaso[];
}) {
  const [responsavel, setResponsavel] = useState('');
  const [proposta, setProposta] = useState('');
  const [situacao, setSituacao] = useState('');
  const [busca, setBusca] = useState('');

  const opcoes = useMemo(
    () => ({
      responsaveis: [...new Set(acoes.map((a) => a.responsavel).filter(Boolean))].sort(),
      propostas: [...new Set(acoes.map((a) => a.proposta).filter(Boolean))].sort(),
      situacoes: [...new Set(acoes.map((a) => a.situacao).filter(Boolean))].sort(),
    }),
    [acoes]
  );

  /* A planilha as vezes repete a mesma linha. A lista unica vale para a
     pagina inteira, senao o grafico conta a mesma acao duas vezes. */
  const semRepetidas = useMemo(() => acoesUnicas(acoes), [acoes]);

  // Todos os indicadores abaixo usam esta lista: o filtro vale inclusive
  // para o score (secao 11 do brief).
  const filtradas = useMemo(() => {
    const b = `${buscaGlobal} ${busca}`.trim().toLowerCase();
    return semRepetidas.lista
      .filter((a) => !responsavel || a.responsavel === responsavel)
      .filter((a) => !proposta || a.proposta === proposta)
      .filter((a) => !situacao || a.situacao === situacao)
      .filter((a) => !b || `${a.oQueFazer} ${a.proposta} ${a.obs}`.toLowerCase().includes(b));
  }, [semRepetidas, responsavel, proposta, situacao, busca]);

  const m = useMemo(() => calcularMetricas(filtradas), [filtradas]);
  const [recorte, setRecorte] = useState<Recorte>('executivo');
  const [gerando, setGerando] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);
  /* O painel que vira imagem no boletim. */
  const painel = useRef<HTMLDivElement>(null);

  /* A variacao compara a medicao inteira, sem filtro: os marcos foram
     gravados com o plano completo, entao filtrar so um responsavel
     compararia coisas diferentes. */
  const variacao = useMemo(() => {
    const agora = marcoDe(calcularMetricas(semRepetidas.lista), 'agora', hoje, demonstracao);
    return compararComAnterior(agora, historico);
  }, [semRepetidas, hoje, historico, demonstracao]);
  /* Filtro proprio da tabela detalhada, separado do filtro do topo:
     serve para achar rapido o que esta pendente sem mexer no recorte
     que os graficos estao mostrando. */
  /* Dois recortes que nao se sobrepoem: ou a acao esta concluida, ou
     nao esta. Antes uma acao atrasada aparecia tambem em pendentes e em
     andamento, e a mesma linha era contada duas vezes. */
  const [soSituacao, setSoSituacao] = useState<'todas' | 'concluida' | 'aberta'>('todas');

  const acoesDaTabela = useMemo(
    () =>
      filtradas.filter((a) => {
        if (soSituacao === 'todas') return true;
        return soSituacao === 'concluida' ? a.concluida : !a.concluida;
      }),
    [filtradas, soSituacao]
  );


  return (
    <div className="flex flex-col" style={{ gap: 18 }} ref={painel}>
      {/* Os filtros somem na apresentacao: a selecao ja foi feita antes
          de projetar, e em reuniao eles so tiram espaco. No boletim
          tambem nao entram: quem recebe o e-mail nao filtra nada. */}
      <div className={`oculta-apresentacao ${CLASSE_FORA}`}>
      <Cartao titulo="Filtros" descricao="todos os indicadores abaixo respeitam esta seleção">
        <div className="flex flex-wrap gap-2">
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar ação…" />
          <Selecao valor={responsavel} aoMudar={setResponsavel} opcoes={opcoes.responsaveis} rotuloTodos="Todos os responsáveis" />
          <Selecao valor={proposta} aoMudar={setProposta} opcoes={opcoes.propostas} rotuloTodos="Todas as propostas" />
          <Selecao valor={situacao} aoMudar={setSituacao} opcoes={opcoes.situacoes} rotuloTodos="Todas as situações" />
          <span className="self-center text-[12px]" style={{ color: 'var(--ink-soft)' }}>
            {filtradas.length} de {acoes.length} ações
          </span>
        </div>
      </Cartao>
      </div>

      <div className="eq-linha-rosca">
        <Cartao
          titulo="Status do projeto"
          descricao="score, saúde e andamento da seleção acima"
          acoes={
            /* O botao mora aqui porque o boletim comeca justamente pelo
               score e pela saude deste cartao. Ele mesmo fica de fora da
               imagem: botao em boletim nao serve para nada. */
            <span className={CLASSE_FORA}>
              <Botao
                variante="laranja"
                aoClicar={() => setCompartilhando(true)}
                titulo="Gera a imagem do painel para enviar por e-mail"
              >
                Gerar boletim
              </Botao>
            </span>
          }
        >
          <Medidor pct={Math.round(m.pctConcluidas)} metricas={m} />
          {/* Variacao contra a medicao anterior: sem ela o score sozinho
              nao diz se o projeto melhorou ou piorou. */}
          <p className={`eq-variacao${variacao && variacao.score < 0 ? ' pior' : ''}`}>
            {variacao && variacao.score !== 0 && (
              <b>{variacao.score > 0 ? '▲' : '▼'} {Math.abs(variacao.score)} no score</b>
            )}
            {explicarVariacao(variacao)}
          </p>
        </Cartao>
        {/* No lugar do avanco por frente: o resultado na operacao.
            Quantas acoes fecharam diz que o time trabalhou; a inversao
            caindo a zero diz que a operacao melhorou, que e o ganho
            que a reuniao quer ver. */}
        <EvolucaoDivergencias divergencias={divergencias} ajustes={ajustes} hoje={hoje} />
      </div>

      <div className="grid gap-4.5 lg:grid-cols-2" style={{ gap: 18 }}>
        <GanhosDoProjeto acoes={filtradas} />
        <EntregasPorSemana acoes={filtradas} />
      </div>

      <Matriz acoes={filtradas} />

      {/* A tabela vem antes dos graficos: e por ela que a reuniao
          comeca, e o resto detalha o que ela mostra. */}
      <PlanoDeAcao acoes={filtradas} />
      <Gantt acoes={filtradas} hoje={hoje} />

      <BurnDown acoes={filtradas} hoje={hoje} />

      {/* Fecha o boletim com o resultado da operacao ao lado do
          andamento do projeto: o plano existe para destravar estoque,
          entao quem le o relatorio precisa dos dois no mesmo lugar.
          Na tela nao aparece - o Dashboard Geral ja mostra. */}
      {componentes.length > 0 && (
        <div className={CLASSE_SO_BOLETIM}>
          <SaudeDoEstoque componentes={componentes} />
        </div>
      )}

      {/* A tabela linha a linha fica fora do boletim: sao dezenas de
          linhas que ninguem le no corpo do e-mail, e o PowerPoint e o
          Excel ao lado dela ja atendem quem precisa do detalhe. */}
      <div className={CLASSE_FORA}>
      <Cartao
        titulo="Plano de ação — projeto"
        descricao={
          `${acoesDaTabela.length} de ${filtradas.length} ações` +
          (semRepetidas.repetidas > 0
            ? ` · ${semRepetidas.repetidas} linha(s) repetida(s) na planilha ficaram de fora`
            : '')
        }
        acoes={
          <>
            <Selecao
              valor={recorte}
              aoMudar={setRecorte}
              opcoes={RECORTES.map((r) => ({ valor: r.valor, rotulo: `Apresentação: ${r.rotulo}` }))}
              rotulo="Recorte da apresentação"
            />
            <Botao
              variante="laranja"
              desabilitado={gerando}
              titulo={RECORTES.find((r) => r.valor === recorte)?.descricao}
              aoClicar={async () => {
                setGerando(true);
                try {
                  await baixarApresentacao(filtradas, recorte);
                } finally {
                  setGerando(false);
                }
              }}
            >
              {gerando ? 'Gerando…' : 'Baixar PowerPoint'}
            </Botao>
            <Botao aoClicar={() => baixarPlanoProjeto(filtradas)}>Exportar Excel</Botao>
          </>
        }
      >
        <BarraFiltros>
          <Chips
            valor={soSituacao}
            aoMudar={setSoSituacao}
            opcoes={[
              { valor: 'todas', rotulo: `Todas (${filtradas.length})` },
              { valor: 'concluida', rotulo: `Concluídas (${filtradas.filter((a) => a.concluida).length})` },
              { valor: 'aberta', rotulo: `Não concluídas (${filtradas.filter((a) => !a.concluida).length})` },
            ]}
          />
        </BarraFiltros>

        {acoesDaTabela.length === 0 ? (
          <Vazio icone="🔎">Nenhuma ação para os filtros escolhidos.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>N°</Th>
                <Th>Proposta</Th>
                <Th>O que fazer</Th>
                <Th>Responsável</Th>
                <Th>Prazo</Th>
                <Th>Situação</Th>
                <Th>Ganhos</Th>
                <Th alinha="right">Esf.</Th>
                <Th alinha="right">Imp.</Th>
              </tr>
            </thead>
            <tbody>
              {acoesDaTabela.map((a) => (
                <tr key={`${a.numPlanAction}-${a.oQueFazer}-${a.responsavel}`}>
                  <Td numerico>{a.numPlanAction}</Td>
                  <Td>{a.proposta}</Td>
                  <Td>
                    <MiniTabela
                      largura={330}
                      conteudo={
                        <>
                          <span className="eq-dica-titulo">{a.oQueFazer || a.proposta}</span>
                          <LinhaDica rotulo="Por quê" valor={a.porque || '—'} />
                          <LinhaDica rotulo="Como resolver" valor={a.comoSolucionar || '—'} />
                          <LinhaDica rotulo="Início" valor={dataBR(a.inicio)} />
                          <LinhaDica rotulo="Fim previsto" valor={dataBR(a.fim)} />
                          {a.reagendada && <LinhaDica rotulo="Reagendado" valor={dataBR(a.reagendamento)} />}
                          <LinhaDica rotulo="Conclusão" valor={dataBR(a.dataConclusao)} />
                          {a.obs && <LinhaDica rotulo="Observação" valor={a.obs} />}
                        </>
                      }
                    >
                      <span>{a.oQueFazer}</span>
                    </MiniTabela>
                  </Td>
                  <Td>{a.responsavel}</Td>
                  <Td>
                    {a.prazoValido?.toLocaleDateString('pt-BR') ?? '—'}
                    {a.reagendada && (
                      <span className="ml-1.5 text-[10.5px]" style={{ color: cores.semantico.ambar }}>
                        reagendada
                      </span>
                    )}
                  </Td>
                  <Td>
                    {a.concluida ? (
                      <Selo cor={cores.semantico.verde}>Concluída</Selo>
                    ) : a.atrasada ? (
                      <Selo cor={cores.laranja.base}>Atrasada</Selo>
                    ) : (
                      <Selo cor={cores.navy.claro}>{a.situacao || 'Em aberto'}</Selo>
                    )}
                  </Td>
                  <Td>
                    {/* Ganhos que a acao entrega, na ordem fixa da lista,
                        para a leitura ser sempre a mesma linha a linha. */}
                    <div className="eq-ganhos">
                      {ganhosDaAcao(a).length === 0 ? (
                        <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>—</span>
                      ) : (
                        ganhosDaAcao(a).map((g) => (
                          <span key={g} className="eq-ganho" title={GANHOS.find((x) => x.chave === g)?.rotulo}>
                            {GANHOS.find((x) => x.chave === g)?.curto}
                          </span>
                        ))
                      )}
                    </div>
                  </Td>
                  <Td alinha="right" numerico>{a.esforco}</Td>
                  <Td alinha="right" numerico>{a.impacto}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
      </div>

      {compartilhando && (
        <CompartilharStatus
          alvo={painel.current}
          acoes={filtradas}
          metricas={m}
          hoje={hoje}
          aoFechar={() => setCompartilhando(false)}
        />
      )}
    </div>
  );
}
