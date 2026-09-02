import { useEffect, useRef } from 'react';
import {
  BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, ChartDataLabels);

interface Props {
  rotulos: string[];
  valores: number[];
  cores: string | string[];
  horizontal?: boolean;
  altura?: number;
  /* Nome da serie: aparece no tooltip. Com uma serie so, o titulo do
     bloco ja identifica os dados e nao existe legenda separada. */
  serie: string;
}

/* Chart.js empacotado no bundle (sem CDN) para nao esbarrar em bloqueio
   de firewall da empresa - mesma decisao do modulo de elevadores. */
export default function Grafico({ rotulos, valores, cores, horizontal = false, altura = 240, serie }: Props) {
  const alvo = useRef<HTMLCanvasElement>(null);
  const grafico = useRef<Chart | null>(null);

  useEffect(() => {
    if (!alvo.current) return;
    grafico.current?.destroy();
    grafico.current = new Chart(alvo.current, {
      type: 'bar',
      data: {
        labels: rotulos,
        datasets: [{
          label: serie,
          data: valores,
          backgroundColor: cores,
          /* Anel na cor da superficie: separa barras vizinhas sem
             desenhar borda escura por cima do dado. */
          borderColor: '#FFFFFF',
          borderWidth: 2,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 30,
        }],
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: horizontal ? 24 : 4, top: horizontal ? 4 : 18 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#161933',
            padding: 10,
            displayColors: false,
            callbacks: { label: (ctx) => `${ctx.formattedValue} ${serie.toLowerCase()}` },
          },
          datalabels: {
            anchor: 'end',
            align: horizontal ? 'right' : 'top',
            offset: 2,
            color: '#6A6F94',
            font: { family: 'Inter', size: 11, weight: 700 },
            /* Zero nao ganha rotulo: a barra ausente ja diz isso e o
               numero solto polui a leitura. */
            display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
          },
        },
        scales: {
          x: {
            grid: { display: !horizontal ? false : true, color: '#E7E8F5' },
            border: { display: false },
            ticks: { color: '#6A6F94', font: { family: 'Inter', size: 11 }, precision: 0 },
            beginAtZero: true,
          },
          y: {
            grid: { display: horizontal ? false : true, color: '#E7E8F5' },
            border: { display: false },
            ticks: { color: '#6A6F94', font: { family: 'Inter', size: 11 }, precision: 0 },
            beginAtZero: true,
          },
        },
      },
    });
    return () => { grafico.current?.destroy(); grafico.current = null; };
  }, [rotulos, valores, cores, horizontal, serie]);

  return (
    <div style={{ height: altura }}>
      <canvas ref={alvo} role="img" aria-label={serie} />
    </div>
  );
}
