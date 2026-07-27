/* ============================================================
   Tabela unica por Chave, para reportar.

   Uma linha por conjunto, com tudo que a reuniao pergunta: saldo,
   ratio, deficit, kits fechados, reversa, situacao e a acao. Traz
   linha de total, ordenacao por qualquer coluna e copia em formato
   que cola direto no Excel, no e-mail ou no Teams.
   ============================================================ */
import { useMemo, useState } from 'react';
import { agruparConjuntos, resumirEqualizacao } from '../domain/equalizacao';
import { baixarPlanoEqualizacao } from '../export/exportExcel';
import type { Componente, Conjunto, StatusConjunto } from '../domain/tipos';
import {
  Cartao, Tabela, Th, Td, Botao, Busca, Selecao, BarraFiltros, Chips,
  SeloStatus, Fornecedor, Vazio, Kpi, GradeKpis,
} from '../components/ui';

type Coluna =
  | 'chave' | 'ton' | 'ratio' | 'baseCD' | 'colCD'
  | 'necessarias' | 'deficit' | 'kits' | 'reversa' | 'status' | 'acao';

const COLUNAS: { id: Coluna; rotulo: string; numero?: boolean; dica?: string }[] = [
  { id: 'chave', rotulo: 'Conjunto (Chave)' },
  { id: 'ton', rotulo: 'Ton.' },
  { id: 'ratio', rotulo: 'Ratio', numero: true, dica: 'colunas por base' },
  { id: 'baseCD', rotulo: 'Bases CD', numero: true },
  { id: 'colCD', rotulo: 'Colunas CD', numero: true },
  { id: 'necessarias', rotulo: 'Colunas nec.', numero: true, dica: 'bases × ratio' },
  { id: 'deficit', rotulo: 'Déficit', numero: true, dica: 'necessárias menos existentes' },
  { id: 'kits', rotulo: 'Kits', numero: true, dica: 'conjuntos completos hoje' },
  { id: 'reversa', rotulo: 'Reversa', numero: true, dica: 'fora do cálculo' },
  { id: 'status', rotulo: 'Situação' },
  { id: 'acao', rotulo: 'Ação sugerida' },
];

/* Frase curta da acao, a mesma usada na copia e na tela. */
function textoAcao(c: Conjunto): string {
  if (c.status === 'CASADO') return 'Equalizado';
  if (c.status === 'SEM ESTOQUE') return 'Sem estoque';
  const partes: string[] = [];
  if (c.comprarColuna > 0) partes.push(`comprar ${c.comprarColuna} coluna(s)`);
  if (c.comprarBase > 0) partes.push(`comprar ${c.comprarBase} base(s)`);
  if (partes.length === 0) return c.reversa > 0 ? 'Validar saldo na reversa' : 'Equalizado';
  return partes.join(' e ');
}

function valorDaColuna(c: Conjunto, col: Coluna): string | number {
  switch (col) {
    case 'chave': return c.chave;
    case 'ton': return c.toneladaFixa;
    case 'ratio': return c.ratio;
    case 'baseCD': return c.baseCD;
    case 'colCD': return c.colCD;
    case 'necessarias': return c.colunasNecessarias;
    case 'deficit': return c.deficit;
    case 'kits': return c.kits;
    case 'reversa': return c.reversa;
    case 'status': return c.status;
    case 'acao': return textoAcao(c);
  }
}

export function TabelaChaves({
  componentes,
  busca: buscaGlobal = '',
}: {
  componentes: Componente[];
  busca?: string;
}) {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [soPendentes, setSoPendentes] = useState<'todos' | 'pendentes'>('todos');
  const [ordem, setOrdem] = useState<{ col: Coluna; desc: boolean }>({ col: 'deficit', desc: true });
  const [copiado, setCopiado] = useState(false);

  const conjuntos = useMemo(() => agruparConjuntos(componentes), [componentes]);
  const resumo = useMemo(() => resumirEqualizacao(conjuntos), [conjuntos]);

  const linhas = useMemo(() => {
    const b = `${buscaGlobal} ${busca}`.trim().toLowerCase();
    const filtradas = conjuntos.filter((c) => {
      if (status && c.status !== status) return false;
      if (soPendentes === 'pendentes' && (c.comprarBase + c.comprarColuna === 0)) return false;
      if (!b) return true;
      return `${c.chave} ${c.marca} ${c.fabricante} ${c.toneladaFixa}`.toLowerCase().includes(b);
    });
    return [...filtradas].sort((a, z) => {
      const va = valorDaColuna(a, ordem.col);
      const vz = valorDaColuna(z, ordem.col);
      const cmp =
        typeof va === 'number' && typeof vz === 'number'
          ? va - vz
          : String(va).localeCompare(String(vz), 'pt-BR');
      return ordem.desc ? -cmp : cmp;
    });
  }, [conjuntos, busca, buscaGlobal, status, soPendentes, ordem]);

  /* Totais da selecao, para o numero do reporte fechar com a tabela. */
  const total = useMemo(() => {
    const t = { baseCD: 0, colCD: 0, necessarias: 0, kits: 0, reversa: 0, comprarBase: 0, comprarColuna: 0 };
    for (const c of linhas) {
      t.baseCD += c.baseCD;
      t.colCD += c.colCD;
      t.necessarias += c.colunasNecessarias;
      t.kits += c.kits;
      t.reversa += c.reversa;
      t.comprarBase += c.comprarBase;
      t.comprarColuna += c.comprarColuna;
    }
    return t;
  }, [linhas]);

  function ordenarPor(col: Coluna) {
    setOrdem((o) => (o.col === col ? { col, desc: !o.desc } : { col, desc: true }));
  }

  /* Copia separado por tabulacao: cola direto no Excel, no e-mail e no
     Teams mantendo as colunas. */
  async function copiar() {
    const cabecalho = COLUNAS.map((c) => c.rotulo).join('\t');
    const corpo = linhas
      .map((c) => COLUNAS.map((col) => String(valorDaColuna(c, col.id))).join('\t'))
      .join('\n');
    const rodape = [
      'TOTAL', '', '', total.baseCD, total.colCD, total.necessarias,
      total.necessarias - total.colCD, total.kits, total.reversa, '',
      `comprar ${total.comprarColuna} coluna(s) e ${total.comprarBase} base(s)`,
    ].join('\t');
    try {
      await navigator.clipboard.writeText(`${cabecalho}\n${corpo}\n${rodape}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <>
      <GradeKpis>
        <Kpi
          rotulo="Colunas a comprar"
          valor={total.comprarColuna}
          dica="para casar as bases existentes"
          tom="laranja"
        />
        <Kpi rotulo="Bases a comprar" valor={total.comprarBase} dica="onde sobram colunas" />
        <Kpi
          rotulo="Conjuntos equalizados"
          valor={`${resumo.casados} / ${resumo.comConjuntoNoCD}`}
          dica="meta: 100% casados"
          tom="bom"
        />
        <Kpi rotulo="Travado na reversa" valor={total.reversa} sufixo="un" dica="fora do cálculo" tom="ruim" />
      </GradeKpis>

      <Cartao
        titulo={`Conjuntos por chave (${linhas.length} de ${conjuntos.length})`}
        descricao="Uma linha por conjunto. A chave é Marca + Fabricante + Tonelada, que é o agrupamento que fecha com a planilha."
        acoes={
          <>
            <Botao aoClicar={copiar} titulo="Cola direto no Excel, no e-mail ou no Teams">
              {copiado ? 'Copiado' : 'Copiar tabela'}
            </Botao>
            <Botao variante="laranja" aoClicar={() => baixarPlanoEqualizacao(linhas)}>
              Exportar Excel
            </Botao>
          </>
        }
      >
        <BarraFiltros>
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar chave, marca ou fabricante..." />
          <Selecao
            valor={status}
            aoMudar={setStatus}
            opcoes={['CASADO', 'REVERSA', 'DESCASADO', 'SEM ESTOQUE'] as StatusConjunto[]}
            rotuloTodos="Todas as situações"
          />
          <Chips
            valor={soPendentes}
            aoMudar={setSoPendentes}
            opcoes={[
              { valor: 'todos', rotulo: 'Todos' },
              { valor: 'pendentes', rotulo: 'Só com compra pendente' },
            ]}
          />
        </BarraFiltros>

        {linhas.length === 0 ? (
          <Vazio icone="🔎">Nenhum conjunto para os filtros escolhidos.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                {COLUNAS.map((c) => (
                  <Th key={c.id} alinha={c.numero ? 'direita' : 'esquerda'}>
                    <button
                      onClick={() => ordenarPor(c.id)}
                      title={c.dica ? `${c.dica} — clique para ordenar` : 'Clique para ordenar'}
                      style={{
                        background: 'none', border: 0, color: 'inherit', font: 'inherit',
                        cursor: 'pointer', padding: 0, textTransform: 'inherit',
                      }}
                    >
                      {c.rotulo}
                      {ordem.col === c.id && <span className="arrow">{ordem.desc ? ' ▼' : ' ▲'}</span>}
                    </button>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.chave}>
                  <Td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <strong style={{ fontSize: 12 }}>{c.chave}</strong>
                      <Fornecedor nome={c.fabricante || c.marca} />
                    </div>
                  </Td>
                  <Td>{c.toneladaFixa || '—'}</Td>
                  <Td numerico>1:{c.ratio}</Td>
                  <Td numerico>{c.baseCD}</Td>
                  <Td numerico>{c.colCD}</Td>
                  <Td numerico>{c.colunasNecessarias}</Td>
                  <Td
                    numerico
                    style={{
                      color: c.deficit === 0 ? 'var(--success)' : 'var(--danger)',
                      fontWeight: 700,
                    }}
                  >
                    {c.deficit > 0 ? `+${c.deficit}` : c.deficit}
                  </Td>
                  <Td numerico>{c.kits}</Td>
                  <Td numerico style={c.reversa > 0 ? { color: 'var(--orange)', fontWeight: 700 } : undefined}>
                    {c.reversa || '—'}
                  </Td>
                  <Td>
                    <SeloStatus status={c.status} />
                  </Td>
                  <Td style={{ fontWeight: c.comprarBase + c.comprarColuna > 0 ? 600 : 400 }}>
                    {textoAcao(c)}
                  </Td>
                </tr>
              ))}
              <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                <Td>TOTAL ({linhas.length})</Td>
                <Td>—</Td>
                <Td numerico>—</Td>
                <Td numerico>{total.baseCD}</Td>
                <Td numerico>{total.colCD}</Td>
                <Td numerico>{total.necessarias}</Td>
                <Td numerico style={{ color: 'var(--danger)' }}>
                  {total.necessarias - total.colCD}
                </Td>
                <Td numerico>{total.kits}</Td>
                <Td numerico style={{ color: 'var(--orange)' }}>{total.reversa}</Td>
                <Td>—</Td>
                <Td>
                  comprar {total.comprarColuna} coluna(s) e {total.comprarBase} base(s)
                </Td>
              </tr>
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}
