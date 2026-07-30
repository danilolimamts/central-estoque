/* ============================================================
   Mini tabela que aparece ao passar o cursor.

   Serve para consultar o detalhe sem sair da visao geral: no Gantt
   mostra o que fazer e as datas da atividade, e no plano de acao
   mostra as atividades daquela frente com a situacao de cada uma.
   ============================================================ */
import { useState, useRef, useEffect, type ReactNode } from 'react';

export function MiniTabela({
  children,
  conteudo,
  largura = 300,
}: {
  children: ReactNode;
  conteudo: ReactNode;
  largura?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [acima, setAcima] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  /* Abre para cima quando nao ha espaco embaixo, senao o cartao fica
     cortado no rodape da tabela ou do grafico. */
  useEffect(() => {
    if (!aberto || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAcima(window.innerHeight - r.bottom < 240);
  }, [aberto]);

  return (
    <span
      ref={ref}
      className="eq-dica-alvo"
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
      onFocus={() => setAberto(true)}
      onBlur={() => setAberto(false)}
      tabIndex={0}
    >
      {children}
      {aberto && (
        <span
          role="tooltip"
          className="eq-dica"
          style={{ width: largura, [acima ? 'bottom' : 'top']: '100%' }}
        >
          {conteudo}
        </span>
      )}
    </span>
  );
}

/* Linha de rotulo e valor dentro da mini tabela. */
export function LinhaDica({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <span className="eq-dica-linha">
      <span className="eq-dica-rotulo">{rotulo}</span>
      <span className="eq-dica-valor">{valor}</span>
    </span>
  );
}
