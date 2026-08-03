/* ============================================================
   Compartilhar a lista de itens descasados com o comprador.

   Monta a mensagem em texto puro, mostra na tela para conferir e
   abre no programa de e-mail. Como o mailto tem limite de tamanho,
   quando a lista e grande o e-mail leva o resumo e a mensagem
   inteira vai para a area de transferencia.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Botao } from './ui';

/* Limite seguro do mailto. Acima disso, parte dos programas de e-mail
   corta o corpo da mensagem sem avisar. */
const LIMITE_MAILTO = 1800;

export function CompartilharCompra({
  mensagem,
  assunto,
  aoFechar,
}: {
  mensagem: string;
  assunto: string;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const grande = mensagem.length > LIMITE_MAILTO;

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar();
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
      return true;
    } catch {
      setCopiado(false);
      return false;
    }
  }

  /* Quando a lista nao cabe no mailto, o e-mail abre com o resumo e a
     lista completa fica copiada, pronta para colar no corpo. */
  async function abrirEmail() {
    const corpo = grande
      ? `${mensagem.slice(0, LIMITE_MAILTO)}\n\n[a lista continua: cole aqui, ela ja esta copiada]`
      : mensagem;
    if (grande) await copiar();
    window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  }

  return (
    <div className="eq-modal-fundo" role="dialog" aria-modal="true" aria-labelledby="tituloCompartilhar" onClick={aoFechar}>
      <div className="eq-modal eq-modal-largo" onClick={(e) => e.stopPropagation()}>
        <h3 id="tituloCompartilhar">Enviar para o comprador</h3>
        <p>
          {grande
            ? 'A lista é grande para o e-mail. Ao abrir o e-mail ela também é copiada, é só colar no corpo da mensagem.'
            : 'Confira a mensagem abaixo. Ela abre no seu programa de e-mail já preenchida.'}
        </p>
        <textarea className="eq-compartilhar-texto" readOnly value={mensagem} rows={14} aria-label="Mensagem" />
        <div className="eq-modal-acoes">
          <Botao aoClicar={aoFechar}>Fechar</Botao>
          <Botao aoClicar={copiar}>{copiado ? 'Copiado' : 'Copiar mensagem'}</Botao>
          <Botao variante="laranja" aoClicar={abrirEmail}>
            Abrir no e-mail
          </Botao>
        </div>
      </div>
    </div>
  );
}
