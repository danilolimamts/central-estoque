/* ============================================================
   Evolucao das divergencias: o resultado do projeto.

   Divergencia, e nao inversao: item trocado e so uma das causas, e
   peca faltando conta igual. Chamar o conjunto pelo nome de uma parte
   dele fazia o cartao parecer medir menos do que mede.

   O painel de status media o plano - quantas acoes fecharam. Isso diz
   se o time trabalhou, nao se a operacao melhorou. Este cartao mede o
   que o plano existe para mudar: elevador voltando por erro do CD, e
   quanto isso custou.

   Tres leituras, da mais rapida para a mais detalhada: a manchete do
   mes fechado, os numeros do ano e a curva; e embaixo o mes a mes,
   que responde "quanto ganhamos" em vez de so "como esta indo".

   Mes que ainda nao aconteceu fica fora de tudo. Contar dezembro como
   mes zerado em agosto seria inventar resultado.
   ============================================================ */
import { useMemo, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import {
  anosDisponiveis,
  comparativoMensal,
  evolucaoDeDivergencias,
  formatarReal,
  ganhoDoMes,
  divergenciasDoCD,
} from '../domain/divergencias';
import type { ComparativoMes, DivergenciaSAC } from '../domain/divergencias';
import { casosConsiderados, forasDaPlanilha, mapaDeAjustes } from '../domain/ajustes';
import type { AjusteCaso } from '../domain/ajustes';
import { cores } from '../config/tokens';
import { Grafico } from './charts/Grafico';
import { Cartao, Selecao, Tabela, Td, Th, Vazio } from './ui';

const COR_VALOR = cores.laranja.base;
const COR_CASOS = cores.navy.base;

export function EvolucaoDivergencias({
  divergencias,
  ajustes = [],
  hoje = new Date(),
}: {
  divergencias: DivergenciaSAC[];
  ajustes?: AjusteCaso[];
  hoje?: Date;
}) {
  const mapa = useMemo(() => mapaDeAjustes(ajustes), [ajustes]);
  const casos = useMemo(() => {
    const detectados = divergenciasDoCD(divergencias);
    return casosConsiderados(detectados, mapa, forasDaPlanilha(detectados));
  }, [divergencias, mapa]);

  const anos = useMemo(() => anosDisponiveis(casos), [casos]);
  const [ano, setAno] = useState<string>('');
  const anoAtivo = Number(ano) || anos[0] || hoje.getUTCFullYear();
  const e = useMemo(
    () => evolucaoDeDivergencias(casos, anoAtivo, hoje),
    [casos, anoAtivo, hoje]
  );

  /* So os meses ja decorridos entram na linha. O resto do ano fica
     como nulo: linha que cai a zero em setembro porque setembro nao
     chegou conta uma historia que nao aconteceu. */
  const ateAqui = <T,>(v: T, mes: number): T | null => (mes <= e.ateOMes ? v : null);

  const config: ChartConfiguration = useMemo(
    () => ({
      type: 'line',
      data: {
        labels: e.meses.map((m) => m.rotulo),
        datasets: [
          {
            label: 'Custo das divergências',
            data: e.meses.map((m) => ateAqui(m.total.valor, m.mes)),
            borderColor: COR_VALOR,
            backgroundColor: 'rgba(250,70,22,.14)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: COR_VALOR,
            spanGaps: false,
            yAxisID: 'y',
          },
          {
            label: 'Elevadores devolvidos',
            data: e.meses.map((m) => ateAqui(m.total.quantidade, m.mes)),
            borderColor: COR_CASOS,
            borderDash: [6, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            spanGaps: false,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        /* Folga em volta: o primeiro rotulo encostava na borda
           esquerda e os de subida ingreme na propria linha. */
        layout: { padding: { top: 28, left: 14, right: 14 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12 } },
          /* O valor fica escrito em cima do ponto, inclusive o R$ 0:
             o painel e projetado em reuniao, onde ninguem passa o
             cursor. */
          datalabels: {
            display: (c) => c.datasetIndex === 0 && c.dataset.data[c.dataIndex] != null,
            /* No fundo de um vale a linha passa por cima do rotulo se
               ele ficar em cima. Ponto mais baixo que os dois vizinhos
               leva o rotulo para baixo; o resto continua em cima. */
            align: (c) => {
              const dados = c.dataset.data as (number | null)[];
              const v = dados[c.dataIndex];
              const antes = dados[c.dataIndex - 1];
              const depois = dados[c.dataIndex + 1];
              if (typeof v !== 'number') return 'top';
              /* Zero fica em cima mesmo sendo o ponto mais baixo: e o
                 numero que o cartao existe para mostrar, e embaixo ele
                 cairia sobre o eixo. */
              if (v === 0) return 'top';
              const vizinhos = [antes, depois].filter((n): n is number => typeof n === 'number');
              /* Ponta da linha tem um vizinho so; ainda assim vale a
                 mesma regra, senao o primeiro mes fica com o rotulo
                 atravessado pela subida. */
              return vizinhos.length > 0 && vizinhos.every((n) => n > v) ? 'bottom' : 'top';
            },
            offset: 8,
            clamp: true,
            font: { weight: 700, size: 11 },
            color: (c) => ((c.dataset.data[c.dataIndex] as number) === 0 ? cores.semantico.verde : COR_VALOR),
            formatter: (v: number) => (v === 0 ? 'R$ 0' : formatarReal(v)),
          },
          tooltip: {
            callbacks: {
              afterBody: (itens) => {
                const m = e.meses[itens[0]?.dataIndex ?? 0];
                if (!m) return '';
                if (m.total.quantidade === 0) return '\nMês fechado sem nenhuma divergência.';
                return `\nCD: ${m.cd.quantidade} · Lojas: ${m.lojas.quantidade}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'R$ devolvido' },
            ticks: { callback: (v) => formatarReal(Number(v)) },
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { precision: 0 },
            title: { display: true, text: 'Elevadores' },
          },
          x: { grid: { display: false } },
        },
      },
    }),
    [e]
  );

  if (casos.length === 0) {
    return (
      <Cartao titulo="Evolução das divergências" descricao="o resultado do projeto na operação">
        <Vazio icone="📉">
          Sem divergência do CD na base importada. A evolução aparece assim que a
          aba <b>Divergencias SAC</b> tiver casos.
        </Vazio>
      </Cartao>
    );
  }

  const comparativo = comparativoMensal(e);
  /* O ultimo mes fechado: e dele que sai a manchete. O mes corrente
     esta pela metade e compara-lo com um mes inteiro pintaria uma
     queda que ainda nao aconteceu. */
  const fechado = ganhoDoMes(comparativo);

  /* A queda contra o pico do ano: e a frase que a reuniao repete. */
  const ultimo = e.ateOMes >= 0 ? e.meses[e.ateOMes] : null;
  const queda =
    e.pico && e.pico.total.quantidade > 0 && ultimo
      ? Math.round(((e.pico.total.quantidade - ultimo.total.quantidade) / e.pico.total.quantidade) * 100)
      : null;

  return (
    <Cartao
      titulo="Evolução das divergências"
      descricao="o que o projeto mudou na operação · mês a mês, em casos e em reais"
      acoes={
        anos.length > 1 ? (
          <Selecao valor={ano} aoMudar={setAno} opcoes={anos.map(String)} rotuloTodos={String(anoAtivo)} />
        ) : undefined
      }
    >
      {/* A manchete do cartao: uma frase, o mes fechado, para quem
          abre o e-mail no celular e nao vai ler o grafico. */}
      {fechado && fechado.deltaValor != null && (
        <div className={`eq-evol-manchete${fechado.deltaValor <= 0 ? ' ganho' : ' piora'}`}>
          <b>{fechado.rotulo.toUpperCase()}</b>
          <strong>{pctDaVariacao(fechado)}</strong>
          <span>
            {fechado.casos} divergência(s) · {formatarReal(fechado.valor)}
            {fechado.referencia && fechado.zerado
              ? ` · último mês com caso: ${fechado.referencia.rotulo}`
              : ''}
          </span>
        </div>
      )}

      <div className="eq-evol-numeros">
        <div>
          <b style={{ color: e.sequenciaZerada > 0 ? cores.semantico.verde : 'var(--ink)' }}>
            {e.sequenciaZerada}
          </b>
          <span>
            {e.sequenciaZerada === 1 ? 'mês seguido sem divergência' : 'meses seguidos sem divergência'}
          </span>
        </div>
        <div>
          <b>{e.mesesZerados}</b>
          <span>de {e.ateOMes + 1} meses fecharam em zero</span>
        </div>
        {queda != null && (
          <div>
            <b style={{ color: queda > 0 ? cores.semantico.verde : COR_VALOR }}>
              {queda > 0 ? '−' : '+'}
              {Math.abs(queda)}%
            </b>
            <span>
              do pico de {e.pico!.total.quantidade} em {e.pico!.rotulo}
            </span>
          </div>
        )}
        <div>
          <b style={{ color: COR_VALOR }}>{formatarReal(e.totalValor)}</b>
          <span>devolvido no ano, em {e.totalCasos} elevador(es)</span>
        </div>
      </div>

      <Grafico
        config={config}
        altura={300}
        rotulo="Custo e quantidade de divergências por mês, ao longo do ano"
      />

      {/* O comparativo mes a mes. A curva mostra a tendencia; e a
          tabela que responde "quanto ganhamos", que e o que vai para
          o e-mail. */}
      {comparativo.length > 1 && (
        <>
          <h4 className="eq-sac-titulo">Mês a mês — variação contra o mês anterior</h4>
          <Tabela>
            <thead>
              <tr>
                <Th>Mês</Th>
                <Th alinha="right">Divergências</Th>
                <Th alinha="right">Custo</Th>
                <Th alinha="right">Variação</Th>
                <Th alinha="right">Δ casos</Th>
                <Th alinha="right">Δ custo</Th>
              </tr>
            </thead>
            <tbody>
              {comparativo.map((m) => {
                /* Queda e ganho: verde. Alta e piora: laranja. */
                const caiu = m.deltaValor != null && m.deltaValor < 0;
                const subiu = m.deltaValor != null && m.deltaValor > 0;
                const cor = caiu ? cores.semantico.verde : subiu ? COR_VALOR : 'var(--ink-soft)';
                return (
                  <tr key={m.mes} className={m.zerado ? 'eq-mom-zerado' : undefined}>
                    <Td>
                      <b>{m.rotulo}</b>
                    </Td>
                    <Td alinha="right" numerico>
                      {m.zerado ? <b style={{ color: cores.semantico.verde }}>0</b> : m.casos}
                    </Td>
                    <Td alinha="right" numerico>{formatarReal(m.valor)}</Td>
                    {/* A porcentagem e a coluna que a gerencia le
                        primeiro, entao vem em destaque e antes dos
                        numeros absolutos. */}
                    <Td alinha="right" numerico>
                      <b className="eq-mom-pct" style={{ color: cor }} title={legendaDaVariacao(m)}>
                        {pctDaVariacao(m)}
                      </b>
                    </Td>
                    <Td alinha="right" numerico>
                      {m.deltaCasos == null ? (
                        <span style={{ color: 'var(--ink-soft)' }}>—</span>
                      ) : (
                        <span style={{ color: cor }}>
                          {m.deltaCasos > 0 ? '+' : ''}
                          {m.deltaCasos}
                        </span>
                      )}
                    </Td>
                    <Td alinha="right" numerico>
                      {m.deltaValor == null ? (
                        <span style={{ color: 'var(--ink-soft)' }}>—</span>
                      ) : (
                        <span style={{ color: cor }}>
                          {caiu ? '−' : subiu ? '+' : ''}
                          {formatarReal(Math.abs(m.deltaValor))}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        </>
      )}
    </Cartao>
  );
}

/* A variacao em porcentagem, que e a leitura pedida.

   Mes zerado depois de outro zerado nao tem porcentagem contra o
   anterior: a conta seria 0 sobre 0. Nesse caso a variacao sai contra
   a ultima vez que houve divergencia, que e -100% e e o numero que
   descreve o ganho de verdade. */
function pctDaVariacao(m: ComparativoMes): string {
  if (m.pctValor != null) return `${m.pctValor > 0 ? '+' : ''}${m.pctValor.toFixed(0)}%`;
  if (m.zerado && m.referencia && m.referencia.valor > 0) return '−100%';
  return '—';
}

/* O title explica de onde saiu a porcentagem quando ela nao vem do mes
   imediatamente anterior. Sem isso o -100% de um mes zerado parece
   errado para quem confere na tabela ao lado. */
function legendaDaVariacao(m: ComparativoMes): string {
  if (m.pctValor != null) return 'variação contra o mês anterior';
  if (m.zerado && m.referencia) {
    return `sem divergência; ${m.referencia.rotulo} foi o último mês com caso (${formatarReal(m.referencia.valor)})`;
  }
  return 'primeiro mês do ano, sem base de comparação';
}
