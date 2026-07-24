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
    return () => chart.destroy();
  }, [config]);

  return (
    <div style={{ height: altura }}>
      <canvas ref={ref} role="img" aria-label={rotulo} />
    </div>
  );
}
