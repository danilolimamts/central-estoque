import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Aba } from '@/lib/rota';

/* Visita guiada do modulo.

   Quem chega pela primeira vez ve uma tela cheia de numeros e nao sabe
   o que e atividade, o que e situacao nem por que a porcentagem mudou
   sozinha. Um cartao parado explicando tudo em texto nao resolve: a
   pessoa le, fecha e continua sem saber onde fica cada coisa.

   Entao a visita aponta. Cada passo troca de aba se precisar, procura o
   elemento de verdade na tela pelo atributo data-guia, escurece o resto
   e desenha o texto ao lado dele. Passo cujo alvo nao esta na tela
   (o que so vive dentro de um projeto aberto, por exemplo) continua
   aparecendo no meio, explicando onde encontrar.

   Abre uma vez por navegador e sai inteira no primeiro clique: ninguem
   e obrigado a ler dez telas para comecar a trabalhar. */

const CHAVE = 'projetos.guia-visto';

/* Para onde a visita leva antes de procurar o alvo. "projeto" pede ao
   App que abra uma atividade de exemplo: sem isso, os passos sobre
   paginas, fluxograma e documento falariam de telas que a pessoa nao
   esta vendo. */
export type DestinoDoGuia = Aba | 'projeto';

interface Passo {
  titulo: string;
  texto: string;
  /* Elemento a destacar, pelo atributo data-guia. */
  alvo?: string;
  destino?: DestinoDoGuia;
}

const PASSOS: Passo[] = [
  {
    titulo: 'Bem-vindo ao módulo Projetos',
    texto: 'Aqui ficam os projetos e iniciativas do CD: o que está sendo feito, quem responde, em que ponto está e o que já foi documentado. Serve para qualquer frente de trabalho, seja obra, inventário, processo novo ou melhoria de sistema. Esta visita leva um minuto e abre cada tela para mostrar onde fica o quê.',
    destino: 'painel',
  },
  {
    titulo: 'As quatro abas',
    texto: 'Painel para a visão geral, Projetos para a carteira inteira, Cronograma para as datas no tempo e Pessoas para quem participa. É por aqui que se anda no módulo.',
    alvo: 'abas',
    destino: 'painel',
  },
  {
    titulo: 'Os números do painel',
    texto: 'Quantos projetos estão em andamento, quantos passaram do prazo, quantos vencem nos próximos quinze dias e quanto do total já foi concluído. É a resposta rápida para "como estamos" sem abrir nada.',
    destino: 'painel',
    alvo: 'indicadores',
  },
  {
    titulo: 'A carteira de projetos',
    texto: 'Todos os projetos numa lista, com responsável, prazo, situação e avanço. Clique em qualquer linha para abrir o projeto: é lá dentro que fica o trabalho.',
    destino: 'projetos',
    alvo: 'lista-projetos',
  },
  {
    titulo: 'Projeto é a pasta; atividade é o trabalho',
    texto: 'Este é um projeto aberto. A lista de atividades reúne as frentes, etapas ou melhorias que compõem o projeto, cada uma com prazo, responsável, situação e conteúdo próprio. O nome dessa lista você escolhe no próprio projeto.',
    destino: 'projeto',
    alvo: 'atividades',
  },
  {
    titulo: 'Lista ou quadro',
    texto: 'A lista põe prazo, prioridade, situação e avanço lado a lado, e deixa editar na própria linha. O quadro mostra as mesmas atividades em colunas, para arrastar de uma situação para outra. A escolha fica guardada para a próxima visita.',
    alvo: 'visao',
  },
  {
    titulo: 'As situações são a sua esteira',
    texto: 'Você cria, renomeia, escolhe a cor e a ordem das situações aqui, ou movendo as colunas do quadro com ‹ ›. O avanço de cada atividade sai da posição da situação: a esteira dividida em partes iguais, com a concluída em 100%. Nada de porcentagem digitada à mão.',
    alvo: 'situacoes',
  },
  {
    titulo: 'A faixa de números',
    texto: 'Logo abaixo do título da lista: quantas atividades já foram documentadas, quantas já foram pedidas, e quantas estão prontas para pedir. É o resumo que se leva para uma reunião.',
    alvo: 'esteira',
  },
  {
    titulo: 'Cronograma',
    texto: 'As mesmas atividades no tempo: cada barra vai do início ao fim previsto, e o quanto ela está preenchida é o avanço. Os losangos são os marcos, e a linha vermelha é hoje. Clique numa barra para abrir a atividade.',
    destino: 'cronograma',
    alvo: 'cronograma',
  },
  {
    titulo: 'Páginas, fluxograma e print',
    texto: 'Dentro de cada atividade, as páginas guardam a descrição do comportamento, com texto formatado, fluxograma desenhado à mão e print colado direto no quadro com Ctrl+V. Toda página tem histórico de versões.',
    destino: 'projeto',
    alvo: 'paginas',
  },
  {
    titulo: 'Anexos',
    texto: 'Fotos de antes e depois, planilhas, PDFs. As imagens são reduzidas na hora de subir, e as fotos de antes e depois aparecem lado a lado.',
    destino: 'projeto',
    alvo: 'anexos',
  },
  {
    titulo: 'O documento em Word',
    texto: 'A proposta formal da atividade. Você cola o pedido em texto corrido, o app distribui os blocos pelas seções, e o botão gera o arquivo, baixa e anexa à própria atividade. Gerar de novo substitui a versão anterior.',
    destino: 'projeto',
    alvo: 'documentos',
  },
  {
    titulo: 'Quem pode o quê',
    texto: 'Administrador mexe em tudo. Editor cria e altera o que ele mesmo criou. Leitor só consulta. Se um botão não aparece para você, é a permissão do seu cadastro, não defeito da tela. A visita fica aqui no botão Guia, sempre que quiser rever.',
    alvo: 'botao-guia',
  },
];

interface Area {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

const MARGEM = 8;

function areaDo(alvo: string | undefined): Area | null {
  if (!alvo) return null;
  const elemento = document.querySelector(`[data-guia="${alvo}"]`);
  if (!elemento) return null;
  const r = elemento.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return {
    x: r.left - MARGEM,
    y: r.top - MARGEM,
    largura: r.width + MARGEM * 2,
    altura: r.height + MARGEM * 2,
  };
}

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  /* A visita anda pelas telas sozinha: sem isto, metade dos passos
     apontaria para um elemento que nao esta na tela. */
  aoNavegar?: (destino: DestinoDoGuia) => void;
}

export default function Guia({ aberto, aoFechar, aoNavegar }: Props) {
  const [passo, setPasso] = useState(0);
  const [area, setArea] = useState<Area | null>(null);

  const atual = PASSOS[passo];

  useEffect(() => { if (aberto) setPasso(0); }, [aberto]);

  /* Abrir a tela e coisa do App; a visita so pede, uma vez por passo.

     A funcao vai num ref de proposito: ela nasce de novo a cada desenho
     do App, e como abrir uma tela faz o App desenhar de novo, deixa-la
     na lista de dependencias criava um vaivem sem fim. */
  const navegar = useRef(aoNavegar);
  navegar.current = aoNavegar;

  useEffect(() => {
    if (!aberto) return;
    const destino = PASSOS[passo]?.destino;
    if (destino) navegar.current?.(destino);
  }, [aberto, passo]);

  const medir = useCallback(() => {
    const encontrada = areaDo(atual?.alvo);
    setArea(encontrada);
    if (encontrada) {
      const fora = encontrada.y < 0 || encontrada.y + encontrada.altura > window.innerHeight;
      if (fora) {
        document.querySelector(`[data-guia="${atual?.alvo}"]`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [atual?.alvo]);

  useLayoutEffect(() => {
    if (!aberto) return;
    medir();
    /* O alvo pode chegar depois: a aba acabou de trocar, a lista ainda
       esta carregando, a rolagem ainda esta andando. Algumas medidas
       espacadas resolvem sem observador nenhum. */
    const relogios = [80, 250, 600, 1000, 1600, 2400].map((ms) => window.setTimeout(medir, ms));
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      relogios.forEach(window.clearTimeout);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [aberto, passo, medir]);

  if (!aberto || !atual) return null;

  function fechar() {
    try { localStorage.setItem(CHAVE, '1'); } catch { /* modo anônimo: só não lembra */ }
    aoFechar();
  }

  const ultimo = passo === PASSOS.length - 1;
  const largura = Math.min(400, window.innerWidth - 24);

  /* O texto fica embaixo do alvo quando cabe, senao em cima; sem alvo,
     no meio da tela. */
  const abaixo = area ? area.y + area.altura + 12 : 0;
  const cabeEmbaixo = area ? abaixo + 230 < window.innerHeight : false;
  const estilo: React.CSSProperties = area
    ? {
      left: Math.max(12, Math.min(window.innerWidth - largura - 12, area.x)),
      top: cabeEmbaixo ? abaixo : Math.max(12, area.y - 230),
      width: largura,
    }
    : {
      left: '50%', top: '50%', width: largura, transform: 'translate(-50%, -50%)',
    };

  return (
    <div className="fixed inset-0 z-[60]">
      {/* A cortina escura e a propria sombra do recorte: onde ha alvo,
          ele fica limpo e o resto escurece. */}
      <div className="absolute inset-0" onClick={fechar} />
      {area && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-roxo transition-all duration-200"
          style={{
            left: area.x, top: area.y, width: area.largura, height: area.altura,
            boxShadow: '0 0 0 9999px rgba(22,25,51,.6)',
          }}
        />
      )}
      {!area && <div className="absolute inset-0 bg-navy/60" />}

      <div
        className="absolute rounded-2xl bg-white p-4 shadow-alto"
        style={estilo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-titulo text-base font-extrabold">{atual.titulo}</h2>
          <button className="text-tinta-suave hover:text-tinta" onClick={fechar} aria-label="Fechar">✕</button>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-tinta">{atual.texto}</p>

        <div className="mt-3 flex items-center gap-1">
          {PASSOS.map((p, i) => (
            <button
              key={p.titulo}
              onClick={() => setPasso(i)}
              title={p.titulo}
              className={`h-1.5 flex-1 rounded-full transition ${i <= passo ? 'bg-roxo' : 'bg-linha'}`}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button className="text-xs font-bold text-tinta-suave hover:text-vermelho" onClick={fechar}>
            Pular tudo
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-tinta-suave">{passo + 1} de {PASSOS.length}</span>
            <button
              className="botao-neutro py-1 text-xs" disabled={passo === 0}
              onClick={() => setPasso((p) => Math.max(0, p - 1))}
            >Voltar</button>
            <button
              className="botao-primario py-1 text-xs"
              onClick={() => (ultimo ? fechar() : setPasso((p) => p + 1))}
            >{ultimo ? 'Começar a usar' : 'Próximo'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Primeira visita neste navegador: a visita abre sozinha. Erro de
   leitura (modo anônimo, armazenamento bloqueado) nao pode impedir o
   modulo de abrir, entao vale "já viu". */
export function guiaJaVisto(): boolean {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return true; }
}
