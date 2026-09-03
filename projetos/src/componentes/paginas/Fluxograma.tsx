import { useEffect, useRef, useState } from 'react';
import { cores } from '@/config/tokens';

interface Props {
  codigo: string;
  editando: boolean;
  aoMudar: (codigo: string) => void;
}

/* Mermaid pesa alguns MB e so faz falta em pagina que tem fluxo, entao
   entra por import dinamico - o restante do modulo nao paga por ele. */
let mermaidPronto: Promise<typeof import('mermaid').default> | null = null;

function carregarMermaid() {
  if (!mermaidPronto) {
    mermaidPronto = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        fontFamily: "'Inter', sans-serif",
        theme: 'base',
        themeVariables: {
          primaryColor: cores.roxo.suave,
          primaryTextColor: cores.tinta.base,
          primaryBorderColor: cores.roxo.base,
          lineColor: cores.tinta.suave,
          secondaryColor: '#E9EDFF',
          tertiaryColor: cores.papel,
          fontSize: '14px',
        },
      });
      return mermaid;
    });
  }
  return mermaidPronto;
}

const AJUDA = `flowchart TD — de cima para baixo (LR para esquerda→direita)
A[Caixa]  ·  B{Decisão}  ·  C([Início/fim])
A --> B — seta simples   ·   B -- Sim --> C — seta com rótulo`;

export default function Fluxograma({ codigo, editando, aoMudar }: Props) {
  const [svg, setSvg] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarAjuda, setMostrarAjuda] = useState(false);
  /* Cada render precisa de id unico: o mermaid injeta estilos por id e
     dois diagramas com o mesmo id se atropelam na mesma pagina. */
  const idDoDesenho = useRef(`fluxo-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let vivo = true;
    const tempo = setTimeout(async () => {
      try {
        const mermaid = await carregarMermaid();
        const { svg: desenho } = await mermaid.render(idDoDesenho.current, codigo || 'flowchart TD\n  A[Vazio]');
        if (!vivo) return;
        setSvg(desenho);
        setErro(null);
      } catch (falha) {
        if (!vivo) return;
        /* Sintaxe quebrada e normal enquanto se digita: mantem o ultimo
           desenho valido na tela e avisa embaixo, em vez de piscar. */
        setErro((falha as Error).message?.split('\n')[0] ?? 'Não consegui desenhar este fluxo.');
      }
    }, 400);
    return () => { vivo = false; clearTimeout(tempo); };
  }, [codigo]);

  return (
    <div className="rounded-xl border border-linha bg-white">
      {editando && (
        <div className="border-b border-linha">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-tinta-suave">Fluxograma</span>
            <button
              type="button" className="text-[11px] font-bold text-roxo-escuro"
              onClick={() => setMostrarAjuda((v) => !v)}
            >
              {mostrarAjuda ? 'Esconder ajuda' : 'Como escrever'}
            </button>
          </div>
          {mostrarAjuda && (
            <pre className="whitespace-pre-wrap border-t border-linha bg-papel px-3 py-2 text-[11px] text-tinta-suave">
              {AJUDA}
            </pre>
          )}
          <textarea
            value={codigo}
            onChange={(e) => aoMudar(e.target.value)}
            spellCheck={false}
            rows={Math.min(14, Math.max(4, codigo.split('\n').length + 1))}
            className="w-full resize-y border-t border-linha px-3 py-2 font-mono text-xs outline-none"
          />
        </div>
      )}

      <div className="overflow-x-auto p-3">
        {svg
          ? <div className="flex justify-center [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          : <p className="py-6 text-center text-xs text-tinta-suave">Desenhando…</p>}
      </div>

      {erro && editando && (
        <p className="border-t border-linha px-3 py-2 text-[11px] text-ambar">
          Fluxo com erro de escrita: {erro}
        </p>
      )}
    </div>
  );
}
