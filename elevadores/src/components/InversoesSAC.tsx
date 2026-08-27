/* ============================================================
   Inversoes e faltas apontadas pelo SAC.

   O cartao e o DETALHE das devolucoes: por fornecedor, por
   transportadora e caso a caso. A leitura de resultado - quanto caiu,
   mes a mes - mora no cartao "Evolucao das divergencias", no Status do
   Projeto, e nao se repete aqui.

   O topo ja teve tres numeros grandes (CD, lojas, total), os quadros
   de responsavel apurado, os selos de causa e um grafico de barras por
   mes. Tudo saiu junto: o grafico repetia a curva do outro cartao, e
   os quadros de responsavel e de causa davam ares de apuracao a uma
   classificacao que sai de texto livre. Como numero grande no topo do
   cartao, eles pareciam medida; na coluna da tabela, ao lado do
   comentario que os gerou, aparecem pelo que sao.

   A tabela do fim lista caso a caso de proposito: a classificacao sai
   do texto do Comentario, nao de uma coluna da planilha, entao quem le
   precisa poder conferir - e o title de cada selo mostra o comentario
   que gerou a classificacao.
   ============================================================ */
import { Fragment, useCallback, useMemo, useState } from 'react';
import {
  anosDisponiveis,
  doAno,
  formatarReal,
  divergenciasDoCD,
  porTransportadora,
  causaDe,
  ROTULO_CAUSA,
  ROTULO_RESPONSAVEL,
  tipoDoProduto,
} from '../domain/divergencias';
import type { DivergenciaSAC, Responsavel } from '../domain/divergencias';
import {
  ajusteDe, identificarCaso, mapaDeAjustes, responsavelFinal,
  casosConsiderados, casosDesconsiderados, reclassificadosEmTela, FORA,
  forasDaPlanilha, origemDaExclusao,
} from '../domain/ajustes';
import type { AjusteCaso, Decisao } from '../domain/ajustes';
import type { Componente } from '../domain/tipos';
import { divergenciasPorFornecedor } from '../domain/divergenciasPorFornecedor';
import { cores } from '../config/tokens';
import { Cartao, Selecao, Tabela, Td, Th, Vazio } from './ui';

/* Selo de origem na tabela detalhada: navy para o CD, laranja para
   loja. */
const COR_CD = cores.navy.base;
const COR_LOJA = cores.laranja.base;

/* As decisoes que a celula oferece. "Desconsiderar" vem por ultimo e
   separado: ela nao troca a gaveta, tira o caso do painel. */
const DECISOES: { valor: Decisao; rotulo: string }[] = [
  { valor: 'CD', rotulo: ROTULO_RESPONSAVEL.CD },
  { valor: 'FORNECEDOR', rotulo: ROTULO_RESPONSAVEL.FORNECEDOR },
  { valor: 'ANUNCIO', rotulo: ROTULO_RESPONSAVEL.ANUNCIO },
  { valor: 'CLIENTE', rotulo: ROTULO_RESPONSAVEL.CLIENTE },
  { valor: 'APURAR', rotulo: ROTULO_RESPONSAVEL.APURAR },
  { valor: FORA, rotulo: 'Desconsiderar — não entra no painel' },
];

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
  ajuste?: AjusteCaso;
  aoAjustar?: (a: AjusteCaso) => void;
  aoDesfazer?: (caso: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [escolha, setEscolha] = useState<Decisao>(atual);
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
        onChange={(e) => setEscolha(e.target.value as Decisao)}
        aria-label="Responsável pelo caso"
      >
        {DECISOES.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
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
            aoAjustar({ caso, decisao: escolha, motivo: motivo.trim(), em: new Date().toISOString() });
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
  componentes = [],
  ajustes = [],
  aoAjustar,
  aoDesfazer,
}: {
  divergencias: DivergenciaSAC[];
  /* Base mestre: e dela que sai o fornecedor de cada produto. A aba do
     SAC nao tem essa coluna. */
  componentes?: Componente[];
  /* Reclassificacoes feitas a mao, que vencem a leitura do texto. */
  ajustes?: AjusteCaso[];
  aoAjustar?: (a: AjusteCaso) => void;
  aoDesfazer?: (caso: string) => void;
}) {
  const mapa = useMemo(() => mapaDeAjustes(ajustes), [ajustes]);
  const quemResponde = useCallback(
    (d: DivergenciaSAC) => responsavelFinal(d, mapa),
    [mapa]
  );
  const detectados = useMemo(() => divergenciasDoCD(divergencias), [divergencias]);
  /* Entregas que a propria planilha marcou para nao considerar, pela
     coluna "Considerar ?".

     Tudo que a tela mostra sai da lista ja filtrada: o caso tirado nao
     pode sobreviver em nenhum canto do cartao. Filtrar so a tabela e
     deixar o grafico e os totais contando seria pior do que nao ter a
     funcao, porque pareceria resolvido. */
  const foraNaPlanilha = useMemo(() => forasDaPlanilha(detectados), [detectados]);
  const inversoes = useMemo(
    () => casosConsiderados(detectados, mapa, foraNaPlanilha),
    [detectados, mapa, foraNaPlanilha]
  );
  const anos = useMemo(() => anosDisponiveis(detectados), [detectados]);
  const [ano, setAno] = useState<string>('');
  /* A lista dos produtos sem fornecedor comeca fechada: ela e o
     detalhe de uma linha so, e aberta por padrao empurraria a tabela
     do fornecedor para fora da tela. */
  const [verSemCadastro, setVerSemCadastro] = useState(false);
  const anoAtivo = Number(ano) || anos[0] || new Date().getFullYear();

  const doAnoEscolhido = useMemo(() => doAno(inversoes, anoAtivo), [inversoes, anoAtivo]);
  const transportadoras = useMemo(() => porTransportadora(doAnoEscolhido), [doAnoEscolhido]);
  const fornecedores = useMemo(
    () => divergenciasPorFornecedor(doAnoEscolhido, componentes),
    [doAnoEscolhido, componentes]
  );
  /* Quantos casos do recorte em tela tiveram o responsavel trocado. */
  const reclassificados = useMemo(
    () => reclassificadosEmTela(doAnoEscolhido, mapa),
    [doAnoEscolhido, mapa]
  );
  /* Os que sairam do painel, no mesmo ano em tela. Ficam listados
     abaixo da tabela: decisao escondida sem rastro vira numero que
     ninguem consegue explicar depois. */
  const foraDoPainel = useMemo(
    () => casosDesconsiderados(doAno(detectados, anoAtivo), mapa, foraNaPlanilha),
    [detectados, anoAtivo, mapa, foraNaPlanilha]
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
        (reclassificados > 0 ? ` · ${reclassificados} reclassificado(s) manualmente` : '') +
        (foraDoPainel.length > 0 ? ` · ${foraDoPainel.length} desconsiderado(s)` : '')
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
          {/* Os tres numeros do topo, o responsavel apurado, a causa e
              o grafico de barras por mes sairam daqui.

              Os quatro contavam a mesma historia que o cartao
              "Evolucao das divergencias" ja conta no Status do Projeto,
              e com menos qualidade: o grafico de barras repetia a
              curva, e os selos de responsavel e de causa vinham da
              leitura do texto livre do SAC - a parte estimada, exposta
              como se fosse apuracao. Sobraram as tabelas, que sao o
              detalhe que ninguem tem em outro lugar: fornecedor,
              transportadora e o caso a caso conferivel. */}
          {/* De qual fornecedor era o elevador que voltou.

              Nao e o mesmo que "de quem foi a culpa": isso continua em
              "Responsavel apurado pelo SAC", logo acima. Aqui o
              fornecedor vem do cruzamento do codigo do produto com a
              base mestre, porque a aba do SAC nao traz essa coluna. */}
          <h4 className="eq-sac-titulo">Divergências por fornecedor</h4>
          {componentes.length === 0 ? (
            <Vazio icone="🏭">
              Importe a aba <b>Multiplos</b> para cruzar o produto devolvido com o
              fornecedor. A aba do SAC não traz essa coluna.
            </Vazio>
          ) : fornecedores.linhas.length === 0 ? (
            <Vazio icone="🏭">Nenhum caso no ano escolhido.</Vazio>
          ) : (
            <>
              <Tabela>
                <thead>
                  <tr>
                    <Th>Fornecedor</Th>
                    <Th alinha="right">Casos</Th>
                    <Th alinha="right">Participação</Th>
                    <Th alinha="right">Custo</Th>
                  </tr>
                </thead>
                <tbody>
                  {fornecedores.linhas.map((f) => (
                    <Fragment key={f.fornecedor}>
                      <tr className={f.semCadastro ? 'eq-sac-sem-cadastro' : undefined}>
                        <Td>
                          {f.semCadastro ? (
                            /* A linha abre a lista dos produtos que nao
                               casaram: o numero sozinho nao diz o que
                               cadastrar, a descricao diz. */
                            <button
                              className="eq-sac-abrir"
                              onClick={() => setVerSemCadastro((v) => !v)}
                              aria-expanded={verSemCadastro}
                              title="Ver quais produtos ficaram sem fornecedor"
                            >
                              <i>{f.fornecedor}</i>
                              <span aria-hidden="true">{verSemCadastro ? '▲' : '▼'}</span>
                            </button>
                          ) : (
                            f.fornecedor
                          )}
                        </Td>
                        <Td alinha="right" numerico>{f.quantidade}</Td>
                        <Td alinha="right" numerico>{f.pct.toFixed(0)}%</Td>
                        <Td alinha="right" numerico>{formatarReal(f.valor)}</Td>
                      </tr>
                      {f.semCadastro && verSemCadastro && (
                        <tr className="eq-sac-sem-cadastro">
                          <td colSpan={4} className="eq-sac-itens">
                            <table>
                              <thead>
                                <tr>
                                  <th>Código</th>
                                  <th>Descrição do produto devolvido</th>
                                  <th>Casos</th>
                                  <th>Custo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fornecedores.itensSemCadastro.map((i) => (
                                  <tr key={i.codigo || i.produto}>
                                    <td className="mono">{i.codigo || <i>sem código</i>}</td>
                                    <td>{i.produto || <i>sem descrição na planilha do SAC</i>}</td>
                                    <td className="mono">{i.quantidade}</td>
                                    <td className="mono">{formatarReal(i.valor)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </Tabela>
              {/* O tamanho da lacuna fica escrito. Sem isso, um ranking
                  montado sobre metade dos casos pareceria completo. */}
              {fornecedores.semCadastro > 0 && (
                <p className="eq-sac-nota">
                  {fornecedores.semCadastro} de {fornecedores.total} caso(s) ({fornecedores.pctSemCadastro.toFixed(0)}%)
                  ficaram sem fornecedor: o código do produto devolvido não foi
                  encontrado na aba <b>Multiplos</b>, ou o item está lá sem
                  fabricante preenchido.
                  {fornecedores.pctSemCadastro >= 30 && (
                    <> <b>Acima de um terço dos casos, o ranking acima não representa o total.</b></>
                  )}
                </p>
              )}
            </>
          )}

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

          {/* Os casos tirados do painel. Ficam listados de proposito:
              numero corrigido sem rastro e indistinguivel de numero
              errado, e daqui a um mes ninguem lembra por que a conta
              nao fecha com a planilha. */}
          {foraDoPainel.length > 0 && (
            <>
              <h4 className="eq-sac-titulo">
                Desconsiderados em {anoAtivo} ({foraDoPainel.length}) — fora de todos os números acima
              </h4>
              <div className="eq-sac-fora">
                {foraDoPainel.map((d, i) => {
                  const caso = identificarCaso(d);
                  const a = ajusteDe(d, mapa);
                  const origem = origemDaExclusao(d, mapa, foraNaPlanilha);
                  const daPlanilha = origem === 'PLANILHA';
                  return (
                    <div key={`${caso}-${i}`} className="eq-sac-fora-item">
                      <div>
                        <span className="mono">{caso}</span>
                        <span className="eq-sac-fora-produto" title={d.produto}>
                          {d.produto.slice(0, 46)}
                          {d.produto.length > 46 ? '…' : ''}
                        </span>
                        {/* De onde veio a decisao: as duas se corrigem
                            em lugares diferentes. */}
                        <span className={`tag${daPlanilha ? '' : ' tag-muted'}`}>
                          {daPlanilha ? 'Planilha · Considerar? = Não' : 'Ajuste no painel'}
                        </span>
                        <span className="eq-sac-fora-motivo">
                          {daPlanilha ? '' : a?.motivo || 'sem motivo informado'}
                        </span>
                      </div>
                      <div className="eq-sac-fora-lado">
                        <span className="mono">{formatarReal(d.valor)}</span>
                        {/* Exclusao vinda da planilha se desfaz na
                            planilha: o botao aqui daria a impressao de
                            resolver e seria desfeito na importacao
                            seguinte. */}
                        {aoDesfazer && !daPlanilha && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => aoDesfazer(caso)}
                            title="Volta a contar este caso no painel"
                          >
                            Voltar a contar
                          </button>
                        )}
                        {daPlanilha && (
                          <span title="Para voltar a contar, mude a coluna Considerar ? para Sim e importe de novo">
                            muda na planilha
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </Cartao>
  );
}
