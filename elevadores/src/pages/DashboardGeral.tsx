/* ============================================================
   Pagina 1: Dashboard Geral (secao 11 do brief).
   KPIs de direcionamento, mapa de calor Fornecedor x Tonelada,
   graficos, plano de acao e auditoria de valoracao.
   ============================================================ */
import { useMemo, useState } from 'react';
import { FotoAoPassar } from '../components/ui/FotoAoPassar';
import { ItensPorFornecedor } from '../components/ItensPorFornecedor';
import { InversoesSAC } from '../components/InversoesSAC';
import type { DivergenciaSAC } from '../domain/divergencias';
import type { ChartConfiguration } from 'chart.js';
import type { Componente, Conjunto, Valoracao } from '../domain/tipos';
import { agruparConjuntos, resumirEqualizacao } from '../domain/equalizacao';
import { auditarValoracao, resumirValoracao } from '../domain/valoracao';
import { cores, coresStatus } from '../config/tokens';
import { Grafico } from '../components/charts/Grafico';
import {
  Barra, BarraFiltros, Botao, Busca, Cartao, Kpi, Selecao, SeloStatus,
  SeloValoracao, Tabela, Td, Th, Vazio,
} from '../components/ui';
import { baixarPlanoEqualizacao, baixarBaseCompleta, baixarCorrecoesValoracao } from '../export/exportExcel';

/* Ordena as toneladas de forma numerica (2 t, 3 t, 3,2 t, 4 t...). */
function ordenarToneladas(tons: string[]): string[] {
  return [...tons].sort((a, b) => {
    const n = (s: string) => parseFloat(s.replace(',', '.')) || 0;
    return n(a) - n(b) || a.localeCompare(b);
  });
}

/* Situacao consolidada de uma celula do mapa de calor: o pior status manda. */
const SEVERIDADE = { DESCASADO: 3, REVERSA: 2, CASADO: 1, 'SEM ESTOQUE': 0 } as const;

function MapaDeCalor({ conjuntos }: { conjuntos: Conjunto[] }) {
  const [modo, setModo] = useState<'marca' | 'fabricante'>('marca');

  const { linhas, tons, celulas } = useMemo(() => {
    const chaveLinha = (c: Conjunto) => (modo === 'marca' ? c.marca : c.fabricante) || '—';
    const linhas = [...new Set(conjuntos.map(chaveLinha))].sort((a, b) => a.localeCompare(b));
    const tons = ordenarToneladas([...new Set(conjuntos.map((c) => c.toneladaFixa || '—'))]);
    const celulas = new Map<string, { base: number; col: number; status: Conjunto['status'] }>();
    for (const c of conjuntos) {
      const k = `${chaveLinha(c)}||${c.toneladaFixa || '—'}`;
      const atual = celulas.get(k) ?? { base: 0, col: 0, status: 'SEM ESTOQUE' as Conjunto['status'] };
      atual.base += c.baseCD;
      atual.col += c.colCD;
      if (SEVERIDADE[c.status] > SEVERIDADE[atual.status]) atual.status = c.status;
      celulas.set(k, atual);
    }
    return { linhas, tons, celulas };
  }, [conjuntos, modo]);

  const alternador = (
    <div
      className="flex gap-0.5 rounded-lg p-0.5"
      role="group"
      aria-label="Agrupamento do mapa"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
    >
      {(['marca', 'fabricante'] as const).map((m) => (
        <button
          key={m}
          onClick={() => setModo(m)}
          aria-pressed={modo === m}
          className="rounded-md px-2.5 py-1 text-xs font-medium capitalize"
          style={{
            background: modo === m ? cores.navy.base : 'transparent',
            color: modo === m ? '#fff' : 'var(--ink-soft)',
          }}
        >
          Por {m}
        </button>
      ))}
    </div>
  );

  return (
    <Cartao
      titulo="Mapa de calor — Fornecedor × Tonelada"
      descricao="saldo base / coluna por célula"
      acoes={alternador}
    >
      <div style={{ overflowX: 'auto' }}>
        <table className="eq-heat">
          <thead>
            <tr>
              <th />
              {tons.map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l}>
                <th className="eq-heat-row">{l}</th>
                {tons.map((t) => {
                  const c = celulas.get(`${l}||${t}`);
                  if (!c) return <td key={t} />;
                  return (
                    <td key={t}>
                      <div
                        className="eq-cell"
                        style={{ background: coresStatus[c.status] }}
                        title={`${l} · ${t} — ${c.status}`}
                      >
                        <b>
                          {c.base} / {c.col}
                        </b>
                        <span>B / C</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legenda-status">
        {(Object.keys(coresStatus) as (keyof typeof coresStatus)[]).map((k) => (
          <span key={k}>
            <i style={{ background: coresStatus[k] }} />
            {k}
          </span>
        ))}
      </div>
    </Cartao>
  );
}

function PlanoDeAcao({
  conjuntos,
  buscaGlobal,
}: {
  conjuntos: Conjunto[];
  buscaGlobal: string;
}) {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');

  const filtrados = useMemo(() => {
    const b = `${buscaGlobal} ${busca}`.trim().toLowerCase();
    return conjuntos
      .filter((c) => !b || c.chave.toLowerCase().includes(b))
      .filter((c) => !status || c.status === status)
      .sort((a, b2) => b2.comprarColuna + b2.comprarBase - (a.comprarColuna + a.comprarBase));
  }, [conjuntos, busca, buscaGlobal, status]);

  return (
    <Cartao
      titulo="Plano de ação — equalização"
      descricao={`${filtrados.length} de ${conjuntos.length} conjuntos`}
      acoes={<Botao variante="secundario" aoClicar={() => baixarPlanoEqualizacao(filtrados)}>Exportar Excel</Botao>}
    >
      <BarraFiltros>
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar conjunto…" />
        <Selecao valor={status} aoMudar={setStatus} opcoes={Object.keys(coresStatus)} rotuloTodos="Todos os status" />
      </BarraFiltros>
      {filtrados.length === 0 ? (
        <Vazio>Nenhum conjunto para os filtros escolhidos.</Vazio>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <Th>Conjunto (Chave)</Th>
              <Th>Ton.</Th>
              <Th alinha="right">Ratio</Th>
              <Th alinha="right">Base CD</Th>
              <Th alinha="right">Col. CD</Th>
              <Th alinha="right">Déficit</Th>
              <Th alinha="right">Kits</Th>
              <Th alinha="right">Reversa</Th>
              <Th>Status</Th>
              <Th alinha="right">Ação sugerida</Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.chave}>
                <Td>{c.chave}</Td>
                <Td>{c.toneladaFixa}</Td>
                <Td alinha="right" numerico>1:{c.ratio}</Td>
                <Td alinha="right" numerico>{c.baseCD}</Td>
                <Td alinha="right" numerico>{c.colCD}</Td>
                <Td alinha="right" numerico>{c.deficit > 0 ? `+${c.deficit}` : c.deficit}</Td>
                <Td alinha="right" numerico>{c.kits}</Td>
                <Td alinha="right" numerico>{c.reversa || '—'}</Td>
                <Td><SeloStatus status={c.status} /></Td>
                <Td alinha="right">
                  {c.status === 'CASADO' ? (
                    <span style={{ color: cores.semantico.verde }}>— equalizado —</span>
                  ) : c.status === 'SEM ESTOQUE' ? (
                    <span style={{ color: 'var(--ink-soft)' }}>sem estoque</span>
                  ) : (
                    <span className="num">
                      {c.comprarColuna > 0 && (
                        <b style={{ color: cores.laranja.base }}>+{c.comprarColuna} coluna</b>
                      )}
                      {c.comprarColuna > 0 && c.comprarBase > 0 && ' · '}
                      {c.comprarBase > 0 && <b style={{ color: cores.navy.base }}>+{c.comprarBase} base</b>}
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </Cartao>
  );
}

function AuditoriaValoracao({
  valoracoes,
  fotos,
}: {
  valoracoes: Valoracao[];
  fotos: Map<string, string>;
}) {
  const resumo = useMemo(() => resumirValoracao(valoracoes), [valoracoes]);
  const aCorrigir = useMemo(
    () => valoracoes.filter((v) => v.diagnostico === 'CORRIGIR' || v.diagnostico === 'DUPLICADO'),
    [valoracoes]
  );
  const maximo = resumo.porMarca[0]?.corrigir ?? 1;

  return (
    <Cartao
      titulo="Auditoria de valoração"
      descricao="campo “in interface” · o valor do kit fica na COLUNA"
      acoes={
        <Botao variante="secundario" aoClicar={() => baixarCorrecoesValoracao(aCorrigir)}>
          Exportar correções
        </Botao>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Kpi rotulo="Corretos" valor={resumo.ok} cor={cores.semantico.verde} />
        <Kpi rotulo="A corrigir" valor={resumo.corrigir} dica="S na base" cor={cores.laranja.base} />
        <Kpi rotulo="Sem S" valor={resumo.semS} cor={cores.semantico.ambar} />
        <Kpi rotulo="Duplicado" valor={resumo.duplicado} cor={cores.navy.base} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2.5 text-[13px] uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
            Concentração por marca
          </h3>
          {resumo.porMarca.length === 0 ? (
            <Vazio>Nenhuma correção pendente.</Vazio>
          ) : (
            resumo.porMarca.slice(0, 8).map((m) => (
              <Barra key={m.marca} nome={m.marca || '—'} valor={m.corrigir} maximo={maximo} cor={cores.laranja.base} />
            ))
          )}
        </div>
        <div>
          <h3 className="mb-2.5 text-[13px] uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
            Correções prontas para o Bseller
          </h3>
          <div className="max-h-80 overflow-y-auto pr-1">
            {aCorrigir.length === 0 ? (
              <Vazio>Nada a corrigir.</Vazio>
            ) : (
              aCorrigir.slice(0, 40).map((v) => (
                <div
                  key={v.itemVolMultiplo}
                  className="mb-2 rounded-lg px-3 py-2.5 font-mono text-[12px]"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
                >
                  <div className="mb-1 font-sans text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                    <FotoAoPassar item={v.itemVolMultiplo} url={fotos.get(String(v.itemVolMultiplo))} />{' '}
                    · {v.marca} <SeloValoracao diagnostico={v.diagnostico} />
                  </div>
                  {v.correcoes.map((c) => (
                    <div key={c}>{c}</div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Cartao>
  );
}

export function DashboardGeral({
  componentes,
  fotos,
  busca: buscaGlobal = '',
  divergencias = [],
}: {
  componentes: Componente[];
  fotos: Map<string, string>;
  /* Texto da busca da barra de topo, que vale para todas as telas. */
  busca?: string;
  /* Devolucoes registradas pelo SAC (aba Divergencias SAC). */
  divergencias?: DivergenciaSAC[];
}) {
  const conjuntos = useMemo(() => agruparConjuntos(componentes), [componentes]);
  const resumo = useMemo(() => resumirEqualizacao(conjuntos), [conjuntos]);
  const valoracoes = useMemo(() => auditarValoracao(componentes), [componentes]);

  const configCompras: ChartConfiguration = useMemo(() => {
    const top = [...conjuntos]
      .filter((c) => c.comprarColuna + c.comprarBase > 0)
      .sort((a, b) => b.comprarColuna + b.comprarBase - (a.comprarColuna + a.comprarBase))
      .slice(0, 8);
    return {
      type: 'bar',
      data: {
        labels: top.map((c) => c.chave),
        datasets: [
          { label: 'Colunas', data: top.map((c) => c.comprarColuna), backgroundColor: cores.laranja.base, borderRadius: 4 },
          { label: 'Bases', data: top.map((c) => c.comprarBase), backgroundColor: cores.navy.base, borderRadius: 4 },
        ],
      },
      options: {
        indexAxis: 'y',
        scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true, ticks: { font: { size: 10 } } } },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12 } },
          datalabels: { display: (c) => (c.dataset.data[c.dataIndex] as number) > 0, anchor: 'center', align: 'center', color: '#fff' },
        },
      },
    };
  }, [conjuntos]);

  return (
    <div className="flex flex-col gap-4.5" style={{ gap: 18 }}>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi rotulo="Colunas a comprar" valor={resumo.totalComprarColuna} dica="para casar as bases existentes" cor={cores.laranja.base} />
        <Kpi rotulo="Bases a comprar" valor={resumo.totalComprarBase} dica="onde sobram colunas sem base" cor={cores.navy.base} />
        <Kpi rotulo="Travado na reversa" valor={resumo.totalReversa} sufixo="un" dica="sem lastro definido" cor={cores.semantico.ambar} />
        <Kpi
          rotulo="Conjuntos casados"
          valor={resumo.casados}
          sufixo={`/ ${resumo.comConjuntoNoCD}`}
          dica="meta: 100% casados"
          cor={cores.semantico.verde}
        />
      </div>

      <MapaDeCalor conjuntos={conjuntos} />

      <Cartao titulo="Colunas × bases a comprar" descricao="maiores necessidades de compra">
        <Grafico config={configCompras} altura={280} rotulo="Colunas e bases a comprar por conjunto" />
      </Cartao>

      <ItensPorFornecedor componentes={componentes} fotos={fotos} busca={buscaGlobal} />

      <InversoesSAC divergencias={divergencias} />

      <PlanoDeAcao conjuntos={conjuntos} buscaGlobal={buscaGlobal} />
      <AuditoriaValoracao valoracoes={valoracoes} fotos={fotos} />

      <Cartao titulo="Base mestre" descricao={`${componentes.length} linhas importadas`}
        acoes={<Botao variante="secundario" aoClicar={() => baixarBaseCompleta(componentes, conjuntos, valoracoes)}>Exportar base completa</Botao>}>
        <p className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
          A exportação traz as 18 colunas originais da aba Multiplos, na mesma ordem, mais as colunas
          de análise ao final: ratio, saldos do conjunto, kits, déficit, status, ação sugerida e
          diagnóstico de valoração.
        </p>
      </Cartao>
    </div>
  );
}
