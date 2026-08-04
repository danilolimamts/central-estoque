/* ============================================================
   Tela dos elevadores (itens pai): foto do produto, marca,
   tonelada, situacao do conjunto e da valoracao.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { agruparConjuntos, contarElevadoresPorItem } from '../domain/equalizacao';
import type { ContagemItem } from '../domain/equalizacao';
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
  return <img src={url} alt={nome} loading="lazy" onError={() => setFalhou(true)} />;
}

const VAZIO: ContagemItem = {
  bases: 0, colunas: 0, ratio: 1, completos: 0, basesSobrando: 0, colunasSobrando: 0,
};

/* Frase que explica de onde saiu a quantidade, no titulo do selo. */
function explicarQuantidade(q: ContagemItem): string {
  const base = `${q.bases} base(s) e ${q.colunas} coluna(s) no CD, ratio 1:${q.ratio}`;
  if (q.completos === 0) return `Nenhum elevador completo: ${base}.`;
  const sobra: string[] = [];
  if (q.basesSobrando > 0) sobra.push(`${q.basesSobrando} base(s)`);
  if (q.colunasSobrando > 0) sobra.push(`${q.colunasSobrando} coluna(s)`);
  return `${q.completos} elevador(es) montado(s) com ${base}.` +
    (sobra.length > 0 ? ` Sobram ${sobra.join(' e ')} sem par.` : '');
}

interface FotoAmpliada {
  url: string;
  item: string;
  nome: string;
  legenda: string;
}

/* Foto em tamanho grande sobre a tela. Fecha no Esc, no botao e ao
   clicar fora, que sao os tres jeitos que a pessoa tenta. */
function LupaFoto({ foto, aoFechar }: { foto: FotoAmpliada; aoFechar: () => void }) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar();
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);

  return (
    <div className="eq-lupa-fundo" role="dialog" aria-modal="true" aria-label={foto.nome} onClick={aoFechar}>
      <div className="eq-lupa" onClick={(e) => e.stopPropagation()}>
        <div className="eq-lupa-imagem">
          <img src={foto.url} alt={foto.nome} />
        </div>
        <div className="eq-lupa-rodape">
          <div>
            <h3>{foto.nome || foto.item}</h3>
            <p>
              <span className="mono">{foto.item}</span> · {foto.legenda}
            </p>
          </div>
          <button className="eq-lupa-fechar" onClick={aoFechar} title="Fechar" aria-label="Fechar a foto" autoFocus>
            ×
          </button>
        </div>
      </div>
    </div>
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
  const [ampliada, setAmpliada] = useState<FotoAmpliada | null>(null);

  const elevadores = useMemo(() => {
    const conjuntos = new Map(agruparConjuntos(componentes).map((c) => [c.chave, c]));
    const valoracoes = new Map(auditarValoracao(componentes).map((v) => [v.itemVolMultiplo, v]));
    const quantidades = contarElevadoresPorItem(componentes);
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
        quantidade: ContagemItem;
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
        quantidade: quantidades.get(c.itemVolMultiplo) ?? VAZIO,
      });
    }
    /* Quem tem elevador montado aparece primeiro: e o que a reuniao pergunta. */
    return [...vistos.values()].sort(
      (a, z) => z.quantidade.completos - a.quantidade.completos || a.item.localeCompare(z.item, 'pt-BR')
    );
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
        <div className="eq-elev-grade">
          {filtrados.map((e) => {
            const foto = fotos.get(String(e.item));
            const q = e.quantidade;
            return (
              <article key={e.item} className="eq-elev-card">
                <div className="eq-elev-foto">
                  <FotoProduto url={foto} nome={e.nome} />
                  {foto && (
                    <button
                      className="eq-elev-lupa"
                      title="Clique para ver a foto ampliada"
                      aria-label={`Ampliar a foto de ${e.nome || e.item}`}
                      onClick={() =>
                        setAmpliada({
                          url: foto,
                          item: e.item,
                          nome: e.nome,
                          legenda: explicarQuantidade(q),
                        })
                      }
                    />
                  )}
                </div>
                <div className="eq-elev-corpo">
                  {/* Ordem fixa do cartao: foto, nome e quantidade. Nada
                      escrito por cima da imagem. */}
                  <div className="eq-elev-nome" title={e.nome}>
                    {e.nome || '—'}
                  </div>
                  <div
                    className={`eq-elev-qtd${q.completos === 0 ? ' zero' : ''}`}
                    title={explicarQuantidade(q)}
                  >
                    <b>{q.completos}</b>
                    <span>{q.completos === 1 ? 'Elevador' : 'Elevadores'}</span>
                  </div>
                  <div className="mono eq-elev-cod">{e.item}</div>
                  <div className="eq-elev-pecas" title={explicarQuantidade(q)}>
                    {q.bases} base(s) · {q.colunas} coluna(s) no CD
                  </div>
                  <Fornecedor nome={e.fabricante || e.marca} />
                  <div className="eq-elev-tags">
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

      {ampliada && <LupaFoto foto={ampliada} aoFechar={() => setAmpliada(null)} />}
    </Cartao>
  );
}
