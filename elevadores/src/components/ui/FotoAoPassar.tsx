/* ============================================================
   Codigo do elevador que mostra a foto do produto ao passar o
   mouse (ou ao tocar, no celular). A foto vem da base auxiliar
   DE_PARA_LINK_FOTO, cruzada pelo Item Vol.Multiplo.

   A imagem so e buscada quando o cartao abre, para nao pedir 190
   fotos de uma vez ao abrir a tela.
   ============================================================ */
import { useState, useRef, useEffect } from 'react';

export function FotoAoPassar({
  item,
  url,
  children,
}: {
  item: string;
  url?: string;
  children?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [acima, setAcima] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  /* Abre para cima quando nao ha espaco embaixo, para o cartao nao
     ficar cortado no rodape da tabela. */
  useEffect(() => {
    if (!aberto || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAcima(window.innerHeight - r.bottom < 240);
  }, [aberto]);

  const conteudo = children ?? item;

  if (!url) {
    return <span title="Sem foto cadastrada">{conteudo}</span>;
  }

  return (
    <span
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
      onFocus={() => setAberto(true)}
      onBlur={() => setAberto(false)}
    >
      <button
        type="button"
        className="cursor-help underline decoration-dotted underline-offset-2"
        onClick={() => setAberto((v) => !v)}
        aria-label={`Ver foto do elevador ${item}`}
      >
        {conteudo}
      </button>

      {aberto && (
        <span
          role="tooltip"
          className="absolute left-0 z-50 block w-[210px] rounded-lg p-2 shadow-lg"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            [acima ? 'bottom' : 'top']: '100%',
            marginTop: acima ? undefined : 6,
            marginBottom: acima ? 6 : undefined,
          }}
        >
          {falhou ? (
            <span
              className="flex h-[150px] items-center justify-center px-2 text-center text-[11px]"
              style={{ color: 'var(--ink-soft)' }}
            >
              A foto não pôde ser carregada. O endereço da imagem pode exigir
              rede interna da empresa.
            </span>
          ) : (
            <img
              src={url}
              alt={`Elevador ${item}`}
              className="h-[150px] w-full rounded object-contain"
              style={{ background: '#fff' }}
              onError={() => setFalhou(true)}
              loading="lazy"
            />
          )}
          <span className="mt-1 block text-center text-[10.5px]" style={{ color: 'var(--ink-soft)' }}>
            {item}
          </span>
        </span>
      )}
    </span>
  );
}
