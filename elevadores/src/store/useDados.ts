/* ============================================================
   Estado global e persistencia local (secao 4 do brief).
   Os dados importados ficam no IndexedDB via localforage, entao
   sobrevivem entre sessoes sem servidor nenhum.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import localforage from 'localforage';
import type { Componente, Acao } from '../domain/tipos';
import { lerArquivo, lerArquivoFotos } from '../parsers/planilha';
import { agruparConjuntos, resumirEqualizacao } from '../domain/equalizacao';
import { auditarValoracao, resumirValoracao } from '../domain/valoracao';
import { derivarAcoes } from '../domain/projeto';

const store = localforage.createInstance({
  name: 'equalizacao_elevadores',
  storeName: 'dados_v1',
});

const CHAVE_DADOS = 'importacao';

export interface Importacao {
  componentes: Componente[];
  acoes: Acao[];
  fotos: [string, string][]; // Map serializado
  arquivo: string;
  importadoEm: string; // ISO
  /* Marca os dados de exemplo, para a tela avisar que nao sao do CD. */
  demonstracao?: boolean;
}

/* Datas viram string ao passar pelo IndexedDB; reidrata na volta. */
function reidratarAcoes(acoes: Acao[]): Acao[] {
  const campos = ['inicio', 'fim', 'reagendamento', 'dataConclusao', 'prazoValido'] as const;
  return acoes.map((a) => {
    const copia = { ...a } as Record<string, unknown>;
    for (const campo of campos) {
      const v = copia[campo];
      if (typeof v === 'string') copia[campo] = new Date(v);
    }
    return copia as unknown as Acao;
  });
}

export function useDados() {
  const [dados, setDados] = useState<Importacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    store
      .getItem<Importacao>(CHAVE_DADOS)
      .then((salvo) => {
        if (!vivo) return;
        if (salvo) setDados({ ...salvo, acoes: reidratarAcoes(salvo.acoes) });
      })
      .catch(() => undefined)
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const importar = useCallback(async (arquivo: File, arquivoFotos?: File | null) => {
    setErro(null);
    try {
      const buffer = new Uint8Array(await arquivo.arrayBuffer());
      const { componentes, acoes } = lerArquivo(buffer);
      if (componentes.length === 0 && acoes.length === 0) {
        throw new Error(
          'Nao encontrei as abas Multiplos e Projeto nesta planilha. Confira se e o arquivo de equalizacao.'
        );
      }

      let fotos: [string, string][] = [];
      if (arquivoFotos) {
        const bufFotos = new Uint8Array(await arquivoFotos.arrayBuffer());
        fotos = [...lerArquivoFotos(bufFotos).entries()];
      }

      const novo: Importacao = {
        componentes,
        acoes,
        fotos,
        arquivo: arquivo.name,
        importadoEm: new Date().toISOString(),
      };
      await store.setItem(CHAVE_DADOS, novo);
      setDados(novo);
      return novo;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao ler a planilha.';
      setErro(msg);
      throw e;
    }
  }, []);

  /* Carrega dados de demonstracao para conhecer as telas sem a planilha.
     Fica so na memoria: nao grava no IndexedDB, para nunca ser confundido
     com uma importacao de verdade. */
  const carregarDemo = useCallback(async () => {
    const { componentesDemo, acoesDemo } = await import('../demo/dadosDemo');
    setErro(null);
    setDados({
      componentes: componentesDemo(),
      acoes: acoesDemo(),
      fotos: [],
      arquivo: 'dados de exemplo',
      importadoEm: new Date().toISOString(),
      demonstracao: true,
    });
  }, []);

  const limpar = useCallback(async () => {
    await store.removeItem(CHAVE_DADOS);
    setDados(null);
  }, []);

  return { dados, carregando, erro, importar, carregarDemo, limpar };
}

/* Derivados de equalizacao e valoracao a partir dos componentes. */
export function useEqualizacao(componentes: Componente[] | undefined) {
  return useMemo(() => {
    const lista = componentes ?? [];
    const conjuntos = agruparConjuntos(lista);
    const resumo = resumirEqualizacao(conjuntos);
    const valoracoes = auditarValoracao(lista);
    const resumoValoracao = resumirValoracao(valoracoes);
    return { conjuntos, resumo, valoracoes, resumoValoracao };
  }, [componentes]);
}

/* Acoes com os derivados de prazo calculados para a data de hoje. */
export function useAcoes(acoes: Acao[] | undefined, hoje: Date) {
  return useMemo(() => derivarAcoes(acoes ?? [], hoje), [acoes, hoje]);
}
