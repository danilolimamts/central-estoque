import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Atualizacao, Marco, Pessoa, Projeto, Tarefa } from '@/dominio/tipos';

/* Erro do PostgREST vira mensagem legivel. 42501 e a negativa de RLS:
   sem tradutor, o usuario ve um codigo e nao entende que faltou
   permissao. */
export function mensagemDeErro(erro: unknown): string {
  const e = erro as { code?: string; message?: string } | null;
  if (!e) return 'Erro desconhecido.';
  if (e.code === '42501' || e.message?.includes('row-level security')) {
    return 'Sem permissão para esta ação. Fale com um administrador do módulo.';
  }
  if (e.code === '23505') return 'Já existe um registro com este código ou e-mail.';
  return e.message ?? 'Erro ao falar com o servidor.';
}

async function selecionar<T>(tabela: string, ordem: string, ascendente = true): Promise<T[]> {
  const { data, error } = await supabase.from(tabela).select('*').order(ordem, { ascending: ascendente });
  if (error) throw error;
  return (data ?? []) as T[];
}

export const listarProjetos = () => selecionar<Projeto>('projetos', 'criado_em', false);
export const listarPessoas = () => selecionar<Pessoa>('pessoas', 'nome');

export async function salvarProjeto(dados: Partial<Projeto> & { nome: string }, id?: string) {
  if (id) {
    const { error } = await supabase.from('projetos').update(dados).eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data: sessao } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('projetos')
    .insert({ ...dados, criado_por: sessao.user?.id }).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function excluirProjeto(id: string) {
  const { error } = await supabase.from('projetos').delete().eq('id', id);
  if (error) throw error;
}

export async function salvarPessoa(dados: Partial<Pessoa> & { nome: string; email: string }, id?: string) {
  const limpo = { ...dados, email: dados.email.trim().toLowerCase() };
  const { error } = id
    ? await supabase.from('pessoas').update(limpo).eq('id', id)
    : await supabase.from('pessoas').insert(limpo);
  if (error) throw error;
}

export async function excluirPessoa(id: string) {
  const { error } = await supabase.from('pessoas').delete().eq('id', id);
  if (error) throw error;
}

export async function salvarMarco(dados: Partial<Marco> & { projeto_id: string; nome: string }, id?: string) {
  const { error } = id
    ? await supabase.from('marcos').update(dados).eq('id', id)
    : await supabase.from('marcos').insert(dados);
  if (error) throw error;
}

export async function excluirMarco(id: string) {
  const { error } = await supabase.from('marcos').delete().eq('id', id);
  if (error) throw error;
}

export async function salvarTarefa(dados: Partial<Tarefa> & { projeto_id: string; titulo: string }, id?: string) {
  const { error } = id
    ? await supabase.from('tarefas').update(dados).eq('id', id)
    : await supabase.from('tarefas').insert(dados);
  if (error) throw error;
}

export async function excluirTarefa(id: string) {
  const { error } = await supabase.from('tarefas').delete().eq('id', id);
  if (error) throw error;
}

export async function lancarAtualizacao(dados: Omit<Atualizacao, 'id' | 'criado_em' | 'autor_id'>) {
  const { data: sessao } = await supabase.auth.getUser();
  const { error } = await supabase.from('atualizacoes').insert({ ...dados, autor_id: sessao.user?.id });
  if (error) throw error;
}

export async function excluirAtualizacao(id: string) {
  const { error } = await supabase.from('atualizacoes').delete().eq('id', id);
  if (error) throw error;
}

interface Carteira {
  projetos: Projeto[];
  pessoas: Pessoa[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

/* Carteira inteira em memoria: sao dezenas de projetos, nao milhares.
   Carregar tudo de uma vez deixa filtro, painel e cronograma
   instantaneos e evita uma consulta por interacao. */
export function useCarteira(ativo: boolean): Carteira {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!ativo) { setCarregando(false); return; }
    setCarregando(true);
    try {
      const [p, q] = await Promise.all([listarProjetos(), listarPessoas()]);
      setProjetos(p);
      setPessoas(q);
      setErro(null);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, [ativo]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { projetos, pessoas, carregando, erro, recarregar };
}

interface Detalhe {
  marcos: Marco[];
  tarefas: Tarefa[];
  atualizacoes: Atualizacao[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useDetalheProjeto(projetoId: string | null): Detalhe {
  const [marcos, setMarcos] = useState<Marco[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [atualizacoes, setAtualizacoes] = useState<Atualizacao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!projetoId) { setMarcos([]); setTarefas([]); setAtualizacoes([]); return; }
    setCarregando(true);
    try {
      const [m, t, a] = await Promise.all([
        supabase.from('marcos').select('*').eq('projeto_id', projetoId).order('ordem'),
        supabase.from('tarefas').select('*').eq('projeto_id', projetoId).order('ordem'),
        supabase.from('atualizacoes').select('*').eq('projeto_id', projetoId).order('data', { ascending: false }),
      ]);
      const falha = m.error ?? t.error ?? a.error;
      if (falha) throw falha;
      setMarcos((m.data ?? []) as Marco[]);
      setTarefas((t.data ?? []) as Tarefa[]);
      setAtualizacoes((a.data ?? []) as Atualizacao[]);
      setErro(null);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, [projetoId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { marcos, tarefas, atualizacoes, carregando, erro, recarregar };
}

/* Marcos e tarefas de todos os projetos, para o cronograma geral. */
export async function listarMarcosGerais(): Promise<Marco[]> {
  const { data, error } = await supabase.from('marcos').select('*').order('data_prevista');
  if (error) throw error;
  return (data ?? []) as Marco[];
}
