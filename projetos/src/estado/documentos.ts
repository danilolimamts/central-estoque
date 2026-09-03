import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/estado/dados';
import type { DadosDoDocumento, Documento } from '@/dominio/documento';

export async function listarDocumentos(projetoId: string): Promise<Documento[]> {
  const { data, error } = await supabase
    .from('documentos').select('*').eq('projeto_id', projetoId).order('numero');
  if (error) throw error;
  return (data ?? []) as Documento[];
}

/* O numero e sequencial no modulo inteiro, nao por projeto: e o "NN" do
   nome do arquivo e do indice geral, que enxerga todas as propostas. */
export async function proximoNumero(): Promise<number> {
  const { data, error } = await supabase
    .from('documentos').select('numero').order('numero', { ascending: false }).limit(1);
  if (error) throw error;
  const ultimo = (data as { numero: number }[] | null)?.[0]?.numero ?? 0;
  return ultimo + 1;
}

export async function salvarDocumento(
  projetoId: string, dados: DadosDoDocumento, geradoPor: string | null, id?: string,
): Promise<string> {
  const linha = {
    projeto_id: projetoId,
    numero: dados.numero,
    titulo: dados.titulo,
    subtitulo: dados.subtitulo || null,
    categoria: dados.categoria || null,
    dados,
    gerado_por: geradoPor,
  };

  if (id) {
    const { error } = await supabase.from('documentos').update(linha).eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from('documentos').insert(linha).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function excluirDocumento(id: string): Promise<void> {
  const { error } = await supabase.from('documentos').delete().eq('id', id);
  if (error) throw error;
}

interface Carteira {
  documentos: Documento[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useDocumentos(projetoId: string): Carteira {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDocumentos(await listarDocumentos(projetoId));
      setErro(null);
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [projetoId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { documentos, carregando, erro, recarregar };
}
