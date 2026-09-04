import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/estado/dados';

/* Quanta coisa cada atividade ja tem dentro. Serve para filtrar a lista
   por "tem documentacao", "tem tarefa" e afins sem abrir uma por uma.

   Sao cinco consultas de uma coluna so, limitadas as atividades do
   projeto aberto: trazer o conteudo inteiro para contar linha seria
   baixar paginas e anexos que ninguem vai ler agora. */

export interface ConteudoDoProjeto {
  paginas: number;
  tarefas: number;
  marcos: number;
  anexos: number;
  documentos: number;
}

export type MapaDeConteudo = Record<string, ConteudoDoProjeto>;

const VAZIO: ConteudoDoProjeto = { paginas: 0, tarefas: 0, marcos: 0, anexos: 0, documentos: 0 };

export const conteudoDe = (mapa: MapaDeConteudo, id: string): ConteudoDoProjeto => mapa[id] ?? VAZIO;

type Tabela = keyof ConteudoDoProjeto;
const TABELAS: Tabela[] = ['paginas', 'tarefas', 'marcos', 'anexos', 'documentos'];

export async function contarConteudo(ids: string[]): Promise<MapaDeConteudo> {
  if (!ids.length) return {};

  const mapa: MapaDeConteudo = {};
  for (const id of ids) mapa[id] = { ...VAZIO };

  const respostas = await Promise.all(
    TABELAS.map((t) => supabase.from(t).select('projeto_id').in('projeto_id', ids)),
  );

  respostas.forEach((resposta, i) => {
    if (resposta.error) throw resposta.error;
    for (const linha of (resposta.data ?? []) as { projeto_id: string }[]) {
      const alvo = mapa[linha.projeto_id];
      if (alvo) alvo[TABELAS[i]] += 1;
    }
  });

  return mapa;
}

interface Carteira {
  conteudo: MapaDeConteudo;
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useConteudoDosProjetos(ids: string[]): Carteira {
  const [conteudo, setConteudo] = useState<MapaDeConteudo>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* A lista de ids muda de identidade a cada render do pai; a chave de
     texto e o que evita recarregar sem nada ter mudado. */
  const chave = ids.join(',');

  const recarregar = useCallback(async () => {
    const lista = chave ? chave.split(',') : [];
    if (!lista.length) { setConteudo({}); return; }
    setCarregando(true);
    try {
      setConteudo(await contarConteudo(lista));
      setErro(null);
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [chave]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { conteudo, carregando, erro, recarregar };
}
