/* ============================================================
   Compartilhar o status do projeto em uma pagina.

   Mostra a previa da imagem, deixa copiar para colar direto no corpo
   do e-mail e abre o programa de e-mail com o resumo em texto. A
   imagem tambem pode ser baixada, para quem prefere anexar.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Acao, MetricasProjeto } from '../domain/tipos';
import {
  baixarOnePage,
  copiarOnePage,
  desenharOnePage,
  montarOnePage,
  textoStatus,
  type Medidor,
} from '../export/imagemStatus';
import { Botao } from './ui';

const LIMITE_MAILTO = 1800;

export function CompartilharStatus({
  acoes,
  metricas,
  hoje,
  aoFechar,
}: {
  acoes: Acao[];
  metricas: MetricasProjeto;
  hoje: Date;
  aoFechar: () => void;
}) {
  const previa = useRef<HTMLDivElement>(null);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');

  const pagina = useMemo(() => {
    const medida = document.createElement('canvas').getContext('2d')!;
    const medir: Medidor = (texto, fonte) => {
      medida.font = fonte;
      return medida.measureText(texto).width;
    };
    return montarOnePage(acoes, metricas, medir, { data: hoje });
  }, [acoes, metricas, hoje]);

  const mensagem = useMemo(() => textoStatus(metricas, pagina, hoje), [metricas, pagina, hoje]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar();
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);

  /* A previa e o mesmo desenho que sai no arquivo, so que reduzido
     pela largura do modal: o que a pessoa ve e o que ela envia. */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const canvas = await desenharOnePage(pagina);
      if (!vivo || !previa.current) return;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      canvas.style.display = 'block';
      previa.current.replaceChildren(canvas);
    })();
    return () => {
      vivo = false;
    };
  }, [pagina]);

  function avisar(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(''), 3000);
  }

  async function copiarImagem() {
    setOcupado('imagem');
    try {
      const copiou = await copiarOnePage(acoes, metricas, { data: hoje });
      if (copiou) avisar('Imagem copiada. Cole no corpo do e-mail com Ctrl+V.');
      else {
        await baixarOnePage(acoes, metricas, { data: hoje });
        avisar('Seu navegador não deixa copiar imagem: o arquivo foi baixado.');
      }
    } finally {
      setOcupado('');
    }
  }

  async function baixar() {
    setOcupado('baixar');
    try {
      await baixarOnePage(acoes, metricas, { data: hoje });
    } finally {
      setOcupado('');
    }
  }

  async function copiarTexto() {
    try {
      await navigator.clipboard.writeText(mensagem);
      avisar('Resumo em texto copiado.');
    } catch {
      avisar('Não deu para copiar. Selecione o texto e copie manualmente.');
    }
  }

  /* O e-mail leva o resumo em texto; a imagem entra colada ou anexada,
     porque mailto nao carrega arquivo. */
  function abrirEmail() {
    const assunto = `Equalização de Elevadores — status em ${hoje.toLocaleDateString('pt-BR')}`;
    const corpo =
      mensagem.length > LIMITE_MAILTO ? `${mensagem.slice(0, LIMITE_MAILTO)}\n\n[continua na imagem]` : mensagem;
    window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  }

  return (
    <div
      className="eq-modal-fundo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tituloStatusPagina"
      onClick={aoFechar}
    >
      <div className="eq-modal eq-modal-pagina" onClick={(e) => e.stopPropagation()}>
        <h3 id="tituloStatusPagina">Status em uma página</h3>
        <p>
          A página abaixo é o que vai no e-mail. O caminho mais curto é copiar a imagem e colar no
          corpo da mensagem; o resumo em texto ajuda quem abrir pelo celular.
        </p>

        <div className="eq-previa-pagina" ref={previa} aria-label="Prévia da página de status" />

        {aviso && <p className="eq-previa-aviso">{aviso}</p>}

        <div className="eq-modal-acoes" style={{ marginTop: 8 }}>
          <Botao
            variante="laranja"
            desabilitado={ocupado !== ''}
            aoClicar={copiarImagem}
            titulo="Copia a imagem para colar direto no corpo do e-mail"
          >
            {ocupado === 'imagem' ? 'Copiando...' : 'Copiar imagem'}
          </Botao>
          <Botao desabilitado={ocupado !== ''} aoClicar={baixar} titulo="Salva o PNG para anexar">
            {ocupado === 'baixar' ? 'Gerando...' : 'Baixar imagem'}
          </Botao>
          <Botao aoClicar={copiarTexto} titulo="Resumo em texto puro">
            Copiar texto
          </Botao>
        </div>

        <div className="eq-modal-acoes">
          <Botao aoClicar={aoFechar}>Fechar</Botao>
          <Botao aoClicar={abrirEmail} titulo="Abre o e-mail com o resumo preenchido">
            Abrir no e-mail
          </Botao>
        </div>
      </div>
    </div>
  );
}
