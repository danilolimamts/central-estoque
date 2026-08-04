/* ============================================================
   Boletim do Status do Projeto, para enviar por e-mail.

   A imagem e o proprio painel: mostra a previa do que foi capturado,
   deixa copiar para colar no corpo da mensagem e abre o programa de
   e-mail com o resumo em texto.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Acao, MetricasProjeto } from '../domain/tipos';
import {
  baixarBoletim,
  copiarBoletim,
  dadosDoBoletim,
  gerarBoletim,
  textoBoletim,
  CLASSE_FORA,
} from '../export/boletimStatus';
import { Botao } from './ui';

const LIMITE_MAILTO = 1800;

export function CompartilharStatus({
  alvo,
  acoes,
  metricas,
  hoje,
  aoFechar,
}: {
  /* O painel que vira imagem. Vem por ref da propria pagina. */
  alvo: HTMLElement | null;
  acoes: Acao[];
  metricas: MetricasProjeto;
  hoje: Date;
  aoFechar: () => void;
}) {
  const previa = useRef<HTMLDivElement>(null);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');

  const dados = useMemo(() => dadosDoBoletim(metricas, hoje), [metricas, hoje]);
  const mensagem = useMemo(() => textoBoletim(acoes, metricas, hoje), [acoes, metricas, hoje]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar();
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);

  /* A previa e a mesma captura que vai para o arquivo: o que a pessoa
     confere aqui e exatamente o que ela envia. */
  useEffect(() => {
    if (!alvo) return;
    let vivo = true;
    void (async () => {
      try {
        const canvas = await gerarBoletim(alvo, dados, { escala: 1.5 });
        if (!vivo || !previa.current) return;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
        previa.current.replaceChildren(canvas);
      } catch {
        if (vivo) setErro('Não consegui montar a prévia. Os botões abaixo ainda funcionam.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [alvo, dados]);

  function avisar(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(''), 3500);
  }

  async function copiarImagem() {
    if (!alvo) return;
    setOcupado('imagem');
    try {
      const copiou = await copiarBoletim(alvo, dados);
      if (copiou) avisar('Boletim copiado. Cole no corpo do e-mail com Ctrl+V.');
      else {
        await baixarBoletim(alvo, dados, hoje);
        avisar('Seu navegador não deixa copiar imagem: o arquivo foi baixado.');
      }
    } finally {
      setOcupado('');
    }
  }

  async function baixar() {
    if (!alvo) return;
    setOcupado('baixar');
    try {
      await baixarBoletim(alvo, dados, hoje);
      avisar('Boletim baixado. Anexe no e-mail.');
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

  /* O mailto nao carrega arquivo: o e-mail abre com o resumo e a
     imagem entra colada ou anexada. */
  function abrirEmail() {
    const assunto = `Equalização de Elevadores — status em ${dados.data}`;
    const corpo =
      mensagem.length > LIMITE_MAILTO ? `${mensagem.slice(0, LIMITE_MAILTO)}\n\n[continua no boletim]` : mensagem;
    window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  }

  return (
    <div
      /* O modal fica dentro do painel que ele captura, entao precisa se
         excluir da imagem: senao ele aparece por cima do proprio
         boletim que esta gerando. */
      className={`eq-modal-fundo ${CLASSE_FORA}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tituloBoletim"
      onClick={aoFechar}
    >
      <div className="eq-modal eq-modal-pagina" onClick={(e) => e.stopPropagation()}>
        <h3 id="tituloBoletim">Boletim para enviar por e-mail</h3>
        <p>
          É o próprio painel virado imagem, com os filtros que você aplicou. O caminho mais curto é
          copiar e colar no corpo da mensagem; o resumo em texto ajuda quem abrir pelo celular.
        </p>

        <div className="eq-previa-pagina" ref={previa} aria-label="Prévia do boletim">
          {!erro && <p style={{ padding: 16 }}>Montando o boletim…</p>}
        </div>

        {erro && <p className="eq-previa-aviso">{erro}</p>}
        {aviso && <p className="eq-previa-aviso">{aviso}</p>}

        <div className="eq-modal-acoes" style={{ marginTop: 8 }}>
          <Botao
            variante="laranja"
            desabilitado={ocupado !== '' || !alvo}
            aoClicar={copiarImagem}
            titulo="Copia o boletim para colar direto no corpo do e-mail"
          >
            {ocupado === 'imagem' ? 'Copiando…' : 'Copiar boletim'}
          </Botao>
          <Botao desabilitado={ocupado !== '' || !alvo} aoClicar={baixar} titulo="Salva o PNG para anexar">
            {ocupado === 'baixar' ? 'Gerando…' : 'Baixar imagem'}
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
