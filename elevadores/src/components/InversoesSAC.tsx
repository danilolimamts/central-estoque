/* ============================================================
   Inversoes de base apontadas pelo SAC.

   Mostra quantos elevadores sairam com a base trocada no ano, mes a
   mes, com CD e lojas sempre separados, em quantidade e em valor, e o
   indice por transportadora.

   A tabela do fim lista caso a caso de proposito: a inversao nao e um
   campo da planilha, e deduzida do texto, entao quem le precisa poder
   conferir o que entrou na conta.
   ============================================================ */
import { useMemo, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import {
  anosDisponiveis,
  doAno,
  formatarReal,
  inversoesDeBase,
  porMes,
  porTransportadora,
  totalizar,
} from '../domain/divergencias';
import type { DivergenciaSAC } from '../domain/divergencias';
import { cores } from '../config/tokens';
import { Grafico } from './charts/Grafico';
import { Cartao, Selecao, Tabela, Td, Th, Vazio } from './ui';

const COR_CD = cores.navy.base;
const COR_LOJA = cores.laranja.base;

function Numero({
  rotulo,
  quantidade,
  valor,
  cor,
}: {
  rotulo: string;
  quantidade: number;
  valor: number;
  cor: string;
}) {
  return (
    <div className="eq-sac-numero">
      <span className="eq-sac-rotulo" style={{ color: cor }}>
        {rotulo}
      </span>
      <b>{quantidade}</b>
      <span className="eq-sac-valor">{formatarReal(valor)}</span>
    </div>
  );
}

export function InversoesSAC({ divergencias }: { divergencias: DivergenciaSAC[] }) {
  const inversoes = useMemo(() => inversoesDeBase(divergencias), [divergencias]);
  const anos = useMemo(() => anosDisponiveis(inversoes), [inversoes]);
  const [ano, setAno] = useState<string>('');
  const anoAtivo = Number(ano) || anos[0] || new Date().getFullYear();

  const doAnoEscolhido = useMemo(() => doAno(inversoes, anoAtivo), [inversoes, anoAtivo]);
  const totais = useMemo(() => totalizar(doAnoEscolhido), [doAnoEscolhido]);
  const meses = useMemo(() => porMes(inversoes, anoAtivo), [inversoes, anoAtivo]);
  const transportadoras = useMemo(() => porTransportadora(doAnoEscolhido), [doAnoEscolhido]);

  /* Barras por mes, CD e lojas lado a lado. A linha e o valor, no eixo
     da direita: quantidade e dinheiro nao dividem escala. */
  const configMes: ChartConfiguration = useMemo(
    () => ({
      type: 'bar',
      data: {
        labels: meses.map((m) => m.rotulo),
        datasets: [
          { label: 'CD', data: meses.map((m) => m.cd.quantidade), backgroundColor: COR_CD, yAxisID: 'y' },
          { label: 'Lojas', data: meses.map((m) => m.lojas.quantidade), backgroundColor: COR_LOJA, yAxisID: 'y' },
          {
            type: 'line',
            label: 'Valor (R$)',
            data: meses.map((m) => m.total.valor),
            borderColor: cores.semantico.cinza,
            backgroundColor: 'transparent',
            borderDash: [5, 4],
            pointRadius: 3,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          datalabels: { display: false },
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (c) =>
                c.dataset.label === 'Valor (R$)'
                  ? `Valor: ${formatarReal(Number(c.raw))}`
                  : `${c.dataset.label}: ${c.raw}`,
            },
          },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Elevadores' } },
          y1: {
            beginAtZero: true, position: 'right', grid: { drawOnChartArea: false },
            title: { display: true, text: 'Valor' },
            ticks: { callback: (v) => formatarReal(Number(v)) },
          },
        },
      },
    }),
    [meses]
  );

  if (divergencias.length === 0) {
    return (
      <Cartao
        titulo="Inversões de base apontadas pelo SAC"
        descricao="quantos elevadores saíram com a base trocada"
      >
        <Vazio icone="📦">
          A planilha importada não trouxe a aba <b>Divergencias SAC</b>. Inclua a tabela
          f_divergenciasSAC no arquivo e importe de novo.
        </Vazio>
      </Cartao>
    );
  }

  return (
    <Cartao
      titulo="Inversões de base apontadas pelo SAC"
      descricao={`${inversoes.length} caso(s) de base trocada em ${divergencias.length} devolução(ões) registradas · arrependimento não entra na conta`}
      acoes={
        anos.length > 1 ? (
          <Selecao
            valor={ano}
            aoMudar={setAno}
            opcoes={anos.map((a) => ({ valor: String(a), rotulo: String(a) }))}
            rotulo="Ano"
          />
        ) : undefined
      }
    >
      {doAnoEscolhido.length === 0 ? (
        <Vazio icone="🔎">Nenhuma inversão de base em {anoAtivo}.</Vazio>
      ) : (
        <>
          <div className="eq-sac-numeros">
            <Numero rotulo="CD" quantidade={totais.cd.quantidade} valor={totais.cd.valor} cor={COR_CD} />
            <Numero rotulo="Lojas" quantidade={totais.lojas.quantidade} valor={totais.lojas.valor} cor={COR_LOJA} />
            <Numero
              rotulo={`Total ${anoAtivo}`}
              quantidade={totais.total.quantidade}
              valor={totais.total.valor}
              cor={cores.dark.base}
            />
          </div>

          <Grafico
            config={configMes}
            altura={250}
            rotulo={`Inversões de base por mês em ${anoAtivo}, separando CD de lojas, com o valor devolvido`}
          />

          <h4 className="eq-sac-titulo">Índice por transportadora</h4>
          {transportadoras.length === 0 ? (
            <Vazio icone="🚚">Nenhuma das inversões tem transportadora identificada.</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Transportadora</Th>
                  <Th alinha="right">Casos</Th>
                  <Th alinha="right">Participação</Th>
                  <Th alinha="right">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {transportadoras.map((t) => (
                  <tr key={t.transportadora}>
                    <Td>{t.transportadora}</Td>
                    <Td alinha="right" numerico>{t.quantidade}</Td>
                    <Td alinha="right" numerico>{t.pct.toFixed(0)}%</Td>
                    <Td alinha="right" numerico>{formatarReal(t.valor)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}

          {/* Auditoria da classificacao: a inversao e deduzida do texto,
              entao a lista precisa ficar a mao para quem quiser conferir. */}
          <h4 className="eq-sac-titulo">Casos contados em {anoAtivo}</h4>
          <Tabela>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Origem</Th>
                <Th>Pedido</Th>
                <Th>Motivo · submotivo</Th>
                <Th>Transportadora</Th>
                <Th alinha="right">Valor</Th>
              </tr>
            </thead>
            <tbody>
              {doAnoEscolhido.map((d, i) => (
                <tr key={`${d.pedido}-${i}`}>
                  <Td>{d.data?.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) ?? '—'}</Td>
                  <Td>
                    <span
                      className="tag"
                      style={{
                        background: d.origem === 'CD' ? 'var(--blue-light)' : '#FFEDE7',
                        color: d.origem === 'CD' ? COR_CD : COR_LOJA,
                      }}
                      title={d.filial}
                    >
                      {d.origem}
                    </span>
                  </Td>
                  <Td><span className="mono">{d.pedido}</span></Td>
                  <Td>
                    <span title={d.comentario}>
                      {d.motivo} · {d.submotivo}
                    </span>
                  </Td>
                  <Td>{d.transportadora}</Td>
                  <Td alinha="right" numerico>{formatarReal(d.valor)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </>
      )}
    </Cartao>
  );
}
