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
   mes fechado, os numeros do ano e a curva.

   Ja houve tambem uma tabela de mes a mes embaixo. Ela repetia o que a
   curva ja mostra - cada ponto do grafico traz o valor e a quantidade
   escritos - e a coluna de variacao ficava ilegivel justamente quando
   o resultado era bom: um mes zerado depois de outro zerado nao tem
   porcentagem contra o anterior. A variacao que interessa, a do ultimo
   mes fechado, continua na manchete.

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
import { Cartao, Selecao, Vazio } from './ui';

const COR_VALOR = cores.laranja.base;

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
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        /* Folga em volta para o rotulo de duas linhas caber sem
           encostar na borda nem no eixo. A lateral e larga porque o
           rotulo do primeiro e do ultimo mes fica centrado no ponto, e
           metade dele passaria por cima dos valores do eixo. */
        layout: { padding: { top: 34, bottom: 10, left: 52, right: 52 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          /* Um rotulo por mes, com as duas informacoes: quanto custou e
             quantos elevadores voltaram.

             Antes a quantidade era uma segunda linha tracejada. Ela
             seguia quase o mesmo desenho da linha de valor - mais caso
             e mais dinheiro andam juntos - entao repetia a forma e
             ainda passava por cima dos rotulos. Virou numero dentro do
             proprio rotulo: a informacao continua, o cruzamento some. */
          datalabels: {
            display: (c) => c.dataset.data[c.dataIndex] != null,
            align: (c) => {
              const dados = c.dataset.data as (number | null)[];
              const v = dados[c.dataIndex];
              const antes = dados[c.dataIndex - 1];
              const depois = dados[c.dataIndex + 1];
              if (typeof v !== 'number') return 'top';
              /* Zero e o menor ponto possivel: embaixo ele cairia sobre
                 o eixo, entao fica sempre em cima. */
              if (v === 0) return 'top';
              /* Ponta da linha fica em cima: embaixo, o rotulo do
                 primeiro mes caia sobre os valores do eixo. */
              if (typeof antes !== 'number' || typeof depois !== 'number') return 'top';
              /* No fundo de um vale o rotulo em cima seria atravessado
                 pelos dois bracos da curva. */
              return antes > v && depois > v ? 'bottom' : 'top';
            },
            offset: 7,
            clamp: true,
            /* Fundo solido atras do texto.

               Sem ele, qualquer rotulo que caisse sobre a curva, sobre
               o eixo ou sobre o vizinho ficava ilegivel - e nao ha
               alinhamento que de conta de todos os casos ao mesmo
               tempo. A cor sai do tema na hora de desenhar, entao
               acompanha claro e escuro. */
            backgroundColor: () =>
              getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fff',
            borderRadius: 5,
            padding: { top: 3, bottom: 3, left: 6, right: 6 },
            /* Rotulo vizinho nao pode ficar por cima do outro: quando
               nao couber, o plugin esconde o de menor prioridade. */
            overlap: false,
            textAlign: 'center',
            font: { weight: 700, size: 11 },
            color: (c) => ((c.dataset.data[c.dataIndex] as number) === 0 ? cores.semantico.verde : COR_VALOR),
            formatter: (v: number, c) => {
              const m = e.meses[c.dataIndex];
              const qtd = m?.total.quantidade ?? 0;
              if (v === 0) return ['R$ 0', '0 elevador'];
              return [formatarReal(v), `${qtd} ${qtd === 1 ? 'elevador' : 'elevadores'}`];
            },
          },
          tooltip: {
            callbacks: {
              label: (c) => `Custo: ${formatarReal(Number(c.parsed.y))}`,
              afterBody: (itens) => {
                const m = e.meses[itens[0]?.dataIndex ?? 0];
                if (!m) return '';
                if (m.total.quantidade === 0) return 'Mês fechado sem nenhuma divergência.';
                return `${m.total.quantidade} elevador(es) · CD: ${m.cd.quantidade} · Lojas: ${m.lojas.quantidade}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            /* Folga no topo para o maior valor nao encostar na borda. */
            grace: '18%',
            title: { display: true, text: 'R$ devolvido' },
            ticks: { callback: (v) => formatarReal(Number(v)) },
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
