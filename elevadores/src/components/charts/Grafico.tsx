/* ============================================================
   Wrapper de Chart.js. A biblioteca e o plugin de rotulos entram
   pelo bundle (import), nunca por CDN, para nao depender da
   liberacao de firewall (secao 4 do brief).
   ============================================================ */
import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import type { ChartConfiguration } from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

function lerToken(nome: string): string {
  if (typeof window === 'undefined') return '#000';
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

/* Resolucao em que o grafico e desenhado.

   Duas coisas somam aqui:

   1. O zoom da pagina e CSS zoom, e canvas e imagem. O navegador
      redesenha texto e borda na nova escala, mas o canvas ele so
      estica - o desenho sai borrado a 110% enquanto a tabela ao lado
      continua nitida. O Chart.js nao percebe: a largura em pixels de
      layout nao muda com o zoom. Medindo o retangulo real contra a
      largura de layout, o fator aparece (440/400 = 1,1) e entra na
      conta.

   2. Piso de 2. Mesmo sem zoom e em tela comum, desenhar no dobro
      deixa o texto do rotulo e a linha fina visivelmente melhores, e
      o painel e projetado em reuniao.

   O teto de 4 existe para o consumo de memoria nao explodir: a area
   do canvas cresce com o quadrado deste numero.

   A ORDEM DAS CONTAS IMPORTA, e errar aqui e silencioso: o piso vale
   para a densidade que chega na tela, nao para o numero cru. Aplicando
   o piso depois da multiplicacao, um zoom de 120% em tela comum daria
   1,2 - abaixo de 2, entao subiria para 2 - e a densidade final seria
   2/1,2 = 1,67, PIOR do que sem zoom. O piso entra antes, no dpr, e a
   multiplicacao vem por cima. */
const DPR_MINIMO = 2;
const DPR_MAXIMO = 4;

export function resolucaoDoDesenho(dpr: number, fatorDeZoom: number): number {
  const densidade = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const zoom = Number.isFinite(fatorDeZoom) && fatorDeZoom > 0 ? fatorDeZoom : 1;
  return Math.min(DPR_MAXIMO, Math.max(DPR_MINIMO, densidade) * zoom);
}

/* Quanto o CSS zoom dos ancestrais esta esticando este elemento.
   offsetWidth vem em pixel de layout, sem o zoom; o retangulo vem com
   ele. Elemento ainda sem medida cai em 1. */
function fatorDeZoomDe(el: HTMLElement): number {
  const layout = el.offsetWidth;
  if (!layout) return 1;
  return el.getBoundingClientRect().width / layout;
}

export function Grafico({
  config,
  altura = 240,
  rotulo,
}: {
  config: ChartConfiguration;
  altura?: number;
  rotulo: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // Cores de texto e grade seguem o tema vigente.
    const ink = lerToken('--ink');
    const inkSoft = lerToken('--ink-soft');
    const linha = lerToken('--line');

    const base: ChartConfiguration = {
      ...config,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        devicePixelRatio: resolucaoDoDesenho(window.devicePixelRatio, fatorDeZoomDe(canvas)),
        ...config.options,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: lerToken('--navy'), padding: 10, cornerRadius: 8 },
          datalabels: {
            color: ink,
            font: { family: 'Poppins, sans-serif', size: 11, weight: 600 },
          },
          ...config.options?.plugins,
        },
      },
    };

    // Aplica as cores do tema nos eixos declarados pelo chamador.
    const escalas = base.options?.scales as Record<string, Record<string, unknown>> | undefined;
    if (escalas) {
      for (const eixo of Object.values(escalas)) {
        eixo.ticks = { color: inkSoft, font: { size: 11 }, ...(eixo.ticks as object) };
        eixo.grid = { color: linha, ...(eixo.grid as object) };
      }
    }

    const chart = new Chart(canvas, base);

    /* Redesenha quando o zoom da pagina muda. Sem isto o grafico fica
       borrado ate alguma outra coisa forcar um resize, porque o
       tamanho em pixels de layout continua o mesmo. */
    const redesenhar = () => {
      const alvo = resolucaoDoDesenho(window.devicePixelRatio, fatorDeZoomDe(canvas));
      if (chart.options.devicePixelRatio === alvo) return;
      chart.options.devicePixelRatio = alvo;
      chart.resize();
    };
    const observador = new MutationObserver(redesenhar);
    observador.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-zoom'],
    });
    /* Janela arrastada para um monitor de outra densidade. */
    window.addEventListener('resize', redesenhar);

    return () => {
      observador.disconnect();
      window.removeEventListener('resize', redesenhar);
      chart.destroy();
    };
  }, [config]);

  return (
    <div style={{ height: altura }}>
      <canvas ref={ref} role="img" aria-label={rotulo} />
    </div>
  );
}
