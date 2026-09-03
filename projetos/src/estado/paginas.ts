import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { comprimirImagem } from '@/lib/imagem';
import { mensagemDeErro } from '@/estado/dados';
import type { Bloco, Pagina, StatusPagina, VersaoDePagina } from '@/dominio/tipos';

const BALDE = 'anexos-projetos';

export function blocoVazio(tipo: Bloco['tipo']): Bloco {
  return {
    id: crypto.randomUUID(),
    tipo,
    conteudo: tipo === 'texto'
      ? ''
      /* Um fluxo em branco nao renderiza e parece defeito; o exemplo
         tambem ensina a sintaxe sem precisar de manual. */
      : 'flowchart TD\n  A[Usuário abre a tela] --> B{Tem saldo?}\n  B -- Sim --> C[Mostra o item]\n  B -- Não --> D[Avisa indisponível]',
  };
}

export async function listarPaginas(projetoId: string): Promise<Pagina[]> {
  const { data, error } = await supabase
    .from('paginas').select('*').eq('projeto_id', projetoId).order('ordem');
  if (error) throw error;
  return (data ?? []) as Pagina[];
}

export async function criarPagina(projetoId: string, ordem: number, titulo = 'Nova página'): Promise<Pagina> {
  const { data, error } = await supabase.from('paginas')
    .insert({ projeto_id: projetoId, titulo, ordem, blocos: [blocoVazio('texto')] })
    .select('*').single();
  if (error) throw error;
  return data as Pagina;
}

export async function salvarPagina(
  pagina: Pagina, titulo: string, blocos: Bloco[], salvoPor: string | null,
): Promise<void> {
  /* A versao guardada e a ANTERIOR, gravada antes da escrita: e ela que
     permite voltar quando alguem apaga um trecho sem querer. */
  const versao = await supabase.from('paginas_versoes').insert({
    pagina_id: pagina.id,
    titulo: pagina.titulo,
    blocos: pagina.blocos,
    salvo_por: pagina.atualizado_por,
  });
  if (versao.error) throw versao.error;

  const { error } = await supabase.from('paginas')
    .update({ titulo, blocos, atualizado_por: salvoPor })
    .eq('id', pagina.id);
  if (error) throw error;
}

/* A situacao muda direto no cabecalho da pagina, sem passar pelo modo
   de edicao: e uma classificacao, nao conteudo. */
export async function alterarStatusDaPagina(id: string, status: StatusPagina): Promise<void> {
  const { error } = await supabase.from('paginas').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function renomearPagina(id: string, titulo: string): Promise<void> {
  const { error } = await supabase.from('paginas').update({ titulo }).eq('id', id);
  if (error) throw error;
}

export async function excluirPagina(id: string): Promise<void> {
  const { error } = await supabase.from('paginas').delete().eq('id', id);
  if (error) throw error;
}

export async function listarVersoes(paginaId: string): Promise<VersaoDePagina[]> {
  const { data, error } = await supabase
    .from('paginas_versoes').select('*')
    .eq('pagina_id', paginaId).order('criado_em', { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as VersaoDePagina[];
}

/* Imagem colada ou escolhida dentro do texto. Vai para o mesmo balde
   dos anexos, em pasta separada, e o texto guarda so a URL. */
export async function enviarImagemDaPagina(arquivo: File, projetoId: string): Promise<string> {
  const pronto = await comprimirImagem(arquivo);
  const limpo = pronto.name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-60);
  const caminho = `paginas/${projetoId}/${crypto.randomUUID()}-${limpo}`;

  const { error } = await supabase.storage.from(BALDE)
    .upload(caminho, pronto, { contentType: pronto.type || 'image/jpeg', upsert: false });
  if (error) throw error;

  return supabase.storage.from(BALDE).getPublicUrl(caminho).data.publicUrl;
}

interface Carteira {
  paginas: Pagina[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function usePaginas(projetoId: string): Carteira {
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setPaginas(await listarPaginas(projetoId));
      setErro(null);
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [projetoId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { paginas, carregando, erro, recarregar };
}
