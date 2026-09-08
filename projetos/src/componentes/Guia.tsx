import { useEffect, useState } from 'react';
import { Modal } from '@/componentes/ui';

/* Visita guiada do modulo.

   Quem chega pela primeira vez ve um painel cheio de numeros e nao sabe
   o que e atividade, o que e situacao nem por que a porcentagem mudou
   sozinha. Explicar isso por mensagem nao escala: cada pessoa nova
   repete as mesmas perguntas.

   A visita abre uma vez, por navegador, e pode ser pulada inteira no
   primeiro clique — ninguem e obrigado a ler oito telas para comecar a
   trabalhar. Depois disso ela fica no botao Guia, no alto a direita. */

const CHAVE = 'projetos.guia-visto';

interface Passo {
  titulo: string;
  texto: string;
}

const PASSOS: Passo[] = [
  {
    titulo: 'Bem-vindo ao módulo Projetos',
    texto: 'Aqui ficam os projetos do CD e as melhorias sistêmicas pedidas ao BSeller: o que está sendo feito, quem responde, o que já foi documentado e o que já virou chamado. São quatro abas no alto e, dentro de cada projeto, o trabalho de verdade.',
  },
  {
    titulo: 'Painel',
    texto: 'A visão de cima: quantos projetos estão em cada situação, quantos venceram o prazo e quais vencem nos próximos dias. Serve para responder rápido "como estamos" sem abrir nada.',
  },
  {
    titulo: 'Projetos e atividades',
    texto: 'Um projeto é a pasta; as atividades dentro dele são o trabalho. Em "Melhoria Sistêmica Bseller", por exemplo, cada melhoria pedida é uma atividade. Clique no projeto para ver a lista, e na atividade para entrar nela.',
  },
  {
    titulo: 'Lista ou quadro',
    texto: 'A lista mostra prazo, prioridade, situação e avanço lado a lado, e deixa editar na própria linha. O quadro mostra as mesmas atividades em colunas, para arrastar de uma situação para outra. A escolha fica guardada para a próxima visita.',
  },
  {
    titulo: 'Situações e avanço',
    texto: 'As situações são a sua esteira: você cria, renomeia, escolhe a cor e a ordem no botão ⚙ Situações — ou movendo as colunas do quadro com ‹ ›. O avanço da atividade sai da posição da situação: a esteira dividida em partes iguais, com a concluída em 100%.',
  },
  {
    titulo: 'A faixa de números',
    texto: 'Logo abaixo do título da lista: quantas melhorias já foram documentadas, quantas já foram pedidas ao BSeller e quantas estão prontas para virar chamado. É a resposta pronta para quando o gestor pergunta como está a fila.',
  },
  {
    titulo: 'Dentro da atividade',
    texto: 'Marcos e tarefas para o passo a passo; páginas para escrever o comportamento da tela, com fluxograma e print colado; anexos para os arquivos; e o documento, que gera a proposta em Word no padrão BSeller e fica anexada à própria atividade.',
  },
  {
    titulo: 'Escrevendo o documento',
    texto: 'No documento você cola o pedido em texto corrido — do jeito que escreveria no chamado — e o app distribui os blocos pelas seções. Depois é revisar e clicar em "Gerar Word e anexar". Cada geração substitui a versão anterior no anexo.',
  },
  {
    titulo: 'Quem pode o quê',
    texto: 'Administrador mexe em tudo. Editor cria e altera o que ele mesmo criou. Leitor só consulta. Se um botão não aparece para você, é a permissão do seu cadastro, não defeito da tela.',
  },
];

export default function Guia({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [passo, setPasso] = useState(0);

  useEffect(() => { if (aberto) setPasso(0); }, [aberto]);

  function fechar() {
    try { localStorage.setItem(CHAVE, '1'); } catch { /* modo anônimo: só não lembra */ }
    aoFechar();
  }

  const atual = PASSOS[passo];
  const ultimo = passo === PASSOS.length - 1;

  return (
    <Modal aberto={aberto} aoFechar={fechar} titulo={atual?.titulo ?? 'Guia'} largura="max-w-xl">
      <p className="text-sm leading-relaxed text-tinta">{atual?.texto}</p>

      <div className="mt-4 flex items-center gap-1.5">
        {PASSOS.map((p, i) => (
          <button
            key={p.titulo}
            onClick={() => setPasso(i)}
            title={p.titulo}
            className={`h-1.5 flex-1 rounded-full transition ${i <= passo ? 'bg-roxo' : 'bg-linha'}`}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
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
    </Modal>
  );
}

/* Primeira visita neste navegador: a visita abre sozinha. Erro de
   leitura (modo anônimo, armazenamento bloqueado) nao pode impedir o
   modulo de abrir, entao vale "já viu". */
export function guiaJaVisto(): boolean {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return true; }
}
