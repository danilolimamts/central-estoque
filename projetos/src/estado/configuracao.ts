import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/estado/dados';
import { SITUACOES_PADRAO, definirSituacoes } from '@/dominio/situacoes';
import type { Significado, Situacao } from '@/dominio/situacoes';

/* Ajustes que a equipe faz e valem para todo mundo — por isso vivem
   numa tabela, não no armazenamento do navegador. Hoje só as situações
   das atividades: quais existem, com que nome, cor e significado. */

const CHAVE = 'status_projeto';

/* A esteira pode ser do modulo inteiro ou de um projeto so.

   Um estudo ("levantar, medir, consolidar, apresentar") nao tem as
   mesmas etapas de uma melhoria pedida ao BSeller, e obrigar os dois a
   dividirem a mesma fila enchia o quadro de colunas que nao servem para
   nenhum dos dois. A chave do projeto e a mesma com o id colado; quem
   nao tiver a sua herda a do modulo. */
export const chaveDasSituacoes = (projetoId?: string | null) =>
  (projetoId ? `${CHAVE}:${projetoId}` : CHAVE);

const SIGNIFICADOS: Significado[] = ['aberta', 'concluida', 'cancelada'];

/* O formato antigo era um objeto com as seis situações fixas; o novo é
   uma lista, porque agora a equipe cria as suas e a ordem importa. Ler
   os dois evita perder a configuração de quem já tinha ajustado. */
function normalizar(valor: unknown): Situacao[] {
  if (Array.isArray(valor)) {
    const lista = valor
      .map((item) => item as Partial<Situacao>)
      .filter((item) => typeof item.chave === 'string' && item.chave.trim())
      .map((item): Situacao => ({
        chave: item.chave as string,
        rotulo: (item.rotulo ?? '').trim() || (item.chave as string),
        cor: item.cor ?? '#6A6F94',
        usar: item.usar ?? true,
        significado: SIGNIFICADOS.includes(item.significado as Significado)
          ? (item.significado as Significado)
          : 'aberta',
        avanco: avancoLido(item),
        chamado: item.chamado === true,
      }));
    return lista.length ? lista : SITUACOES_PADRAO;
  }

  if (valor && typeof valor === 'object') {
    const antigo = valor as Record<string, { usar?: boolean; rotulo?: string; cor?: string }>;
    return SITUACOES_PADRAO.map((padrao) => ({
      ...padrao,
      usar: antigo[padrao.chave]?.usar ?? padrao.usar,
      rotulo: (antigo[padrao.chave]?.rotulo ?? '').trim() || padrao.rotulo,
      cor: antigo[padrao.chave]?.cor ?? padrao.cor,
    }));
  }

  return SITUACOES_PADRAO;
}

/* Configuracao gravada antes do avanco por situacao nao tem o campo.
   Nesse caso vale o padrao de fabrica da mesma chave — e o que mantem
   Pausado em zero para quem ja tinha ajustado as situacoes. */
function avancoLido(item: Partial<Situacao>): number | null {
  if (typeof item.avanco === 'number') return item.avanco;
  if (item.avanco === null) return null;
  return SITUACOES_PADRAO.find((p) => p.chave === item.chave)?.avanco ?? null;
}

async function valorGravado(chave: string): Promise<unknown | undefined> {
  const { data, error } = await supabase
    .from('configuracoes').select('valor').eq('chave', chave).maybeSingle();
  if (error) throw error;
  return (data as { valor?: unknown } | null)?.valor;
}

export async function lerSituacoes(): Promise<Situacao[]> {
  return normalizar(await valorGravado(CHAVE));
}

/* Nulo quer dizer "este projeto nao tem esteira propria": quem chama
   usa a do modulo, em vez de cair nas situacoes de fabrica. */
export async function lerSituacoesDoProjeto(projetoId: string): Promise<Situacao[] | null> {
  const valor = await valorGravado(chaveDasSituacoes(projetoId));
  return valor === undefined ? null : normalizar(valor);
}

export async function salvarSituacoes(lista: Situacao[], projetoId?: string | null): Promise<void> {
  const { error } = await supabase.from('configuracoes')
    .upsert({ chave: chaveDasSituacoes(projetoId), valor: lista }, { onConflict: 'chave' });
  if (error) throw error;
}

/* Apagar a esteira propria devolve o projeto para a do modulo; as
   atividades continuam onde estao, e situacao que sumiu da configuracao
   ainda aparece como coluna avulsa. */
export async function apagarSituacoesDoProjeto(projetoId: string): Promise<void> {
  const { error } = await supabase.from('configuracoes')
    .delete().eq('chave', chaveDasSituacoes(projetoId));
  if (error) throw error;
}

export interface Configuracao {
  situacoes: Situacao[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useConfiguracao(pronto = true): Configuracao {
  const [lista, setLista] = useState<Situacao[]>(SITUACOES_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    /* Mesma espera da carteira: sem sessao o banco recusa a leitura e a
       equipe veria as situacoes de fabrica em vez das suas. */
    if (!pronto) return;
    setCarregando(true);
    try {
      const nova = await lerSituacoes();
      /* O registro do domínio precisa saber antes da tela desenhar: é
         dele que saem "encerrado", avanço e saúde, que são funções
         puras e não leem contexto de React. */
      definirSituacoes(nova);
      setLista(nova);
      setErro(null);
    } catch (falha) {
      /* Sem configuração o módulo funciona com as situações de fábrica:
         erro aqui não pode derrubar a tela inteira. */
      setErro(mensagemDeErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [pronto]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { situacoes: lista, carregando, erro, recarregar };
}

/* O contexto existe para os componentes redesenharem quando a
   configuração muda; quem só precisa do valor pode chamar as funções de
   dominio/situacoes diretamente. */
export const ContextoSituacoes = createContext<Situacao[]>(SITUACOES_PADRAO);

export const useSituacoes = () => useContext(ContextoSituacoes);

export interface EsteiraDoProjeto {
  situacoes: Situacao[];
  /* Verdadeiro quando o projeto tem esteira propria; falso quando esta
     herdando a do modulo. */
  propria: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

/* A esteira que vale dentro de um projeto aberto.

   O registro do dominio (que e quem responde "isso esta encerrado?" e
   "quanto isso avancou?") passa a seguir a esteira deste projeto
   enquanto a tela dele estiver aberta, e volta para a do modulo ao
   sair. Sem isso, avanco e saude seriam calculados com a fila errada. */
export function useSituacoesDoProjeto(projetoId: string, globais: Situacao[]): EsteiraDoProjeto {
  const [proprias, setProprias] = useState<Situacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /* A esteira do modulo entra por referencia para nao reconsultar o
     banco toda vez que ela for relida la em cima. */
  const doModulo = useRef(globais);
  doModulo.current = globais;

  const recarregar = useCallback(async () => {
    try {
      const lidas = await lerSituacoesDoProjeto(projetoId);
      /* O registro e atualizado antes do estado, e nao num efeito: as
         colunas do quadro sao montadas durante o desenho, e um registro
         que so muda depois deixaria a tela uma volta atras. */
      definirSituacoes(lidas ?? doModulo.current);
      setProprias(lidas);
      setErro(null);
    } catch (falha) {
      /* Sem a configuracao do projeto o quadro abre com a do modulo:
         erro aqui nao pode derrubar a tela. */
      setProprias(null);
      setErro(mensagemDeErro(falha));
    }
  }, [projetoId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const situacoes = proprias ?? globais;

  useEffect(() => {
    definirSituacoes(situacoes);
    /* Ao sair do projeto, o modulo volta a mandar. */
    return () => definirSituacoes(doModulo.current);
  }, [situacoes]);

  return { situacoes, propria: !!proprias, erro, recarregar };
}
