/* ============================================================
   Inversoes e faltas apontadas pelo SAC.

   Duas leituras, porque sao perguntas diferentes: O QUE aconteceu
   (item trocado ou peca faltando) e DE QUEM foi (operacao do CD,
   fornecedor ou cliente). So a segunda diz quem age.

   A tabela do fim lista caso a caso de proposito: as duas leituras
   saem do texto do Comentario, nao de uma coluna da planilha, entao
   quem le precisa poder conferir - e o title de cada selo mostra o
   comentario que gerou a classificacao.
   ============================================================ */
import { useCallback, useMemo, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import {
  anosDisponiveis,
  doAno,
  formatarReal,
  inversoesDeBase,
  porMes,
  porCausa,
  porTransportadora,
  causaDe,
  porResponsavel,
  ROTULO_CAUSA,
  ROTULO_RESPONSAVEL,
  tipoDoProduto,
  totalizar,
} from '../domain/divergencias';
import type { DivergenciaSAC, Responsavel } from '../domain/divergencias';
import {
  ajusteDe, identificarCaso, mapaDeAjustes, responsavelFinal, ajustesAplicados,
} from '../domain/ajustes';
import type { AjusteResponsavel } from '../domain/ajustes';
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
  destaque,
}: {
  rotulo: string;
  quantidade: number;
  valor: number;
  cor: string;
  destaque?: boolean;
}) {
  return (
    <div className={`eq-sac-numero${destaque ? ' destaque' : ''}`}>
      {/* Tira colorida no topo: identifica a origem de longe, que e
          como o painel e lido quando projetado em reuniao. */}
      <span className="eq-sac-tira" style={{ background: cor }} />
      <span className="eq-sac-rotulo">{rotulo}</span>
      <b style={{ color: cor }}>{quantidade}</b>
      <span className="eq-sac-unidade">{quantidade === 1 ? 'elevador' : 'elevadores'}</span>
      <span className="eq-sac-valor">{formatarReal(valor)}</span>
    </div>
  );
}

const RESPONSAVEIS: Responsavel[] = ['CD', 'FORNECEDOR', 'ANUNCIO', 'CLIENTE', 'APURAR'];

/* Responsavel do caso, com a saida para corrigir a mao.

   O texto do Comentario nem sempre conta a historia toda. Quando quem
   apurou sabe de quem foi e o texto nao diz, esta celula e o lugar de
   registrar - com o motivo junto, porque ajuste sem justificativa nao
   se distingue de erro de digitacao. */
function CelulaResponsavel({
  d,
  atual,
  ajuste,
  aoAjustar,
  aoDesfazer,
}: {
  d: DivergenciaSAC;
  atual: Responsavel;
  ajuste?: AjusteResponsavel;
  aoAjustar?: (a: AjusteResponsavel) => void;
  aoDesfazer?: (caso: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [escolha, setEscolha] = useState<Responsavel>(atual);
  const [motivo, setMotivo] = useState(ajuste?.motivo ?? '');
  const caso = identificarCaso(d);
  const editavel = aoAjustar != null;

  const selo = (
    <span
      className={`eq-sac-selo r-${atual.toLowerCase()}${ajuste ? ' ajustado' : ''}`}
      title={
        ajuste
          ? `Reclassificado à mão: ${ajuste.motivo || 'sem motivo informado'}`
          : d.comentario || 'sem comentário do SAC'
      }
    >
      {ROTULO_RESPONSAVEL[atual]}
      {ajuste && <b title="Definido à mão, não pelo comentário"> ✎</b>}
    </span>
  );

  if (!editavel) return selo;

  if (!aberto) {
    return (
      <button
        type="button"
        className="eq-sac-resp-botao"
        onClick={() => {
          setEscolha(atual);
          setMotivo(ajuste?.motivo ?? '');
          setAberto(true);
        }}
        title="Clique para corrigir o responsável deste caso"
      >
        {selo}
      </button>
    );
  }

  return (
    <div className="eq-sac-editor">
      <span className="eq-sac-editor-caso">Entrega {caso}</span>
      <select
        value={escolha}
        onChange={(e) => setEscolha(e.target.value as Responsavel)}
        aria-label="Responsável pelo caso"
      >
        {RESPONSAVEIS.map((r) => (
          <option key={r} value={r}>
            {ROTULO_RESPONSAVEL[r]}
          </option>
        ))}
      </select>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Por quê? (ex.: fornecedor enviou o item errado)"
        aria-label="Motivo do ajuste"
      />
      <div className="eq-sac-editor-acoes">
        <button
          type="button"
          className="btn btn-orange"
          onClick={() => {
            aoAjustar({ caso, responsavel: escolha, motivo: motivo.trim(), em: new Date().toISOString() });
            setAberto(false);
          }}
        >
          Salvar
        </button>
        {ajuste && aoDesfazer && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              aoDesfazer(caso);
              setAberto(false);
            }}
            title="Volta a classificar pelo comentário do SAC"
          >
            Voltar ao automático
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function InversoesSAC({
  divergencias,
  ajustes = [],
  aoAjustar,
  aoDesfazer,
}: {
  divergencias: DivergenciaSAC[];
  /* Reclassificacoes feitas a mao, que vencem a leitura do texto. */
  ajustes?: AjusteResponsavel[];
  aoAjustar?: (a: AjusteResponsavel) => void;
  aoDesfazer?: (caso: string) => void;
}) {
  const mapa = useMemo(() => mapaDeAjustes(ajustes), [ajustes]);
  const quemResponde = useCallback(
    (d: DivergenciaSAC) => responsavelFinal(d, mapa),
    [mapa]
  );
  const inversoes = useMemo(() => inversoesDeBase(divergencias), [divergencias]);
  const anos = useMemo(() => anosDisponiveis(inversoes), [inversoes]);
  const [ano, setAno] = useState<string>('');
  const anoAtivo = Number(ano) || anos[0] || new Date().getFullYear();

  const doAnoEscolhido = useMemo(() => doAno(inversoes, anoAtivo), [inversoes, anoAtivo]);
  const totais = useMemo(() => totalizar(doAnoEscolhido), [doAnoEscolhido]);
  const meses = useMemo(() => porMes(inversoes, anoAtivo), [inversoes, anoAtivo]);
  const transportadoras = useMemo(() => porTransportadora(doAnoEscolhido), [doAnoEscolhido]);
  const causas = useMemo(() => porCausa(doAnoEscolhido), [doAnoEscolhido]);
  const responsaveis = useMemo(
    () => porResponsavel(doAnoEscolhido, quemResponde),
    [doAnoEscolhido, quemResponde]
  );
  /* Quantos casos do recorte em tela foram reclassificados a mao. */
  const reclassificados = useMemo(
    () => ajustesAplicados(doAnoEscolhido, mapa),
    [doAnoEscolhido, mapa]
  );
  /* Casos que entraram pela emissao do pedido por falta da data de
     saida na planilha. */
  const semSaida = useMemo(
    () => doAnoEscolhido.filter((d) => d.data != null && !d.dataPelaSaida).length,
    [doAnoEscolhido]
  );
  /* O numero que a operacao e cobrada: so o que sobrou para o CD. */
  const soDoCD = useMemo(
    () => doAnoEscolhido.filter((d) => quemResponde(d) === 'CD'),
    [doAnoEscolhido, quemResponde]
  );

  /* Barras por mes, CD e lojas lado a lado, com o numero em cima de
     cada uma: o painel e projetado em reuniao, onde ninguem passa o
     cursor para descobrir o valor.

     O valor em reais desce para o eixo, embaixo do nome do mes. Como
     linha ele disputava espaco com o rotulo das barras e os dois se
     sobrepunham justamente nos meses que importam. */
  const configMes: ChartConfiguration = useMemo(
    () => ({
      type: 'bar',
      data: {
        labels: meses.map((m) => m.rotulo),
        datasets: [
          { label: 'CD', data: meses.map((m) => m.cd.quantidade), backgroundColor: COR_CD, borderRadius: 4 },
          { label: 'Lojas', data: meses.map((m) => m.lojas.quantidade), backgroundColor: COR_LOJA, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 20 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } },
          datalabels: {
            /* Zero nao vira rotulo: onze zeros na tela cansam a leitura
               e escondem os meses que importam. */
            display: (c) => Number(c.dataset.data[c.dataIndex] ?? 0) > 0,
            anchor: 'end',
            align: 'end',
            offset: 1,
            font: { weight: 700, size: 15 },
            color: (c) => (c.datasetIndex === 0 ? COR_CD : COR_LOJA),
          },
          tooltip: {
            callbacks: {
              footer: (itens) => {
                const m = meses[itens[0]?.dataIndex ?? 0];
                return m ? `Valor devolvido: ${formatarReal(m.total.valor)}` : '';
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0, font: { size: 12 } },
            title: { display: true, text: 'Elevadores', font: { size: 12 } },
            grace: '30%',
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 12 },
              /* Duas linhas: o mes e, embaixo, quanto custou. */
              callback(_v, i) {
                const m = meses[i];
                if (!m) return '';
                return m.total.quantidade > 0 ? [m.rotulo, formatarReal(m.total.valor)] : m.rotulo;
              },
            },
          },
        },
      },
    }),
    [meses]
  );

  if (divergencias.length === 0) {
    return (
      <Cartao
        titulo="Inversões e faltas apontadas pelo SAC"
        descricao="elevadores devolvidos por item trocado ou peça faltando"
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
      titulo="Inversões e faltas apontadas pelo SAC"
      descricao={
        `${inversoes.length} caso(s) de inversão ou peça faltando em ${divergencias.length} devolução(ões) · ` +
        `${soDoCD.length} apurado(s) como erro da operação · pela data de saída` +
        /* Quem le mes a mes precisa saber quantas linhas nao tem data
           de saida: elas entram pela emissao do pedido. */
        (semSaida > 0 ? ` · ${semSaida} sem data de saída, contado(s) pelo pedido` : '') +
        /* Ajuste a mao nunca em silencio: quem le o numero precisa
           saber que ele nao saiu so do texto do SAC. */
        (reclassificados > 0 ? ` · ${reclassificados} reclassificado(s) manualmente` : '')
      }
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
        <Vazio icone="🔎">Nenhuma inversão ou falta em {anoAtivo}.</Vazio>
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
              destaque
            />
          </div>

          {/* De quem foi. Vem antes da causa porque muda o dono da
              acao: conferencia no CD, tratativa com a marca ou
              orientacao na venda. */}
          <h4 className="eq-sac-titulo">Responsável apurado pelo SAC</h4>
          <div className="eq-sac-resp">
            {responsaveis.map((r) => (
              <div
                key={r.responsavel}
                className={`eq-sac-resp-item r-${r.responsavel.toLowerCase()}${r.quantidade === 0 ? ' vazio' : ''}`}
              >
                <span className="eq-sac-resp-rot">{r.rotulo}</span>
                <b>{r.quantidade}</b>
                <span className="eq-sac-resp-pct">{r.pct.toFixed(0)}% · {formatarReal(r.valor)}</span>
              </div>
            ))}
          </div>

          <h4 className="eq-sac-titulo">O que aconteceu</h4>
          <div className="eq-sac-causas">
            {causas.map((c) => (
              <div key={c.causa} className="eq-sac-causa">
                <span className={`eq-sac-selo ${c.causa === 'INVERSAO' ? 'inv' : 'falta'}`}>
                  {c.rotulo}
                </span>
                <b>{c.quantidade}</b>
                <span className="eq-sac-causa-valor">{formatarReal(c.valor)}</span>
              </div>
            ))}
          </div>

          <Grafico
            config={configMes}
            altura={250}
            rotulo={`Erros do CD por mês em ${anoAtivo}, separando CD de lojas, com o valor devolvido`}
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
                <Th>Data saída</Th>
                <Th>Origem</Th>
                <Th>Entrega</Th>
                <Th>Causa</Th>
                <Th>Responsável</Th>
                <Th>Produto</Th>
                <Th>Motivo · submotivo</Th>
                <Th>Transportadora</Th>
                <Th alinha="right">Valor</Th>
              </tr>
            </thead>
            <tbody>
              {doAnoEscolhido.map((d, i) => (
                <tr key={`${d.pedido}-${i}`}>
                  {/* Sem data de saida a linha cai na emissao do
                      pedido. O asterisco avisa, porque as duas datas
                      nao querem dizer a mesma coisa. */}
                  <Td>
                    <span
                      title={
                        d.dataPelaSaida
                          ? 'Data de saída da mercadoria'
                          : 'Sem data de saída na planilha: contado pela emissão do pedido'
                      }
                    >
                      {d.data?.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) ?? '—'}
                      {d.data && !d.dataPelaSaida && (
                        <b style={{ color: cores.semantico.ambar, marginLeft: 3 }}>*</b>
                      )}
                    </span>
                  </Td>
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
                  {/* Nem toda devolucao virou entrega: sem o Id
                      Entrega, o numero do pedido identifica a linha. */}
                  <Td>
                    <span className="mono" title={d.entrega ? `Entrega ${d.entrega}` : `Sem entrega · pedido ${d.pedido}`}>
                      {d.entrega || d.pedido}
                    </span>
                  </Td>
                  <Td>
                    <span className={`eq-sac-selo ${causaDe(d) === 'INVERSAO' ? 'inv' : 'falta'}`}>
                      {causaDe(d) ? ROTULO_CAUSA[causaDe(d)!] : '—'}
                    </span>
                  </Td>
                  <Td>
                    <CelulaResponsavel
                      d={d}
                      atual={quemResponde(d)}
                      ajuste={ajusteDe(d, mapa)}
                      aoAjustar={aoAjustar}
                      aoDesfazer={aoDesfazer}
                    />
                  </Td>
                  <Td>
                    <span className="tag tag-muted">{tipoDoProduto(d.produto)}</span>{' '}
                    <span title={d.produto}>{d.produto.slice(0, 34)}…</span>
                  </Td>
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
