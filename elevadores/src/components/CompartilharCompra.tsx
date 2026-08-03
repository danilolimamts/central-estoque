/* ============================================================
   Compartilhar a lista de itens descasados com o comprador.

   Monta a mensagem em texto puro, mostra na tela para conferir e
   abre no programa de e-mail. Como o mailto tem limite de tamanho,
   quando a lista e grande o e-mail leva o resumo e a mensagem
   inteira vai para a area de transferencia.
   ============================================================ */
import { useEffect, useState } from 'react';
import type { GrupoFornecedor } from '../domain/fornecedores';
import { baixarImagemCompra } from '../export/imagemCompra';
import { baixarPlanilhaCompra } from '../export/excelCompra';
import { Botao } from './ui';

/* Limite seguro do mailto. Acima disso, parte dos programas de e-mail
   corta o corpo da mensagem sem avisar. */
const LIMITE_MAILTO = 1800;

export function CompartilharCompra({
  mensagem,
  assunto,
  grupos,
  aoFechar,
}: {
  mensagem: string;
  assunto: string;
  grupos: GrupoFornecedor[];
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [gerando, setGerando] = useState('');
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

  /* A imagem sai grande, entao o botao avisa enquanto desenha. */
  async function baixarImagem() {
    setGerando('imagem');
    try {
      await baixarImagemCompra(grupos);
    } finally {
      setGerando('');
    }
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
        <textarea className="eq-compartilhar-texto" readOnly value={mensagem} rows={12} aria-label="Mensagem" />

        <p className="eq-compartilhar-anexos">
          Para anexar no e-mail: a imagem serve para colar direto no corpo da mensagem, e a planilha
          sai com as mesmas cores da tabela da tela.
        </p>
        <div className="eq-modal-acoes" style={{ marginTop: 8 }}>
          <Botao aoClicar={baixarImagem} titulo="Imagem grande da lista, para colar no e-mail">
            {gerando === 'imagem' ? 'Gerando...' : 'Baixar imagem'}
          </Botao>
          <Botao aoClicar={() => baixarPlanilhaCompra(grupos)} titulo="Planilha com o tema da tabela">
            Baixar Excel
          </Botao>
        </div>

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
