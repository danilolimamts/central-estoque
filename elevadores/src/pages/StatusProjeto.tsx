/* ============================================================
   Pagina 2: Status Projeto (secao 11 do brief).
   Score decomposto, saude, alertas, BurnDown, matriz e Gantt.
   Todos os indicadores respeitam os filtros globais, inclusive
   o score: as metricas sao sempre recalculadas sobre a lista ja
   filtrada.
   ============================================================ */
import { useMemo, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import type { Acao, Saude, MetricasProjeto } from '../domain/tipos';
import {
  calcularMetricas, montarMatriz, proximosPassos, explicarSaude, pilarMaisFraco,
} from '../domain/projeto';
import { MATRIZ, IMPACTO_CRITICO, ESFORCO_ALTO } from '../config/regras';
import { cores, coresQuadrante, coresSaude } from '../config/tokens';
import { Grafico } from '../components/charts/Grafico';
import { Botao, Busca, Cartao, Kpi, Selecao, Selo, Tabela, Td, Th, Vazio } from '../components/ui';
import { baixarPlanoProjeto } from '../export/exportExcel';
import { baixarApresentacao, RECORTES, type Recorte } from '../export/exportPptx';

const ROTULO_SAUDE: Record<Saude, string> = {
  saudavel: 'Saudável',
  atencao: 'Atenção',
  critico: 'Crítico',
};

const ROTULO_QUADRANTE = {
  ganhos_rapidos: 'Ganhos rápidos',
  estrategicos: 'Projetos estratégicos',
  incrementais: 'Melhorias incrementais',
  baixa_prioridade: 'Baixa prioridade',
} as const;

/* O que cada pilar mede, dito com os numeros do proprio plano, para
   nao ser preciso decorar a formula. */
const EXPLICACAO_PILAR: Record<string, (m: MetricasProjeto) => string> = {
  entrega: (m) => `${m.concluidas} de ${m.total} concluídas`,
  prazo: (m) => `${m.atrasadas} em atraso`,
  estabilidade: (m) => `${m.reagendadas} reagendadas`,
  retorno: (m) => `impacto ${m.mediaImpacto.toFixed(1)} · esforço ${m.mediaEsforco.toFixed(1)}`,
};

function Medidor({ score, saude }: { score: number; saude: Saude }) {
  const cor = coresSaude[saude];
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
      <svg width="180" height="148" viewBox="0 0 180 148" role="img" aria-label={`Score ${score} de 100`}>
        <path d={arco(1)} fill="none" stroke="var(--line)" strokeWidth="14" strokeLinecap="round" />
        <path d={arco(score / 100)} fill="none" stroke={cor} strokeWidth="14" strokeLinecap="round" />
        <text x="90" y="92" textAnchor="middle" fontFamily="Poppins, sans-serif" fontSize="42" fontWeight="600" fill="var(--ink)">
          {score}
        </text>
        <text x="90" y="114" textAnchor="middle" fontSize="12" fill="var(--ink-soft)">
          de 100
        </text>
      </svg>
      <Selo cor={cor}>● Saúde: {ROTULO_SAUDE[saude]}</Selo>
    </div>
  );
}

function Matriz({ acoes }: { acoes: Acao[] }) {
  const pontos = useMemo(() => montarMatriz(acoes), [acoes]);
  const L = 400;
  const A = 320;
  const pad = 44;
  const X = (v: number) => pad + (v / MATRIZ.eixoEsforcoMax) * (L - pad - 18);
  const Y = (v: number) => A - pad - (v / MATRIZ.eixoImpactoMax) * (A - pad - 18);

  return (
    <Cartao titulo="Matriz Impacto × Esforço" descricao={`${pontos.length} propostas`}>
      <div className="flex justify-center">
        <svg width="100%" viewBox={`0 0 ${L} ${A}`} style={{ maxWidth: L }} role="img" aria-label="Matriz de impacto por esforço">
          <rect x={X(0)} y={Y(MATRIZ.eixoImpactoMax)} width={X(MATRIZ.corteEsforco) - X(0)} height={Y(MATRIZ.corteImpacto) - Y(MATRIZ.eixoImpactoMax)} fill={coresQuadrante.ganhos_rapidos} opacity="0.08" />
          <rect x={X(MATRIZ.corteEsforco)} y={Y(MATRIZ.eixoImpactoMax)} width={X(MATRIZ.eixoEsforcoMax) - X(MATRIZ.corteEsforco)} height={Y(MATRIZ.corteImpacto) - Y(MATRIZ.eixoImpactoMax)} fill={coresQuadrante.estrategicos} opacity="0.08" />
          <rect x={X(0)} y={Y(MATRIZ.corteImpacto)} width={X(MATRIZ.corteEsforco) - X(0)} height={Y(0) - Y(MATRIZ.corteImpacto)} fill={coresQuadrante.incrementais} opacity="0.08" />
          <rect x={X(MATRIZ.corteEsforco)} y={Y(MATRIZ.corteImpacto)} width={X(MATRIZ.eixoEsforcoMax) - X(MATRIZ.corteEsforco)} height={Y(0) - Y(MATRIZ.corteImpacto)} fill={coresQuadrante.baixa_prioridade} opacity="0.08" />

          <line x1={X(MATRIZ.corteEsforco)} y1={Y(0)} x2={X(MATRIZ.corteEsforco)} y2={Y(MATRIZ.eixoImpactoMax)} stroke="var(--line)" strokeDasharray="4 4" />
          <line x1={X(0)} y1={Y(MATRIZ.corteImpacto)} x2={X(MATRIZ.eixoEsforcoMax)} y2={Y(MATRIZ.corteImpacto)} stroke="var(--line)" strokeDasharray="4 4" />
          <line x1={X(0)} y1={Y(0)} x2={X(MATRIZ.eixoEsforcoMax)} y2={Y(0)} stroke="var(--ink-soft)" />
          <line x1={X(0)} y1={Y(0)} x2={X(0)} y2={Y(MATRIZ.eixoImpactoMax)} stroke="var(--ink-soft)" />

          {MATRIZ.escalaEsforco.map((e) => (
            <text key={e} x={X(e)} y={Y(0) + 15} textAnchor="middle" fontSize="10" fill="var(--ink-soft)">
              {e}
            </text>
          ))}
          {pontos.map((p) => (
            <circle key={p.proposta} cx={X(p.esforco)} cy={Y(p.impacto)} r="8" fill={coresQuadrante[p.quadrante]} opacity="0.9">
              <title>{`${p.proposta} — esforço ${p.esforco}, impacto ${p.impacto} (${p.acoes} ações)`}</title>
            </circle>
          ))}
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
            <i className="inline-block h-3 w-3 rounded" style={{ background: coresQuadrante[q] }} />
            {ROTULO_QUADRANTE[q]} ({pontos.filter((p) => p.quadrante === q).length})
          </span>
        ))}
      </div>
    </Cartao>
  );
}

function Alertas({ acoes }: { acoes: Acao[] }) {
  const itens = useMemo(() => {
    const porResponsavel = new Map<string, number>();
    for (const a of acoes) {
      if (!a.concluida && a.responsavel) porResponsavel.set(a.responsavel, (porResponsavel.get(a.responsavel) ?? 0) + 1);
    }
    const sobrecarga = [...porResponsavel.entries()].sort((x, y) => y[1] - x[1])[0];
    const criticas = acoes.filter((a) => a.impacto >= IMPACTO_CRITICO && !a.concluida).length;
    const altoEsforco = acoes.filter((a) => a.esforco >= ESFORCO_ALTO && !a.concluida).length;
    const atrasadas = acoes.filter((a) => a.atrasada).length;
    const reagendadas = acoes.filter((a) => a.reagendada).length;
    const semData = acoes.filter((a) => a.concluidaSemData).length;

    const lista: { cor: string; icone: string; texto: string }[] = [];
    if (atrasadas > 0) lista.push({ cor: cores.laranja.base, icone: '!', texto: `<b>${atrasadas} ação(ões) atrasada(s)</b> — prazo vencido sem conclusão` });
    if (semData > 0) lista.push({ cor: cores.laranja.escuro, icone: '⚠', texto: `<b>${semData} concluída(s) sem data</b> — falta registrar quando terminaram` });
    if (reagendadas > 0) lista.push({ cor: cores.semantico.ambar, icone: '↻', texto: `<b>${reagendadas} reagendada(s)</b> — de ${acoes.length} ações` });
    if (criticas > 0) lista.push({ cor: cores.navy.base, icone: '◆', texto: `<b>${criticas} ação(ões) crítica(s)</b> — impacto ${IMPACTO_CRITICO} ainda em aberto` });
    if (altoEsforco > 0) lista.push({ cor: cores.navy.claro, icone: '▲', texto: `<b>${altoEsforco} de alto esforço</b> — esforço ≥ ${ESFORCO_ALTO} em aberto` });
    if (sobrecarga && sobrecarga[1] >= 5) lista.push({ cor: cores.laranja.suave, icone: '●', texto: `<b>Sobrecarga</b> — ${sobrecarga[0]} com ${sobrecarga[1]} ações abertas` });
    return lista;
  }, [acoes]);

  return (
    <Cartao titulo="Alertas automáticos" descricao="o que precisa de atenção">
      {itens.length === 0 ? (
        <Vazio>Nenhum alerta para os filtros escolhidos.</Vazio>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {itens.map((a) => (
            <div key={a.texto} className="flex items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
              <span className="grid h-6.5 w-6.5 flex-none place-items-center rounded-lg text-sm text-white" style={{ background: a.cor, width: 26, height: 26 }}>
                {a.icone}
              </span>
              <span className="text-[12.5px]" dangerouslySetInnerHTML={{ __html: a.texto }} />
            </div>
          ))}
        </div>
      )}
    </Cartao>
  );
}

/* BurnDown: pendentes ao longo do tempo, comparando o ritmo real com
   a linha ideal. Acoes concluidas sem data ficam de fora da curva real
   (por isso o alerta especifico). */
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
      const feitas = acoes.filter((a) => a.dataConclusao && a.dataConclusao <= s).length;
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

function Gantt({ acoes, hoje }: { acoes: Acao[]; hoje: Date }) {
  const dados = useMemo(() => {
    const comData = acoes.filter((a) => a.inicio && a.prazoValido);
    if (comData.length === 0) return null;
    const t0 = Math.min(...comData.map((a) => a.inicio!.getTime()));
    const t1 = Math.max(...comData.map((a) => a.prazoValido!.getTime()), hoje.getTime());
    const span = t1 - t0 || 1;
    const pct = (t: number) => ((t - t0) / span) * 100;
    return { linhas: comData.slice(0, 20), pct, hojePct: pct(hoje.getTime()) };
  }, [acoes, hoje]);

  if (!dados) return null;

  return (
    <Cartao titulo="Gantt" descricao="barra tracejada = reagendamento · linha vertical = hoje">
      {/* A linha de hoje mora numa camada com o mesmo grid das barras, para
          ficar alinhada a coluna do tempo em qualquer largura de tela. */}
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-0 grid gap-2"
          style={{ gridTemplateColumns: '200px 1fr' }}
          aria-hidden="true"
        >
          <div />
          <div className="relative">
            <div className="absolute inset-y-0 w-px" style={{ left: `${dados.hojePct}%`, background: cores.laranja.base }} />
          </div>
        </div>
        {dados.linhas.map((a) => {
          const ini = dados.pct(a.inicio!.getTime());
          const fimOriginal = a.fim ? dados.pct(a.fim.getTime()) : ini;
          const fimReal = dados.pct(a.prazoValido!.getTime());
          const cor = a.concluida ? cores.semantico.verde : a.atrasada ? cores.laranja.base : cores.navy.claro;
          return (
            <div key={a.numPlanAction + a.oQueFazer} className="mb-1.5 grid items-center gap-2" style={{ gridTemplateColumns: '200px 1fr' }}>
              <div className="truncate text-[11.5px]" title={a.oQueFazer}>
                {a.oQueFazer || a.proposta}
              </div>
              <div className="relative h-4 rounded" style={{ background: 'var(--surface-2)' }}>
                <div className="absolute inset-y-0 rounded" style={{ left: `${ini}%`, width: `${Math.max(1, fimOriginal - ini)}%`, background: cor }} />
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
            </div>
          );
        })}
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

  const passos = useMemo(() => proximosPassos(filtradas, m, montarMatriz(filtradas)), [filtradas, m]);
  const fraco = useMemo(() => pilarMaisFraco(m), [m]);

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      {/* Leitura em texto antes dos numeros: quem abre a tela pela
          primeira vez entende a situacao sem precisar interpretar
          grafico nenhum. */}
      <section className="panel eq-leitura">
        <div className="eq-leitura-topo">
          <span className="eq-leitura-selo" style={{ background: coresSaude[m.saude] }}>
            {ROTULO_SAUDE[m.saude]}
          </span>
          <h2>{explicarSaude(m)}</h2>
        </div>
        <div className="eq-leitura-passos">
          <div className="eq-leitura-titulo">Por onde começar</div>
          {passos.slice(0, 3).map((passo, i) => (
            <div key={passo.texto} className="eq-passo">
              <span className="eq-passo-n">{i + 1}</span>
              <span>{passo.texto}</span>
            </div>
          ))}
        </div>
      </section>

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

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi rotulo="Score do projeto" valor={m.score} sufixo="/100" dica={`quanto maior, melhor`} cor={coresSaude[m.saude]} />
        <Kpi rotulo="Concluídas" valor={m.concluidas} sufixo={`/ ${m.total}`} dica={`${m.pctConcluidas.toFixed(0)}% do plano`} cor={cores.semantico.verde} />
        <Kpi rotulo="Atrasadas" valor={m.atrasadas} dica="passaram da data combinada" cor={cores.laranja.base} />
        <Kpi rotulo="Concluídas sem data" valor={m.concluidasSemData} dica="falta registrar quando terminaram" cor={cores.semantico.ambar} />
      </div>

      <div className="grid gap-4.5 lg:grid-cols-[300px_1fr]" style={{ gap: 18 }}>
        <Cartao>
          <Medidor score={m.score} saude={m.saude} />
        </Cartao>
        <Cartao
          titulo="De onde vem o score"
          descricao={
            fraco
              ? `O que mais puxa para baixo é ${fraco.pilar.rotulo.toLowerCase()}: deixou de somar ${fraco.perdido.toFixed(1)} pontos.`
              : 'para defender em reunião'
          }
        >
          {m.pilares.map((p) => (
            <div key={p.chave} className="mb-3 grid items-center gap-2.5" style={{ gridTemplateColumns: '110px 1fr 96px' }}>
              <div>
                <div className="text-[12.5px]" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {p.rotulo}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                  {EXPLICACAO_PILAR[p.chave](m)}
                </div>
              </div>
              <div className="h-3.5 overflow-hidden rounded" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded" style={{ width: `${Math.max(0, Math.min(100, p.valor))}%`, background: cores.navy.base }} />
              </div>
              <div className="text-right text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                {p.valor.toFixed(0)} × {p.peso.toFixed(2)} ={' '}
                <b className="num" style={{ color: 'var(--ink)' }}>
                  {p.contribuicao.toFixed(1)}
                </b>
              </div>
            </div>
          ))}
          <div className="mt-1 text-right text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            Soma ={' '}
            <b className="num text-base" style={{ color: 'var(--ink)' }}>
              {m.score}
            </b>
          </div>
        </Cartao>
      </div>

      <div className="grid gap-4.5 lg:grid-cols-2" style={{ gap: 18 }}>
        <Matriz acoes={filtradas} />
        <Alertas acoes={filtradas} />
      </div>

      <BurnDown acoes={filtradas} hoje={hoje} />
      <Gantt acoes={filtradas} hoje={hoje} />

      <Cartao
        titulo="Plano de ação — projeto"
        descricao={`${filtradas.length} ações`}
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
        {filtradas.length === 0 ? (
          <Vazio>Nenhuma ação para os filtros escolhidos.</Vazio>
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
                <Th alinha="right">Esf.</Th>
                <Th alinha="right">Imp.</Th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((a) => (
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
