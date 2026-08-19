/* ============================================================
   Evolucao das inversoes: o resultado do projeto.

   O painel de status media o plano - quantas acoes fecharam. Isso diz
   se o time trabalhou, nao se a operacao melhorou. Este cartao mede o
   que o plano existe para mudar: elevador voltando por base trocada
   ou peca faltando, e quanto isso custou.

   A leitura e a linha caindo ate o zero. Por isso mes zerado aparece
   com o valor escrito R$ 0, e nao em branco: e ele que sustenta a
   frase "fechamos o mes sem nenhuma inversao".

   Mes que ainda nao aconteceu fica fora do desenho. Contar dezembro
   como mes zerado em agosto seria inventar resultado.
   ============================================================ */
import { useMemo, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import {
  anosDisponiveis,
  doAno,
  evolucaoDeInversoes,
  formatarReal,
  inversoesDeBase,
} from '../domain/divergencias';
import type { DivergenciaSAC } from '../domain/divergencias';
import { casosConsiderados, forasDaPlanilha, mapaDeAjustes } from '../domain/ajustes';
import type { AjusteCaso } from '../domain/ajustes';
import { cores } from '../config/tokens';
import { Grafico } from './charts/Grafico';
import { Cartao, Selecao, Vazio } from './ui';

const COR_VALOR = cores.laranja.base;
const COR_CASOS = cores.navy.base;

export function EvolucaoInversoes({
  divergencias,
  ajustes = [],
  hoje = new Date(),
}: {
  divergencias: DivergenciaSAC[];
  ajustes?: AjusteCaso[];
  hoje?: Date;
}) {
  const mapa = useMemo(() => mapaDeAjustes(ajustes), [ajustes]);
  const inversoes = useMemo(() => {
    const detectados = inversoesDeBase(divergencias);
    return casosConsiderados(detectados, mapa, forasDaPlanilha(detectados));
  }, [divergencias, mapa]);

  const anos = useMemo(() => anosDisponiveis(inversoes), [inversoes]);
  const [ano, setAno] = useState<string>('');
  const anoAtivo = Number(ano) || anos[0] || hoje.getUTCFullYear();
  const e = useMemo(
    () => evolucaoDeInversoes(inversoes, anoAtivo, hoje),
    [inversoes, anoAtivo, hoje]
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
            label: 'Custo das inversões',
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
                if (m.total.quantidade === 0) return '\nMês fechado sem nenhuma inversão.';
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

  if (inversoes.length === 0) {
    return (
      <Cartao titulo="Evolução das inversões" descricao="o resultado do projeto na operação">
        <Vazio icone="📉">
          Sem casos de inversão ou peça faltando na base importada. A evolução aparece assim que a
          aba <b>Divergencias SAC</b> tiver casos.
        </Vazio>
      </Cartao>
    );
  }

  /* A queda contra o pico do ano: e a frase que a reuniao repete. */
  const ultimo = e.ateOMes >= 0 ? e.meses[e.ateOMes] : null;
  const queda =
    e.pico && e.pico.total.quantidade > 0 && ultimo
      ? Math.round(((e.pico.total.quantidade - ultimo.total.quantidade) / e.pico.total.quantidade) * 100)
      : null;

  return (
    <Cartao
      titulo="Evolução das inversões"
      descricao="o que o projeto mudou na operação · custo e quantidade por mês"
      acoes={
        anos.length > 1 ? (
          <Selecao valor={ano} aoMudar={setAno} opcoes={anos.map(String)} rotuloTodos={String(anoAtivo)} />
        ) : undefined
      }
    >
      <div className="eq-evol-numeros">
        <div>
          <b style={{ color: e.sequenciaZerada > 0 ? cores.semantico.verde : 'var(--ink)' }}>
            {e.sequenciaZerada}
          </b>
          <span>
            {e.sequenciaZerada === 1 ? 'mês seguido sem inversão' : 'meses seguidos sem inversão'}
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
        rotulo="Custo e quantidade de inversões por mês, ao longo do ano"
      />
    </Cartao>
  );
}

/* Reexportado para o painel poder contar os casos do ano sem repetir
   o filtro dos ajustes. */
export function casosDoAno(
  divergencias: DivergenciaSAC[],
  ajustes: AjusteCaso[],
  ano: number
): DivergenciaSAC[] {
  const detectados = inversoesDeBase(divergencias);
  const mapa = mapaDeAjustes(ajustes);
  return doAno(casosConsiderados(detectados, mapa, forasDaPlanilha(detectados)), ano);
}
