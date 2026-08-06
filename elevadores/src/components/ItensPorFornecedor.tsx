/* ============================================================
   Itens por fornecedor, para a lista de compra.

   Agrupa Fornecedor -> Tonelada -> Item pai e abre os componentes
   de cada elevador, marcando o que esta descasado no CD e quantas
   pecas faltam. Passando o cursor no codigo do elevador aparece a
   foto, para o comprador ver o que esta comprando.
   ============================================================ */
import { Fragment, useMemo, useState } from 'react';
import type { Componente } from '../domain/tipos';
import { listarPorFornecedor, textoCompra, mensagemDeCompra } from '../domain/fornecedores';
import type { ItemFornecedor } from '../domain/fornecedores';
import { explicarLimite } from '../domain/kit';
import { FotoAoPassar } from './ui/FotoAoPassar';
import { CompartilharCompra } from './CompartilharCompra';
import {
  Cartao, Tabela, Th, Td, Botao, Busca, Selecao, BarraFiltros, Chips, SeloSN, Vazio,
} from './ui';

type Recorte = 'descasados' | 'todos';

const CABECALHO = [
  'Fornecedor', 'Tonelada', 'Item (elevador)', 'Descrição do elevador',
  'Componente', 'Descrição do componente', 'Tipo', 'S/N', 'Saldo CD',
  'Elevadores que usam o componente', 'Situação', 'O que comprar',
];

/* Selo curto da situacao do item, sem repetir o vocabulario do conjunto. */
function SeloSituacao({ situacao }: { situacao: ItemFornecedor['situacao'] }) {
  const tom =
    situacao === 'CASADO' ? 'tag-good' : situacao === 'DESCASADO' ? 'tag-bad' : 'tag-muted';
  return <span className={`tag ${tom}`}>{situacao}</span>;
}

/* O par pode estar casado e o produto seguir sem poder sair, porque
   falta bomba, comando ou outra peca do kit. O aviso fica ao lado da
   situacao para nao passar despercebido. */
function AvisoDeExpedicao({ item }: { item: ItemFornecedor }) {
  const frase = explicarLimite(item.montagem);
  if (!frase) return null;
  return (
    <span className="eq-forn-limite" title={frase}>
      expedir {item.expedivel}
    </span>
  );
}

export function ItensPorFornecedor({
  componentes,
  fotos,
  busca: buscaGlobal = '',
}: {
  componentes: Componente[];
  fotos: Map<string, string>;
  busca?: string;
}) {
  const [busca, setBusca] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [tonelada, setTonelada] = useState('');
  const [recorte, setRecorte] = useState<Recorte>('descasados');
  const [copiado, setCopiado] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);

  const grupos = useMemo(() => listarPorFornecedor(componentes), [componentes]);

  const fornecedores = useMemo(
    () => grupos.map((g) => g.fornecedor).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [grupos]
  );
  const toneladas = useMemo(() => {
    const t = new Set<string>();
    for (const g of grupos) for (const ton of g.toneladas) t.add(ton.tonelada);
    return [...t].sort((a, b) => (parseFloat(a.replace(',', '.')) || 0) - (parseFloat(b.replace(',', '.')) || 0));
  }, [grupos]);

  /* Aplica os filtros mantendo a arvore, para os cabecalhos de grupo
     continuarem batendo com o que ficou na tela. */
  const filtrados = useMemo(() => {
    const b = `${buscaGlobal} ${busca}`.trim().toLowerCase();
    return grupos
      .filter((g) => !fornecedor || g.fornecedor === fornecedor)
      .map((g) => {
        const tons = g.toneladas
          .filter((t) => !tonelada || t.tonelada === tonelada)
          .map((t) => {
            const itens = t.itens.filter((i) => {
              if (recorte === 'descasados' && i.situacao !== 'DESCASADO') return false;
              if (!b) return true;
              const alvo = `${i.item} ${i.nome} ${i.marca} ${i.fabricante} ${i.tonelada} ${i.componentes
                .map((c) => `${c.codigo} ${c.nome}`)
                .join(' ')}`;
              return alvo.toLowerCase().includes(b);
            });
            return {
              ...t,
              itens,
              descasados: itens.filter((i) => i.situacao === 'DESCASADO').length,
              comprarColuna: itens.reduce((s, i) => s + i.comprarColuna, 0),
              comprarBase: itens.reduce((s, i) => s + i.comprarBase, 0),
            };
          })
          .filter((t) => t.itens.length > 0);
        const itens = tons.reduce((s, t) => s + t.itens.length, 0);
        return {
          ...g,
          toneladas: tons,
          itens,
          descasados: tons.reduce((s, t) => s + t.descasados, 0),
          comprarColuna: tons.reduce((s, t) => s + t.comprarColuna, 0),
          comprarBase: tons.reduce((s, t) => s + t.comprarBase, 0),
        };
      })
      .filter((g) => g.toneladas.length > 0);
  }, [grupos, fornecedor, tonelada, recorte, busca, buscaGlobal]);

  const total = useMemo(() => {
    return {
      itens: filtrados.reduce((s, g) => s + g.itens, 0),
      descasados: filtrados.reduce((s, g) => s + g.descasados, 0),
      colunas: filtrados.reduce((s, g) => s + g.comprarColuna, 0),
      bases: filtrados.reduce((s, g) => s + g.comprarBase, 0),
      compartilhados: filtrados.reduce((s, g) => s + g.compartilhados, 0),
    };
  }, [filtrados]);

  const mensagem = useMemo(() => mensagemDeCompra(filtrados), [filtrados]);

  /* Uma linha por componente, separada por tabulacao: cola direto no
     Excel e no e-mail do fornecedor. */
  async function copiar() {
    const linhas = [CABECALHO.join('\t')];
    for (const g of filtrados) {
      for (const t of g.toneladas) {
        for (const i of t.itens) {
          for (const c of i.componentes) {
            linhas.push(
              [
                g.fornecedor, i.tonelada, i.item, i.nome, c.codigo, c.nome, c.tipo, c.sn,
                String(c.cd), String(c.paisQueUsam), i.situacao, textoCompra(i),
              ].join('\t')
            );
          }
        }
      }
    }
    try {
      await navigator.clipboard.writeText(linhas.join('\n'));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <Cartao
      titulo="Itens por fornecedor: o que comprar"
      descricao={
        `${total.itens} elevador(es) · ${total.descasados} descasado(s) no estoque · ` +
        `faltam ${total.colunas} coluna(s) e ${total.bases} base(s)`
      }
      acoes={
        <>
          <Botao aoClicar={copiar} titulo="Cola direto no Excel ou no e-mail do fornecedor">
            {copiado ? 'Copiado' : 'Copiar tabela'}
          </Botao>
          <Botao
            variante="laranja"
            aoClicar={() => setCompartilhando(true)}
            titulo="Monta a mensagem e abre no seu programa de e-mail"
          >
            Compartilhar
          </Botao>
        </>
      }
    >
      <BarraFiltros>
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar item, componente ou descrição..." />
        <Selecao valor={fornecedor} aoMudar={setFornecedor} opcoes={fornecedores} rotuloTodos="Todos os fornecedores" />
        <Selecao valor={tonelada} aoMudar={setTonelada} opcoes={toneladas} rotuloTodos="Todas as toneladas" />
        <Chips
          valor={recorte}
          aoMudar={setRecorte}
          opcoes={[
            { valor: 'descasados', rotulo: 'Só descasados' },
            { valor: 'todos', rotulo: 'Todos os itens' },
          ]}
        />
      </BarraFiltros>

      {total.compartilhados > 0 && (
        <p className="eq-forn-aviso">
          {total.compartilhados} componente(s) aparecem em mais de um elevador. O saldo do CD deles é o
          mesmo estoque nas duas linhas, então some a compra uma vez só. As linhas assim vêm marcadas
          com o sinal de repetido.
        </p>
      )}

      {filtrados.length === 0 ? (
        <Vazio icone="✅">Nenhum item descasado para os filtros escolhidos.</Vazio>
      ) : (
        <Tabela altura={620}>
          <thead>
            <tr>
              <Th largura={120}>Item (elevador)</Th>
              <Th>Descrição do elevador</Th>
              <Th largura={110}>Componente</Th>
              <Th>Descrição do componente</Th>
              <Th largura={80}>Tipo</Th>
              <Th largura={54}>S/N</Th>
              <Th alinha="direita" largura={124}>Saldo CD</Th>
              <Th largura={110}>Situação</Th>
              <Th largura={150}>O que comprar</Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((g) => (
              <Fragment key={g.fornecedor}>
                <tr className="eq-forn-cab">
                  <td colSpan={9}>
                    <strong>{g.fornecedor}</strong>
                    <span>
                      {g.itens} item(ns) · {g.descasados} descasado(s)
                      {g.comprarColuna + g.comprarBase > 0 &&
                        ` · faltam ${g.comprarColuna} coluna(s) e ${g.comprarBase} base(s)`}
                    </span>
                  </td>
                </tr>
                {g.toneladas.map((t) => (
                  <Fragment key={`${g.fornecedor}-${t.tonelada}`}>
                    <tr className="eq-forn-ton">
                      <td colSpan={9}>
                        {t.tonelada} · ratio 1:{t.ratio} · {t.itens.length} item(ns)
                        {t.descasados > 0 && ` · ${t.descasados} descasado(s)`}
                      </td>
                    </tr>
                    {t.itens.map((i) =>
                      i.componentes.map((c, indice) => (
                        <tr
                          key={`${i.item}-${c.codigo}-${indice}`}
                          className={
                            (indice === 0 ? 'eq-forn-inicio ' : '') +
                            (c.ausente ? 'eq-forn-falta ' : '') +
                            (i.situacao === 'DESCASADO' ? 'eq-forn-alerta' : '')
                          }
                        >
                          {indice === 0 && (
                            <>
                              <td className="mono eq-forn-item" rowSpan={i.componentes.length}>
                                <FotoAoPassar item={i.item} url={fotos.get(String(i.item))} />
                              </td>
                              <td className="eq-forn-nome" rowSpan={i.componentes.length}>
                                {i.nome || '—'}
                              </td>
                            </>
                          )}
                          <Td mono>
                            {c.ausente ? <span className="eq-forn-ausente">não cadastrado</span> : c.codigo}
                            {c.paisQueUsam > 1 && (
                              <span
                                className="eq-forn-repete"
                                title={`Este componente serve ${c.paisQueUsam} elevadores. O saldo do CD e o mesmo estoque em todos, entao a compra nao pode ser somada duas vezes.`}
                              >
                                ×{c.paisQueUsam}
                              </span>
                            )}
                          </Td>
                          <Td style={{ fontSize: 11.5 }} {...(c.ausente ? { className: 'eq-forn-ausente' } : {})}>
                            {c.nome || '—'}
                          </Td>
                          <Td>
                            <span
                              className={`tag ${
                                c.tipo === 'BASE' ? 'tag-blue' : c.tipo === 'COLUNA' ? 'tag-orange' : 'tag-muted'
                              }`}
                            >
                              {c.tipo}
                            </span>
                          </Td>
                          <Td>{c.sn === 'S' || c.sn === 'N' ? <SeloSN valor={c.sn} /> : '—'}</Td>
                          <td
                            className={
                              'mono eq-forn-saldo' +
                              (indice === 0 ? ' inicio' : '') +
                              (indice === i.componentes.length - 1 ? ' fim' : '') +
                              (c.cd === 0 ? ' zerado' : '')
                            }
                          >
                            {c.cd}
                            {indice === i.componentes.length - 1 && (
                              <span className="eq-forn-saldo-total">
                                {i.bases} base · {i.colunas} coluna
                              </span>
                            )}
                          </td>
                          {indice === 0 && (
                            <>
                              <td className="eq-forn-sit" rowSpan={i.componentes.length}>
                                <SeloSituacao situacao={i.situacao} />
                                <AvisoDeExpedicao item={i} />
                              </td>
                              <td
                                className={`eq-forn-compra${i.comprarBase + i.comprarColuna > 0 ? ' falta' : ''}`}
                                rowSpan={i.componentes.length}
                                title={`${i.bases} base(s) e ${i.colunas} coluna(s) no CD, ratio 1:${i.ratio}`}
                              >
                                {textoCompra(i)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    )}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </Tabela>
      )}

      {compartilhando && (
        <CompartilharCompra
          mensagem={mensagem}
          assunto={`Itens descasados no CD - faltam ${total.colunas} coluna(s) e ${total.bases} base(s)`}
          grupos={filtrados}
          aoFechar={() => setCompartilhando(false)}
        />
      )}
    </Cartao>
  );
}
