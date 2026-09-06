import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/estado/dados';
import { SITUACOES_PADRAO, definirSituacoes } from '@/dominio/situacoes';
import type { Significado, Situacao } from '@/dominio/situacoes';

/* Ajustes que a equipe faz e valem para todo mundo — por isso vivem
   numa tabela, não no armazenamento do navegador. Hoje só as situações
   das atividades: quais existem, com que nome, cor e significado. */

const CHAVE = 'status_projeto';

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

export async function lerSituacoes(): Promise<Situacao[]> {
  const { data, error } = await supabase
    .from('configuracoes').select('valor').eq('chave', CHAVE).maybeSingle();
  if (error) throw error;
  return normalizar((data as { valor?: unknown } | null)?.valor);
}

export async function salvarSituacoes(lista: Situacao[]): Promise<void> {
  const { error } = await supabase.from('configuracoes')
    .upsert({ chave: CHAVE, valor: lista }, { onConflict: 'chave' });
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
