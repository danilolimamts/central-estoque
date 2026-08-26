/* ============================================================
   Evolucao das divergencias: o resultado do projeto.

   Divergencia, e nao inversao: item trocado e so uma das causas, e
   peca faltando conta igual. Chamar o conjunto pelo nome de uma parte
   dele fazia o cartao parecer medir menos do que mede.

   O painel de status media o plano - quantas acoes fecharam. Isso diz
   se o time trabalhou, nao se a operacao melhorou. Este cartao mede o
   que o plano existe para mudar: elevador voltando por erro do CD, e
   quanto isso custou.

   Duas leituras: os numeros do ano e a curva, com o valor e a
   quantidade escritos em cada mes.

   O cartao ja teve uma tabela de mes a mes, uma manchete com a
   variacao do ultimo mes fechado e a queda contra o pico do ano. Tudo
   isso saiu, e por um motivo so: com um ou dois casos por mes, a
   porcentagem nao descreve o resultado, ela o exagera. Um mes que sai
   de 1 caso para 2 vira "+100%"; o seguinte, de volta a 1, vira
   "-50%"; e um mes zerado depois de outro zerado precisava de uma
   regra inventada para ter porcentagem. O grafico conta a mesma
   historia sem precisar dessa moldura - e quem le confia mais no que
   nao parece armado.

   Mes que ainda nao aconteceu fica fora de tudo. Contar dezembro como
   mes zerado em agosto seria inventar resultado.
   ============================================================ */
import { useMemo, useState } from 'react';
import type { Chart, ChartConfiguration, Plugin } from 'chart.js';
import {
  anosDisponiveis,
  evolucaoDeDivergencias,
  formatarReal,
  posicaoDoMarco,
  impactoDoProjeto,
  divergenciasDoCD,
  MESES,
} from '../domain/divergencias';
import type { DivergenciaSAC, ImpactoDoProjeto as Impacto } from '../domain/divergencias';
import { casosConsiderados, forasDaPlanilha, mapaDeAjustes } from '../domain/ajustes';
import type { AjusteCaso } from '../domain/ajustes';
import { cores } from '../config/tokens';
import { Grafico } from './charts/Grafico';
import { Cartao, Selecao, Vazio } from './ui';

const COR_VALOR = cores.laranja.base;

const COR_MARCO = cores.navy.base;

/* Linha vertical no mes em que o projeto comecou.

   E o contexto que faltava no cartao: a curva mostra a queda, mas nao
   diz o que mudou naquele ponto. Com o marco, quem le o e-mail
   enxerga o antes e o depois sem precisar de legenda.

   A linha e desenhada antes dos dados, para passar por tras da curva.
   A etiqueta vem depois, por cima de tudo, com fundo solido - e o
   texto que nao pode ficar ilegivel. */
function marcoDoInicio(pos: number, texto: string): Plugin {
  return {
    id: 'marcoDoInicio',
    beforeDatasetsDraw(chart: Chart) {
      const { ctx, chartArea: area, scales } = chart;
      const x = scales.x?.getPixelForValue(pos);
      if (x == null || x < area.left || x > area.right) return;
      ctx.save();
      ctx.strokeStyle = COR_MARCO;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
      ctx.restore();
    },
    afterDatasetsDraw(chart: Chart) {
      const { ctx, chartArea: area, scales } = chart;
      const x = scales.x?.getPixelForValue(pos);
      if (x == null || x < area.left || x > area.right) return;
      ctx.save();
      ctx.font = '700 10.5px Poppins, sans-serif';
      const largura = ctx.measureText(texto).width + 14;
      /* A etiqueta cai para o lado que tem espaco: encostada na borda
         direita ela sairia do quadro. */
      const paraEsquerda = x + largura + 6 > area.right;
      const cx = paraEsquerda ? x - largura - 5 : x + 5;
      /* Acima da area do grafico, dentro da folga do layout. La em
         baixo a etiqueta caia sobre o rotulo de um mes zerado, que
         mora rente ao eixo; aqui em cima o espaco e sempre livre,
         porque os rotulos de valor ficam presos dentro da area. */
      const cy = area.top - 21;
      ctx.fillStyle =
        getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fff';
      ctx.strokeStyle = COR_MARCO;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.roundRect(cx, cy, largura, 17, 5);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COR_MARCO;
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, cx + 7, cy + 9);
      ctx.restore();
    },
  };
}

/* "mai/2026", no mesmo vocabulario dos rotulos do eixo. O Intl daria
   "mai. de 2026", que destoa dos meses logo abaixo. */
function mesEAno(d: Date): string {
  return `${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}

export function EvolucaoDivergencias({
  divergencias,
  ajustes = [],
  inicio = null,
  hoje = new Date(),
}: {
  divergencias: DivergenciaSAC[];
  ajustes?: AjusteCaso[];
  /* Quando o projeto comecou. Vem do plano, nao da planilha de SAC. */
  inicio?: Date | null;
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

  const marco = posicaoDoMarco(inicio, anoAtivo);
  const impacto = useMemo(() => impactoDoProjeto(e, inicio, anoAtivo), [e, inicio, anoAtivo]);

  const config: ChartConfiguration = useMemo(
    () => ({
      type: 'line',
      plugins:
        marco != null && inicio
          ? [marcoDoInicio(marco, `INÍCIO DO PROJETO · ${mesEAno(inicio)}`)]
          : [],
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
    [e, marco, inicio]
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
      {/* Os numeros do ano a esquerda; o impacto do projeto a direita,
          ocupando o vazio que sobrava ao lado deles. */}
      <div className="eq-evol-topo">
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
        <div>
          <b style={{ color: COR_VALOR }}>{formatarReal(e.totalValor)}</b>
          <span>devolvido no ano, em {e.totalCasos} elevador(es)</span>
        </div>
      </div>

      {impacto && <ImpactoDoProjeto impacto={impacto} inicio={inicio!} />}
      </div>

      <Grafico
        config={config}
        altura={300}
        rotulo="Custo e quantidade de divergências por mês, ao longo do ano"
      />
    </Cartao>
  );
}

/* ============================================================
   Impacto do projeto: o antes e o depois, em quatro leituras.

   E a resposta para "o que o projeto trouxe", e ela precisa aguentar
   a pergunta seguinte: "de onde saiu esse numero?". Por isso cada
   linha mostra o de-para ao lado da variacao - ninguem precisa
   acreditar na porcentagem, ela esta escrita por extenso.

   A comparacao e por media mensal porque os dois lados quase nunca
   tem o mesmo tanto de mes. O mes em que o projeto comecou fica fora
   dos dois, e o rodape avisa.
   ============================================================ */
function ImpactoDoProjeto({ impacto: i, inicio }: { impacto: Impacto; inicio: Date }) {
  const real0 = (v: number) => formatarReal(Math.round(v));
  const um = (v: number) => v.toFixed(1).replace('.', ',');

  const linhas: { chave: string; delta: string; rotulo: string; de: string; para: string }[] = [];

  if (i.quedaValorPct != null) {
    linhas.push({
      chave: 'valor',
      delta: `${pct(i.quedaValorPct)}`,
      rotulo: 'no custo por mês',
      de: real0(i.antes.valorMes),
      para: real0(i.depois.valorMes),
    });
  }
  if (i.quedaCasosPct != null) {
    linhas.push({
      chave: 'pecas',
      delta: `${pct(i.quedaCasosPct)}`,
      rotulo: 'em elevadores por mês',
      de: um(i.antes.casosMes),
      para: um(i.depois.casosMes),
    });
  }
  linhas.push({
    chave: 'pp',
    delta: `${i.pontosPercentuais > 0 ? '+' : '−'}${Math.abs(i.pontosPercentuais).toFixed(0)} pp`,
    rotulo: 'de participação no custo do ano',
    de: `${i.pctAntesDoAno.toFixed(0)}%`,
    para: `${i.pctDepoisDoAno.toFixed(0)}%`,
  });
  linhas.push({
    chave: 'pecas-abs',
    delta: `${i.antes.casos - i.depois.casos > 0 ? '−' : '+'}${Math.abs(i.antes.casos - i.depois.casos)}`,
    rotulo: 'elevadores, no total de cada lado',
    de: `${i.antes.casos} em ${i.antes.meses} ${i.antes.meses === 1 ? 'mês' : 'meses'}`,
    para: `${i.depois.casos} em ${i.depois.meses} ${i.depois.meses === 1 ? 'mês' : 'meses'}`,
  });

  return (
    <div className="eq-impacto">
      <h5>Impacto do projeto · antes × depois de {mesEAno(inicio)}</h5>
      <ul>
        {linhas.map((l) => (
          <li key={l.chave}>
            <b className={l.delta.startsWith('−') ? 'ganho' : 'piora'}>{l.delta}</b>
            <span>{l.rotulo}</span>
            <em>
              {l.de} <span aria-hidden>→</span> {l.para}
            </em>
          </li>
        ))}
      </ul>
      <p>
        {/* A projecao vem por ultimo e dita como projecao. E o numero
            mais forte da lista e o mais facil de contestar: ele supoe
            que o ritmo anterior teria continuado. */}
        Se o ritmo de antes tivesse seguido, os {i.depois.meses}{' '}
        {i.depois.meses === 1 ? 'mês' : 'meses'} seguintes teriam custado cerca de{' '}
        <b>{real0(i.antes.valorMes * i.depois.meses)}</b>. Custaram{' '}
        <b>{real0(i.depois.valor)}</b> — <b className="ganho">{real0(i.valorEvitado)}</b> a menos.
        <br />
        {mesEAno(inicio)} é o mês em que o projeto começou e não entra em nenhum dos
        dois lados ({i.viradaCasos} elevador(es), {real0(i.viradaValor)}).
      </p>
    </div>
  );
}

/* Porcentagem com o sinal escrito: sem ele, "89%" nao diz se subiu ou
   desceu. O menos e o tipografico, igual ao resto do painel. */
function pct(v: number): string {
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}%`;
}
