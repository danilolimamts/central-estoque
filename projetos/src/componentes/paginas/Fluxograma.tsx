import { useEffect, useRef, useState } from 'react';
import {
  bordaMaisProxima, CORES_DO_FLUXO, escreverFluxo, fluxoVazio, lerFluxo, limitesDoFluxo,
  noNovo, proximaPosicao, rotuloDaForma,
} from '@/dominio/fluxo';
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
  const arrastando = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const tela = useRef<HTMLDivElement>(null);

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

  function comecarArrasto(e: React.MouseEvent, no: NoDoFluxo) {
    if (!editando) return;
    const area = tela.current?.getBoundingClientRect();
    if (!area) return;
    arrastando.current = {
      id: no.id,
      dx: e.clientX - area.left - no.x,
      dy: e.clientY - area.top - no.y,
    };
    setSelecionado(no.id);
  }

  function moverArrasto(e: React.MouseEvent) {
    const atual = arrastando.current;
    const area = tela.current?.getBoundingClientRect();
    if (!atual || !area) return;
    const x = Math.max(0, e.clientX - area.left - atual.dx);
    const y = Math.max(0, e.clientY - area.top - atual.dy);
    /* Encaixe de 10 em 10 px: alinha os blocos sem precisar de mira. */
    setFluxo((f) => ({
      ...f,
      nos: f.nos.map((n) => (n.id === atual.id
        ? { ...n, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 }
        : n)),
    }));
  }

  function terminarArrasto() {
    if (!arrastando.current) return;
    arrastando.current = null;
    aoMudar(escreverFluxo(fluxo));
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

          {noSelecionado ? (
            <>
              <input
                className="campo w-48 py-1 text-xs" value={noSelecionado.texto}
                onChange={(e) => alterarNo(noSelecionado.id, { texto: e.target.value })}
                placeholder="Texto do bloco"
              />
              <select
                className="campo w-28 py-1 text-xs" value={noSelecionado.cor}
                onChange={(e) => alterarNo(noSelecionado.id, { cor: e.target.value })}
              >
                {CORES_DO_FLUXO.map((c) => <option key={c.valor} value={c.valor}>{c.nome}</option>)}
              </select>
              <button
                className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                  ligandoDe === noSelecionado.id
                    ? 'bg-roxo-escuro text-white'
                    : 'border border-linha text-tinta-suave hover:border-roxo hover:text-roxo-escuro'
                }`}
                onClick={() => setLigandoDe(ligandoDe === noSelecionado.id ? null : noSelecionado.id)}
              >
                {ligandoDe === noSelecionado.id ? 'Clique no destino' : 'Ligar a outro'}
              </button>
              <button
                className="rounded-lg px-2 py-1 text-[11px] font-bold text-vermelho hover:bg-vermelho/5"
                onClick={() => removerNo(noSelecionado.id)}
              >Excluir bloco</button>
            </>
          ) : (
            <span className="text-[11px] text-tinta-suave">
              Clique num bloco para editar o texto, mudar a cor ou ligar a outro. Arraste para mover.
            </span>
          )}
        </div>
      )}

      <div className="overflow-auto p-2">
        <div
          ref={tela}
          onMouseMove={moverArrasto}
          onMouseUp={terminarArrasto}
          onMouseLeave={terminarArrasto}
          onClick={(e) => { if (e.target === e.currentTarget) { setSelecionado(null); setLigandoDe(null); } }}
          className="relative rounded-lg"
          style={{
            width: largura,
            height: altura,
            backgroundImage: 'radial-gradient(#E7E8F5 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          <svg width={largura} height={altura} className="pointer-events-none absolute inset-0">
            <defs>
              <marker id="ponta" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 z" fill="#6A6F94" />
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
                style={{ left: (inicio.x + fim.x) / 2 - 40, top: (inicio.y + fim.y) / 2 + 2 }}
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
                  className="rounded bg-white px-1 text-[10px] font-bold text-vermelho"
                  title="Remover seta"
                  onClick={() => gravar({ ...fluxo, ligacoes: fluxo.ligacoes.filter((x) => x.id !== l.id) })}
                >✕</button>
              </div>
            );
          })}

          {fluxo.nos.map((no) => (
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
                transform: no.forma === 'decisao' ? 'rotate(45deg)' : undefined,
              }}
            >
              <span style={{ transform: no.forma === 'decisao' ? 'rotate(-45deg)' : undefined }}>
                {no.texto}
              </span>
            </div>
          ))}

          {!fluxo.nos.length && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-tinta-suave">
              {editando
                ? 'Comece adicionando uma etapa ou uma decisão na barra acima.'
                : 'Fluxo ainda vazio.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
