/* ============================================================
   Pagina 2: Status Projeto (secao 11 do brief).
   Score decomposto, saude, alertas, BurnDown, matriz e Gantt.
   Todos os indicadores respeitam os filtros globais, inclusive
   o score: as metricas sao sempre recalculadas sobre a lista ja
   filtrada.
   ============================================================ */
import { useMemo, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import type { Acao, MetricasProjeto } from '../domain/tipos';
import {
  calcularMetricas, montarMatriz, planoPorAcao, totalDoPlano, situacaoDe,
  resumirGanhos, ganhosDaAcao, GANHOS,
} from '../domain/projeto';
import { cores } from '../config/tokens';
import { Grafico } from '../components/charts/Grafico';
import { BarraFiltros, Botao, Busca, Cartao, Chips, Selecao, Selo, Tabela, Td, Th, Vazio } from '../components/ui';
import { baixarPlanoProjeto } from '../export/exportExcel';
import { baixarApresentacao, RECORTES, type Recorte } from '../export/exportPptx';
import { MATRIZ } from '../config/regras';


const ROTULO_QUADRANTE = {
  ganhos_rapidos: 'Ganhos rápidos',
  estrategicos: 'Projetos estratégicos',
  incrementais: 'Melhorias incrementais',
  baixa_prioridade: 'Baixa prioridade',
} as const;

/* Medidor de conclusao do plano. Mostra o quanto ja foi entregue,
   sem rotulo de julgamento: o andamento fala por si. */
function Medidor({ pct, metricas }: { pct: number; metricas: MetricasProjeto }) {
  const cor = pct === 100 ? cores.semantico.verde : cores.laranja.base;
  const r = 72;
  const cx = 90;
  const cy = 95;
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
      <svg width="180" height="148" viewBox="0 0 180 148" role="img" aria-label={`${pct}% do plano concluído`}>
        <path d={arco(1)} fill="none" stroke="var(--line)" strokeWidth="22" strokeLinecap="round" />
        <path d={arco(pct / 100)} fill="none" stroke={cor} strokeWidth="22" strokeLinecap="round" />
        <text x="90" y="92" textAnchor="middle" fontFamily="Poppins, sans-serif" fontSize="42" fontWeight="600" fill="var(--ink)">
          {pct}%
        </text>
        <text x="90" y="118" textAnchor="middle" fontSize="12" fill="var(--ink-soft)">
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

function Legenda() {
  return (
    <div className="eq-legenda">
      {(['concluida', 'andamento', 'pendente'] as const).map((k) => (
        <span key={k}>
          <i style={{ background: ESCALA[k] }} />
          {ROTULO_SITUACAO[k]}
        </span>
      ))}
    </div>
  );
}

/* Avanco de cada frente, em barra empilhada. Responde "quem esta
   andando e quem parou" sem precisar ler a tabela inteira. */
function AvancoPorFrente({ acoes }: { acoes: Acao[] }) {
  const linhas = useMemo(() => planoPorAcao(acoes), [acoes]);
  if (linhas.length === 0) return null;

  return (
    <Cartao titulo="Avanço por frente" descricao="cada barra é um plan action, na ordem do plano">
      <div className="eq-frentes">
        {linhas.map((l) => (
          <div key={l.proposta} className="eq-frente">
            <div className="eq-frente-nome" title={l.proposta}>
              {l.proposta}
            </div>
            <div className="eq-frente-barra">
              {(['concluida', 'andamento', 'pendente'] as const).map((k) => {
                const qtd = k === 'concluida' ? l.concluidas : k === 'andamento' ? l.emAndamento : l.pendentes;
                if (qtd === 0) return null;
                return (
                  <span
                    key={k}
                    style={{ width: `${(qtd / l.atividades) * 100}%`, background: ESCALA[k] }}
                    title={`${ROTULO_SITUACAO[k]}: ${qtd} de ${l.atividades}`}
                  />
                );
              })}
            </div>
            <div className="eq-frente-pct">{l.pctConcluido}%</div>
          </div>
        ))}
      </div>
      <Legenda />
    </Cartao>
  );
}

/* Entregas por semana: mostra se o time esta entregando em ritmo
   constante ou em picos. */
function EntregasPorSemana({ acoes }: { acoes: Acao[] }) {
  const semanas = useMemo(() => {
    const feitas = acoes
      .filter((a) => a.concluida)
      .map((a) => a.dataConclusao ?? a.prazoValido ?? a.fim)
      .filter((d): d is Date => d != null);
    if (feitas.length === 0) return [];

    const t0 = Math.min(...feitas.map((d) => d.getTime()));
    const t1 = Math.max(...feitas.map((d) => d.getTime()));
    const baldes: { rotulo: string; qtd: number }[] = [];
    for (let t = t0; t <= t1 + 1; t += 7 * 86400000) {
      const fim = t + 7 * 86400000;
      baldes.push({
        rotulo: new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
        qtd: feitas.filter((d) => d.getTime() >= t && d.getTime() < fim).length,
      });
    }
    return baldes;
  }, [acoes]);

  if (semanas.length === 0) return null;
  const maximo = Math.max(...semanas.map((s) => s.qtd), 1);
  const media = semanas.reduce((acc, s) => acc + s.qtd, 0) / semanas.length;

  return (
    <Cartao
      titulo="Entregas por semana"
      descricao={`média de ${media.toFixed(1)} ações concluídas por semana`}
    >
      <div className="eq-semanas">
        {semanas.map((s) => (
          <div key={s.rotulo} className="eq-semana">
            <span className="eq-semana-valor">{s.qtd || ''}</span>
            <span
              className="eq-semana-barra"
              style={{
                height: `${(s.qtd / maximo) * 100}%`,
                background: s.qtd === 0 ? 'var(--line)' : ESCALA.concluida,
              }}
              title={`Semana de ${s.rotulo}: ${s.qtd} concluída(s)`}
            />
            <span className="eq-semana-rotulo">{s.rotulo}</span>
          </div>
        ))}
      </div>
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
                <circle cx={cx} cy={cy} r="9" fill={ESCALA_QUADRANTE[p.quadrante]} opacity="0.95">
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
        {(Object.keys(ROTULO_QUADRANTE) as (keyof typeof ROTULO_QUADRANTE)[]).map((q) => (
          <span key={q} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded" style={{ background: ESCALA_QUADRANTE[q] }} />
            {ROTULO_QUADRANTE[q]} ({pontos.filter((p) => p.quadrante === q).length})
          </span>
        ))}
      </div>
    </Cartao>
  );
}

function BurnDown({ acoes, hoje }: { acoes: Acao[]; hoje: Date }) {
  const config: ChartConfiguration | null = useMemo(() => {
    const datas = acoes.flatMap((a) => [a.inicio, a.prazoValido].filter(Boolean) as Date[]);
    if (datas.length === 0) return null;
    const ini = new Date(Math.min(...datas.map((d) => d.getTime())));
    const fim = new Date(Math.max(...datas.map((d) => d.getTime()), hoje.getTime()));

    const semanas: Date[] = [];
    for (let t = ini.getTime(); t <= fim.getTime(); t += 7 * 86400000) semanas.push(new Date(t));
    if (semanas[semanas.length - 1] < fim) semanas.push(fim);

    const total = acoes.length;
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
    const ideal = semanas.map((_, i) => Math.round(total * (1 - i / (semanas.length - 1 || 1))));

    return {
      type: 'line',
      data: {
        labels: semanas.map((s) => s.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
        datasets: [
          { label: 'Ideal', data: ideal, borderColor: cores.semantico.cinza, borderDash: [5, 5], pointRadius: 0, borderWidth: 1.5 },
          { label: 'Real', data: real, borderColor: cores.laranja.base, backgroundColor: 'rgba(250,70,22,.12)', fill: true, tension: 0.25, pointRadius: 3, spanGaps: false },
        ],
      },
      options: {
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Ações pendentes', color: 'var(--ink-soft)' } } },
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12 } }, datalabels: { display: false } },
      },
    };
  }, [acoes, hoje]);

  return (
    <Cartao titulo="Ritmo de entrega" descricao="quantas ações ainda faltam, comparado ao ritmo necessário para terminar no prazo">
      {config ? <Grafico config={config} altura={260} rotulo="Ritmo de entrega do projeto" /> : <Vazio>Sem datas suficientes.</Vazio>}
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
              <Td style={{ fontWeight: 600 }}>{l.proposta}</Td>
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
                  <div className="truncate pl-3 text-[11.5px]" title={a.oQueFazer}>
                    {a.oQueFazer || a.proposta}
                  </div>
                  <div className="relative h-4 rounded" style={{ background: 'var(--surface2)' }}>
                    <div
                      className="absolute inset-y-0 rounded"
                      style={{
                        left: `${inicio}%`,
                        width: `${Math.max(1, fimOriginal - inicio)}%`,
                        background: cor,
                      }}
                    />
                    {a.reagendada && fimReal > fimOriginal && (
                      <div
                        className="absolute inset-y-0.5 rounded"
                        style={{
                          left: `${fimOriginal}%`,
                          width: `${Math.max(1, fimReal - fimOriginal)}%`,
                          border: `1.5px dashed ${cores.semantico.ambar}`,
                        }}
                      />
                    )}
                  </div>
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
}: {
  acoes: Acao[];
  hoje: Date;
  /* Texto da busca da barra de topo, que vale para todas as telas. */
  busca?: string;
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

  // Todos os indicadores abaixo usam esta lista: o filtro vale inclusive
  // para o score (secao 11 do brief).
  const filtradas = useMemo(() => {
    const b = `${buscaGlobal} ${busca}`.trim().toLowerCase();
    return acoes
      .filter((a) => !responsavel || a.responsavel === responsavel)
      .filter((a) => !proposta || a.proposta === proposta)
      .filter((a) => !situacao || a.situacao === situacao)
      .filter((a) => !b || `${a.oQueFazer} ${a.proposta} ${a.obs}`.toLowerCase().includes(b));
  }, [acoes, responsavel, proposta, situacao, busca]);

  const m = useMemo(() => calcularMetricas(filtradas), [filtradas]);
  const [recorte, setRecorte] = useState<Recorte>('executivo');
  const [gerando, setGerando] = useState(false);
  /* Filtro proprio da tabela detalhada, separado do filtro do topo:
     serve para achar rapido o que esta pendente sem mexer no recorte
     que os graficos estao mostrando. */
  const [soSituacao, setSoSituacao] = useState<'todas' | 'pendente' | 'andamento' | 'concluida' | 'atrasada'>('todas');

  const acoesDaTabela = useMemo(
    () =>
      filtradas.filter((a) => {
        if (soSituacao === 'todas') return true;
        if (soSituacao === 'atrasada') return a.atrasada;
        return situacaoDe(a) === soSituacao;
      }),
    [filtradas, soSituacao]
  );


  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      {/* Os filtros somem na apresentacao: a selecao ja foi feita antes
          de projetar, e em reuniao eles so tiram espaco. */}
      <div className="oculta-apresentacao">
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
        <Cartao>
          <Medidor pct={Math.round(m.pctConcluidas)} metricas={m} />
        </Cartao>
        <AvancoPorFrente acoes={filtradas} />
      </div>

      <div className="grid gap-4.5 lg:grid-cols-2" style={{ gap: 18 }}>
        <EntregasPorSemana acoes={filtradas} />
        <GanhosDoProjeto acoes={filtradas} />
      </div>

      <Matriz acoes={filtradas} />

      {/* A tabela vem antes dos graficos: e por ela que a reuniao
          comeca, e o resto detalha o que ela mostra. */}
      <PlanoDeAcao acoes={filtradas} />
      <Gantt acoes={filtradas} hoje={hoje} />

      <BurnDown acoes={filtradas} hoje={hoje} />

      <Cartao
        titulo="Plano de ação — projeto"
        descricao={`${acoesDaTabela.length} de ${filtradas.length} ações`}
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
              { valor: 'pendente', rotulo: `Pendentes (${filtradas.filter((a) => situacaoDe(a) === 'pendente').length})` },
              { valor: 'andamento', rotulo: `Em andamento (${filtradas.filter((a) => situacaoDe(a) === 'andamento').length})` },
              { valor: 'concluida', rotulo: `Concluídas (${filtradas.filter((a) => situacaoDe(a) === 'concluida').length})` },
              { valor: 'atrasada', rotulo: `Atrasadas (${filtradas.filter((a) => a.atrasada).length})` },
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
                <tr key={a.numPlanAction + a.oQueFazer}>
                  <Td numerico>{a.numPlanAction}</Td>
                  <Td>{a.proposta}</Td>
                  <Td>{a.oQueFazer}</Td>
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
  );
}
