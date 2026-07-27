/* ============================================================
   Tela dos elevadores (itens pai): foto do produto, marca,
   tonelada, situacao do conjunto e da valoracao.
   ============================================================ */
import { useMemo, useState } from 'react';
import { agruparConjuntos } from '../domain/equalizacao';
import { auditarValoracao } from '../domain/valoracao';
import type { Componente, StatusConjunto, DiagnosticoValoracao } from '../domain/tipos';
import { Cartao, SeloStatus, SeloValoracao, Fornecedor, Vazio, BarraFiltros, Busca, Chips } from '../components/ui';

type Filtro = 'todos' | 'corrigir' | 'descasado';

/* A foto vem do catalogo publico. Quando a rede da empresa bloqueia o
   endereco, mostra o aviso no lugar de deixar o espaco quebrado. */
function FotoProduto({ url, nome }: { url?: string; nome: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!url || falhou) {
    return <span className="eq-foto-erro">{url ? 'Foto indisponível nesta rede' : 'Sem foto cadastrada'}</span>;
  }
  return (
    <img
      src={url}
      alt={nome}
      loading="lazy"
      style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
      onError={() => setFalhou(true)}
    />
  );
}

export function Elevadores({
  componentes,
  fotos,
  busca: buscaGlobal,
}: {
  componentes: Componente[];
  fotos: Map<string, string>;
  busca: string;
}) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const elevadores = useMemo(() => {
    const conjuntos = new Map(agruparConjuntos(componentes).map((c) => [c.chave, c]));
    const valoracoes = new Map(auditarValoracao(componentes).map((v) => [v.itemVolMultiplo, v]));
    const vistos = new Map<
      string,
      {
        item: string;
        nome: string;
        marca: string;
        fabricante: string;
        ton: string;
        status: StatusConjunto;
        diagnostico: DiagnosticoValoracao;
      }
    >();
    for (const c of componentes) {
      if (!c.itemVolMultiplo || vistos.has(c.itemVolMultiplo)) continue;
      vistos.set(c.itemVolMultiplo, {
        item: c.itemVolMultiplo,
        nome: c.nomeItemVolMultiplo,
        marca: c.marca,
        fabricante: c.fabricante,
        ton: c.toneladaFixa,
        status: conjuntos.get(c.chave)?.status ?? 'SEM ESTOQUE',
        diagnostico: valoracoes.get(c.itemVolMultiplo)?.diagnostico ?? 'SEM S',
      });
    }
    return [...vistos.values()];
  }, [componentes]);

  const filtrados = useMemo(() => {
    const b = `${buscaGlobal} ${busca}`.trim().toLowerCase();
    return elevadores.filter((e) => {
      if (filtro === 'corrigir' && e.diagnostico !== 'CORRIGIR') return false;
      if (filtro === 'descasado' && e.status !== 'DESCASADO') return false;
      if (!b) return true;
      return `${e.item} ${e.nome} ${e.marca} ${e.fabricante} ${e.ton}`.toLowerCase().includes(b);
    });
  }, [elevadores, busca, buscaGlobal, filtro]);

  return (
    <Cartao
      titulo={`Elevadores (${filtrados.length} de ${elevadores.length})`}
      descricao="Cada item pai do projeto, com a foto do catálogo e a situação do conjunto a que pertence."
    >
      <BarraFiltros>
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar código, nome ou marca..." />
        <Chips
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { valor: 'todos', rotulo: 'Todos' },
            { valor: 'corrigir', rotulo: 'Valoração a corrigir' },
            { valor: 'descasado', rotulo: 'Conjunto descasado' },
          ]}
        />
      </BarraFiltros>

      {filtrados.length === 0 ? (
        <Vazio icone="🔎">Nenhum elevador encontrado com esses filtros.</Vazio>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: 12,
          }}
        >
          {filtrados.map((e) => {
            const foto = fotos.get(String(e.item));
            return (
              <article
                key={e.item}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    height: 130,
                    background: '#fff',
                    borderBottom: '1px solid var(--line)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <FotoProduto url={foto} nome={e.nome} />
                </div>
                <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 12.5 }}>
                    {e.item}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: 'var(--ink-soft)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                    title={e.nome}
                  >
                    {e.nome || '—'}
                  </div>
                  <Fornecedor nome={e.fabricante || e.marca} />
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
                    <span className="tag tag-muted">{e.ton || '—'}</span>
                    <SeloStatus status={e.status} />
                    <SeloValoracao diagnostico={e.diagnostico} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Cartao>
  );
}
