import { useEffect, useRef, useState } from 'react';
import {
  bordaMaisProxima, CORES_DO_FLUXO, escreverFluxo, fluxoVazio, lerFluxo, limitesDoFluxo,
  noDeImagem, noNovo, proximaPosicao, rotuloDaForma,
} from '@/dominio/fluxo';
import { imagemDoEvento, reduzirImagem } from '@/lib/imagemColada';
import type { Fluxo, FormaDoNo, NoDoFluxo } from '@/dominio/fluxo';

interface Props {
  conteudo: string;
  editando: boolean;
  aoMudar: (conteudo: string) => void;
}

const FORMAS: FormaDoNo[] = ['inicio', 'caixa', 'decisao', 'nota'];

/* Quadro de fluxo com blocos que se arrastam e setas que os ligam, no
   espirito do Miro. Usa mouse e SVG direto, sem biblioteca de diagrama:
   o que a operacao desenha aqui sao caixas, losangos e setas, e isso
   cabe em algumas dezenas de linhas.

   O conteudo antigo era o codigo de um diagrama escrito em texto; ele
   continua legivel na tela, com um botao para comecar o quadro novo, em
   vez de sumir com o que ja estava escrito. */
export default function Fluxograma({ conteudo, editando, aoMudar }: Props) {
  const [fluxo, setFluxo] = useState<Fluxo>(() => lerFluxo(conteudo) ?? fluxoVazio());
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [ligandoDe, setLigandoDe] = useState<string | null>(null);
  /* O arrasto so comeca depois de alguns pixels de movimento. Sem essa
     folga, um clique simples ja empurrava o bloco para o encaixe de 10
     em 10 px: o ponteiro terminava fora dele, o navegador mandava o
     clique para o fundo do quadro e a selecao se perdia no ato. */
  const FOLGA = 4;
  const arrastando = useRef<{ id: string; dx: number; dy: number; x: number; y: number; moveu: boolean } | null>(null);
  /* Puxar o canto muda o tamanho; e o gesto que se espera de um quadro
     assim, e evita ficar clicando em + e − para chegar ao tamanho certo. */
  const esticando = useRef<{ id: string; x: number; y: number; largura: number; altura: number } | null>(null);
  /* Um clique que comeca no bloco e termina um pixel fora dele chega ao
     fundo do quadro como clique do fundo. Sem saber onde o gesto
     comecou, isso limpava a selecao que o proprio clique acabara de
     fazer. */
  const comecouNoFundo = useRef(false);
  const tela = useRef<HTMLDivElement>(null);
  const [avisoDaImagem, setAvisoDaImagem] = useState<string | null>(null);
  /* Aproximacao do quadro. O desenho cresce para os lados conforme se
     adicionam blocos, e a altura do bloco na pagina e fixa: sem afastar,
     um fluxo grande so se ve pela barra de rolagem. Fica no navegador
     porque e preferencia de quem olha, nao parte do desenho. */
  const [zoom, setZoom] = useState(() => {
    const guardado = Number(localStorage.getItem('projetos.zoom-fluxo'));
    return guardado >= 0.4 && guardado <= 2 ? guardado : 1;
  });

  function aproximar(passo: number) {
    setZoom((atual) => {
      const novo = Math.min(2, Math.max(0.4, Math.round((atual + passo) * 10) / 10));
      try { localStorage.setItem('projetos.zoom-fluxo', String(novo)); } catch { /* sem espaço: só não lembra */ }
      return novo;
    });
  }

  const legado = lerFluxo(conteudo) === null && conteudo.trim() !== '';

  /* Conteudo vindo de fora (troca de pagina, restauracao de versao)
     substitui o desenho; o que o proprio editor grava nao volta por
     aqui, senao o bloco piscaria a cada arrastada. */
  useEffect(() => {
    const lido = lerFluxo(conteudo);
    if (lido && escreverFluxo(lido) !== escreverFluxo(fluxo)) setFluxo(lido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteudo]);

  function gravar(novo: Fluxo) {
    setFluxo(novo);
    aoMudar(escreverFluxo(novo));
  }

  function adicionar(forma: FormaDoNo) {
    const posicao = proximaPosicao(fluxo);
    const no = noNovo(forma, posicao.x, posicao.y);
    gravar({ ...fluxo, nos: [...fluxo.nos, no] });
    setSelecionado(no.id);
  }

  function alterarNo(id: string, mudanca: Partial<NoDoFluxo>) {
    gravar({ ...fluxo, nos: fluxo.nos.map((n) => (n.id === id ? { ...n, ...mudanca } : n)) });
  }

  function removerNo(id: string) {
    gravar({
      nos: fluxo.nos.filter((n) => n.id !== id),
      /* Seta sem uma das pontas nao existe: some junto com o bloco. */
      ligacoes: fluxo.ligacoes.filter((l) => l.de !== id && l.para !== id),
    });
    setSelecionado(null);
  }

  function ligar(paraId: string) {
    if (!ligandoDe || ligandoDe === paraId) { setLigandoDe(null); return; }
    const repetida = fluxo.ligacoes.some((l) => l.de === ligandoDe && l.para === paraId);
    if (!repetida) {
      gravar({
        ...fluxo,
        ligacoes: [...fluxo.ligacoes, { id: crypto.randomUUID(), de: ligandoDe, para: paraId, rotulo: '' }],
      });
    }
    setLigandoDe(null);
  }

  /* Colar print direto no quadro. Sem botao e sem anexo: copia-se a
     tela do coletor e cola-se aqui, que e como a pessoa ja trabalha.
     A imagem entra reduzida, como um bloco que se arrasta e se liga
     como qualquer outro. */
  async function colar(evento: React.ClipboardEvent) {
    if (!editando) return;
    const arquivo = imagemDoEvento(evento);
    if (!arquivo) return;
    evento.preventDefault();
    setAvisoDaImagem(null);
    try {
      const reduzida = await reduzirImagem(arquivo);
      const posicao = proximaPosicao(fluxo);
      const no = noDeImagem(reduzida.dados, reduzida.largura, reduzida.altura, posicao.x, posicao.y);
      gravar({ ...fluxo, nos: [...fluxo.nos, no] });
      setSelecionado(no.id);
    } catch (falha) {
      setAvisoDaImagem(falha instanceof Error ? falha.message : 'Não consegui colar esta imagem.');
    }
  }

  /* Mudar o tamanho sem mexer na proporcao, que e o que se quer tanto
     para encaixar um print quanto para dar espaco a um texto maior. */
  function redimensionar(no: NoDoFluxo, fator: number) {
    const largura = Math.round(Math.min(900, Math.max(60, no.largura * fator)));
    const altura = Math.round(Math.min(700, Math.max(30, (no.altura * largura) / no.largura)));
    alterarNo(no.id, { largura, altura });
  }

  /* O giro fica entre 0 e 359 para o rotulo do botao nao virar "-45°"
     nem "375°". */
  function girar(no: NoDoFluxo, graus: number) {
    alterarNo(no.id, { rotacao: (((no.rotacao ?? 0) + graus) % 360 + 360) % 360 });
  }

  function comecarArrasto(e: React.MouseEvent, no: NoDoFluxo) {
    if (!editando) return;
    const area = tela.current?.getBoundingClientRect();
    if (!area) return;
    arrastando.current = {
      id: no.id,
      dx: (e.clientX - area.left) / zoom - no.x,
      dy: (e.clientY - area.top) / zoom - no.y,
      x: e.clientX,
      y: e.clientY,
      moveu: false,
    };
    setSelecionado(no.id);
  }

  function moverArrasto(e: React.MouseEvent) {
    const puxando = esticando.current;
    if (puxando) {
      const largura = Math.round(Math.min(900, Math.max(60, puxando.largura + (e.clientX - puxando.x) / zoom)));
      const altura = Math.round(Math.min(700, Math.max(30, puxando.altura + (e.clientY - puxando.y) / zoom)));
      setFluxo((f) => ({
        ...f,
        nos: f.nos.map((n) => (n.id === puxando.id ? { ...n, largura, altura } : n)),
      }));
      return;
    }

    const atual = arrastando.current;
    const area = tela.current?.getBoundingClientRect();
    if (!atual || !area) return;
    if (!atual.moveu) {
      if (Math.abs(e.clientX - atual.x) < FOLGA && Math.abs(e.clientY - atual.y) < FOLGA) return;
      atual.moveu = true;
    }
    const x = Math.max(0, (e.clientX - area.left) / zoom - atual.dx);
    const y = Math.max(0, (e.clientY - area.top) / zoom - atual.dy);
    /* Encaixe de 10 em 10 px: alinha os blocos sem precisar de mira. */
    setFluxo((f) => ({
      ...f,
      nos: f.nos.map((n) => (n.id === atual.id
        ? { ...n, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 }
        : n)),
    }));
  }

  function terminarArrasto() {
    const mexeu = arrastando.current?.moveu || !!esticando.current;
    arrastando.current = null;
    esticando.current = null;
    /* Clique sem arrasto nao mudou desenho nenhum: gravar aqui marcaria
       a pagina como alterada so por alguem ter selecionado um bloco. */
    if (mexeu) aoMudar(escreverFluxo(fluxo));
  }

  const { largura, altura } = limitesDoFluxo(fluxo);
  const noSelecionado = fluxo.nos.find((n) => n.id === selecionado) ?? null;

  if (legado) {
    return (
      <div className="rounded-xl border border-linha bg-white p-3">
        <p className="mb-2 text-xs text-tinta-suave">
          Este fluxo foi escrito no formato antigo, em texto. O conteúdo está preservado abaixo.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-papel p-3 text-xs">{conteudo}</pre>
        {editando && (
          <button
            className="botao-primario mt-3 py-1 text-xs"
            onClick={() => gravar(fluxoVazio())}
          >Começar o quadro novo</button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-linha bg-white">
      {editando && (
        <div className="flex flex-wrap items-center gap-2 border-b border-linha px-3 py-2">
          {FORMAS.map((forma) => (
            <button
              key={forma}
              className="rounded-lg border border-linha px-2 py-1 text-[11px] font-bold text-tinta-suave hover:border-roxo hover:text-roxo-escuro"
              onClick={() => adicionar(forma)}
            >+ {rotuloDaForma[forma]}</button>
          ))}

          <span className="mx-1 h-4 w-px bg-linha" />

          {/* Tamanho da tela do quadro: afastar cabe mais desenho na
              mesma altura de bloco; aproximar volta ao detalhe. */}
          <span className="flex items-center gap-1" title="Tamanho da tela do quadro">
            <button
              className="rounded-lg border border-linha px-2 py-1 text-[11px] font-bold text-tinta-suave hover:border-roxo hover:text-roxo-escuro"
              onClick={() => aproximar(-0.1)} disabled={zoom <= 0.4}
            >−</button>
            <button
              className="rounded-lg px-1 text-[11px] font-bold text-tinta-suave hover:text-roxo-escuro"
              onClick={() => aproximar(1 - zoom)} title="Voltar a 100%"
            >{Math.round(zoom * 100)}%</button>
            <button
              className="rounded-lg border border-linha px-2 py-1 text-[11px] font-bold text-tinta-suave hover:border-roxo hover:text-roxo-escuro"
              onClick={() => aproximar(0.1)} disabled={zoom >= 2}
            >+</button>
          </span>

          <span className="mx-1 h-4 w-px bg-linha" />

          {noSelecionado ? (
            <>
              {noSelecionado.forma === 'imagem' ? (
                <span className="text-[11px] font-bold text-tinta-suave">Imagem colada</span>
              ) : (
                <>
                  <input
                    className="campo w-44 py-1 text-xs" value={noSelecionado.texto}
                    onChange={(e) => alterarNo(noSelecionado.id, { texto: e.target.value })}
                    placeholder="Texto do bloco"
                  />
                  {/* Cores da casa a um clique e, ao lado, o seletor do
                      sistema para qualquer outra. */}
                  <span className="flex items-center gap-1">
                    {CORES_DO_FLUXO.map((c) => (
                      <button
                        key={c.valor}
                        title={c.nome}
                        onClick={() => alterarNo(noSelecionado.id, { cor: c.valor })}
                        className={`h-5 w-5 rounded-full border-2 ${
                          noSelecionado.cor === c.valor ? 'border-navy' : 'border-white'
                        }`}
                        style={{ backgroundColor: c.valor }}
                      />
                    ))}
                    <input
                      type="color" className="h-6 w-7 cursor-pointer rounded border border-linha"
                      value={noSelecionado.cor} title="Outra cor"
                      onChange={(e) => alterarNo(noSelecionado.id, { cor: e.target.value })}
                    />
                  </span>
                </>
              )}

              {/* Girar e redimensionar valem para qualquer bloco, print
                  incluido: e o que se espera de um quadro deste tipo. */}
              <span className="flex items-center gap-1">
                <button
                  className="rounded-lg border border-linha px-1.5 py-1 text-[11px] font-bold text-tinta-suave hover:border-roxo hover:text-roxo-escuro"
                  title="Girar 15° à esquerda"
                  onClick={() => girar(noSelecionado, -15)}
                >↺</button>
                <button
                  className="rounded-lg border border-linha px-1.5 py-1 text-[11px] font-bold text-tinta-suave hover:border-roxo hover:text-roxo-escuro"
                  title="Girar 15° à direita"
                  onClick={() => girar(noSelecionado, 15)}
                >↻</button>
                {!!noSelecionado.rotacao && (
                  <button
                    className="rounded-lg px-1.5 py-1 text-[11px] font-bold text-tinta-suave hover:text-roxo-escuro"
                    title="Voltar ao ângulo original"
                    onClick={() => alterarNo(noSelecionado.id, { rotacao: 0 })}
                  >{noSelecionado.rotacao}°</button>
                )}
                <button
                  className="rounded-lg border border-linha px-1.5 py-1 text-[11px] font-bold text-tinta-suave hover:border-roxo hover:text-roxo-escuro"
                  title="Diminuir"
                  onClick={() => redimensionar(noSelecionado, 0.85)}
                >−</button>
                <button
                  className="rounded-lg border border-linha px-1.5 py-1 text-[11px] font-bold text-tinta-suave hover:border-roxo hover:text-roxo-escuro"
                  title="Aumentar"
                  onClick={() => redimensionar(noSelecionado, 1.18)}
                >+</button>
              </span>
              <button
                className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                  ligandoDe === noSelecionado.id
                    ? 'bg-roxo-escuro text-white'
                    : 'border border-linha text-tinta-suave hover:border-roxo hover:text-roxo-escuro'
                }`}
                onClick={() => setLigandoDe(ligandoDe === noSelecionado.id ? null : noSelecionado.id)}
              >
                {ligandoDe === noSelecionado.id ? 'Clique no bloco de destino' : '→ Seta para outro bloco'}
              </button>
              <button
                className="rounded-lg px-2 py-1 text-[11px] font-bold text-vermelho hover:bg-vermelho/5"
                onClick={() => removerNo(noSelecionado.id)}
              >Excluir bloco</button>
            </>
          ) : (
            <span className="text-[11px] text-tinta-suave">
              Clique num bloco para editar o texto, mudar a cor ou ligar a outro. Arraste para mover.
              Para pôr um print, copie a tela e cole aqui dentro com Ctrl+V.
            </span>
          )}
        </div>
      )}

      {avisoDaImagem && (
        <p className="border-b border-linha bg-vermelho/5 px-3 py-1.5 text-[11px] font-bold text-vermelho">
          {avisoDaImagem}
        </p>
      )}

      <div className="overflow-auto p-2">
        {/* A caixa de fora fica do tamanho ja aproximado, para a barra de
            rolagem acompanhar o desenho; a de dentro guarda as
            coordenadas de verdade do fluxo. */}
        <div style={{ width: largura * zoom, height: altura * zoom }}>
        <div
          ref={tela}
          data-quadro="fluxo"
          tabIndex={editando ? 0 : undefined}
          onPaste={(e) => void colar(e)}
          onMouseMove={moverArrasto}
          onMouseUp={terminarArrasto}
          onMouseLeave={terminarArrasto}
          onMouseDown={(e) => { comecouNoFundo.current = e.target === e.currentTarget; }}
          onClick={(e) => {
            if (e.target === e.currentTarget && comecouNoFundo.current) {
              setSelecionado(null);
              setLigandoDe(null);
            }
          }}
          className="relative rounded-lg outline-none"
          style={{
            width: largura,
            height: altura,
            transform: zoom === 1 ? undefined : `scale(${zoom})`,
            transformOrigin: 'top left',
            backgroundImage: 'radial-gradient(#E7E8F5 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          <svg width={largura} height={altura} className="pointer-events-none absolute inset-0">
            <defs>
              <marker id="ponta" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 z" fill="#6A6F94" />
              </marker>
              <marker id="ponta-inicio" markerWidth="9" markerHeight="9" refX="1" refY="4.5" orient="auto">
                <path d="M9,0 L0,4.5 L9,9 z" fill="#6A6F94" />
              </marker>
            </defs>
            {fluxo.ligacoes.map((l) => {
              const de = fluxo.nos.find((n) => n.id === l.de);
              const para = fluxo.nos.find((n) => n.id === l.para);
              if (!de || !para) return null;
              const inicio = bordaMaisProxima(de, para);
              const fim = bordaMaisProxima(para, de);
              return (
                <g key={l.id}>
                  <line
                    x1={inicio.x} y1={inicio.y} x2={fim.x} y2={fim.y}
                    stroke="#6A6F94" strokeWidth={2} markerEnd="url(#ponta)"
                    strokeDasharray={l.tracejada ? '6 4' : undefined}
                    markerStart={l.dupla ? 'url(#ponta-inicio)' : undefined}
                  />
                  {l.rotulo && (
                    <text
                      x={(inicio.x + fim.x) / 2} y={(inicio.y + fim.y) / 2 - 6}
                      textAnchor="middle" fontSize="11" fill="#6A6F94" fontFamily="Inter"
                    >{l.rotulo}</text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Rótulo da seta e exclusão dela: fora do SVG, para ser clicável. */}
          {editando && fluxo.ligacoes.map((l) => {
            const de = fluxo.nos.find((n) => n.id === l.de);
            const para = fluxo.nos.find((n) => n.id === l.para);
            if (!de || !para) return null;
            const inicio = bordaMaisProxima(de, para);
            const fim = bordaMaisProxima(para, de);
            return (
              <div
                key={l.id}
                className="absolute flex items-center gap-1"
                style={{ left: (inicio.x + fim.x) / 2 - 62, top: (inicio.y + fim.y) / 2 + 2 }}
              >
                <input
                  className="w-20 rounded border border-linha bg-white px-1 py-0.5 text-[10px]"
                  value={l.rotulo} placeholder="Sim / Não"
                  onChange={(e) => gravar({
                    ...fluxo,
                    ligacoes: fluxo.ligacoes.map((x) => (x.id === l.id ? { ...x, rotulo: e.target.value } : x)),
                  })}
                />
                <button
                  className={`rounded border px-1 text-[10px] font-bold ${
                    l.dupla ? 'border-roxo bg-roxo-suave text-roxo-escuro' : 'border-linha bg-white text-tinta-suave'
                  }`}
                  title="Ponta dos dois lados"
                  onClick={() => gravar({
                    ...fluxo,
                    ligacoes: fluxo.ligacoes.map((x) => (x.id === l.id ? { ...x, dupla: !x.dupla } : x)),
                  })}
                >↔</button>
                <button
                  className={`rounded border px-1 text-[10px] font-bold ${
                    l.tracejada ? 'border-roxo bg-roxo-suave text-roxo-escuro' : 'border-linha bg-white text-tinta-suave'
                  }`}
                  title="Linha tracejada"
                  onClick={() => gravar({
                    ...fluxo,
                    ligacoes: fluxo.ligacoes.map((x) => (x.id === l.id ? { ...x, tracejada: !x.tracejada } : x)),
                  })}
                >┄</button>
                <button
                  className="rounded bg-white px-1 text-[10px] font-bold text-vermelho"
                  title="Remover seta"
                  onClick={() => gravar({ ...fluxo, ligacoes: fluxo.ligacoes.filter((x) => x.id !== l.id) })}
                >✕</button>
              </div>
            );
          })}

          {fluxo.nos.map((no) => (no.forma === 'imagem' ? (
            <img
              key={no.id}
              src={no.imagem}
              alt={no.texto || 'Print colado no fluxo'}
              draggable={false}
              onMouseDown={(e) => comecarArrasto(e, no)}
              onClick={() => (ligandoDe ? ligar(no.id) : setSelecionado(no.id))}
              className={`absolute rounded-lg border-2 bg-white object-contain ${
                editando ? 'cursor-grab active:cursor-grabbing' : ''
              } ${selecionado === no.id ? 'border-roxo shadow-alto' : 'border-linha shadow-card'}`}
              style={{
                left: no.x, top: no.y, width: no.largura, height: no.altura,
                transform: no.rotacao ? `rotate(${no.rotacao}deg)` : undefined,
              }}
            />
          ) : (
            <div
              key={no.id}
              onMouseDown={(e) => comecarArrasto(e, no)}
              onClick={() => (ligandoDe ? ligar(no.id) : setSelecionado(no.id))}
              className={`absolute flex items-center justify-center px-2 text-center text-xs font-semibold transition-shadow ${
                editando ? 'cursor-grab active:cursor-grabbing' : ''
              } ${selecionado === no.id ? 'shadow-alto' : 'shadow-card'} ${
                ligandoDe && ligandoDe !== no.id ? 'ring-2 ring-roxo ring-offset-1' : ''
              }`}
              style={{
                left: no.x,
                top: no.y,
                width: no.largura,
                height: no.altura,
                backgroundColor: `${no.cor}14`,
                border: `2px solid ${no.cor}`,
                color: '#161933',
                borderRadius: no.forma === 'inicio' ? 999 : no.forma === 'nota' ? 4 : 10,
                transform: `rotate(${(no.forma === 'decisao' ? 45 : 0) + (no.rotacao ?? 0)}deg)`,
              }}
            >
              {/* O texto desgira o quanto a forma girou: losango com a
                  palavra de cabeca para baixo nao se le. */}
              <span style={{ transform: `rotate(${-((no.forma === 'decisao' ? 45 : 0) + (no.rotacao ?? 0))}deg)` }}>
                {no.texto}
              </span>
            </div>
          )))}

          {/* Alca de tamanho: so no bloco selecionado, para nao poluir o
              desenho com quadradinhos em cada caixa. */}
          {editando && noSelecionado && (
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                esticando.current = {
                  id: noSelecionado.id,
                  x: e.clientX,
                  y: e.clientY,
                  largura: noSelecionado.largura,
                  altura: noSelecionado.altura,
                };
              }}
              title="Arraste para mudar o tamanho"
              className="absolute h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-roxo bg-white"
              style={{
                left: noSelecionado.x + noSelecionado.largura - 6,
                top: noSelecionado.y + noSelecionado.altura - 6,
              }}
            />
          )}

          {!fluxo.nos.length && (
            <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-tinta-suave">
              {editando
                ? 'Comece adicionando uma etapa ou uma decisão na barra acima, ou clique aqui e cole um print com Ctrl+V.'
                : 'Fluxo ainda vazio.'}
            </p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
