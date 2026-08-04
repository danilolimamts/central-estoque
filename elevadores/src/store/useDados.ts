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
import { calcularMetricas, derivarAcoes } from '../domain/projeto';
import { marcoDe, registrarMarco } from '../domain/historico';
import type { Marco } from '../domain/historico';

const store = localforage.createInstance({
  name: 'equalizacao_elevadores',
  storeName: 'dados_v1',
});

const CHAVE_DADOS = 'importacao';
/* O historico fica em chave propria: trocar a planilha em uso nao pode
   apagar o que ja foi medido nas importacoes anteriores. */
const CHAVE_HISTORICO = 'historico';

export interface Importacao {
  componentes: Componente[];
  acoes: Acao[];
  fotos: [string, string][]; // Map serializado
  arquivo: string;
  importadoEm: string; // ISO
  /* Marca os dados de exemplo, para a tela avisar que nao sao do CD. */
  demonstracao?: boolean;
  /* Verdadeiro quando o navegador nao deixou gravar (janela anonima ou
     armazenamento bloqueado): os dados valem so para esta sessao. */
  semPersistencia?: boolean;
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

/* Grava o retrato do plano no historico. Falhar aqui nunca pode
   impedir a importacao: o historico e um extra, os dados sao o
   principal. */
async function guardarMarco(acoes: Acao[], arquivo: string, hoje: Date): Promise<Marco[]> {
  try {
    const metricas = calcularMetricas(derivarAcoes(acoes, hoje));
    const anterior = (await store.getItem<Marco[]>(CHAVE_HISTORICO)) ?? [];
    const atualizado = registrarMarco(anterior, marcoDe(metricas, arquivo, hoje));
    await store.setItem(CHAVE_HISTORICO, atualizado);
    return atualizado;
  } catch {
    return [];
  }
}

export function useDados() {
  const [dados, setDados] = useState<Importacao | null>(null);
  const [historico, setHistorico] = useState<Marco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void store
      .getItem<Marco[]>(CHAVE_HISTORICO)
      .then((h) => vivo && setHistorico(h ?? []))
      .catch(() => undefined);
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

      // Mostrar a planilha importada nao pode depender de conseguir gravar.
      // Em janela anonima ou com armazenamento bloqueado, o app segue
      // funcionando: so avisa que os dados nao ficam salvos.
      try {
        await store.setItem(CHAVE_DADOS, novo);
      } catch {
        novo.semPersistencia = true;
      }

      /* Cada importacao vira um ponto na evolucao do projeto. E o unico
         momento em que da para registrar o que se sabia: reagendamento
         reescreve o prazo e apaga o atraso que existia antes. */
      setHistorico(await guardarMarco(acoes, arquivo.name, new Date()));

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
    const { componentesDemo, acoesDemo, historicoDemo } = await import('../demo/dadosDemo');
    setErro(null);
    /* Marcos sinteticos, so na memoria: a evolucao precisa de mais de
       uma medicao para aparecer, e o exemplo nao tem como esperar. */
    setHistorico(historicoDemo());
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
    try {
      await store.removeItem(CHAVE_DADOS);
    } catch {
      // Sem armazenamento nao ha o que apagar; volta para a tela inicial.
    }
    setDados(null);
  }, []);

  return { dados, historico, carregando, erro, importar, carregarDemo, limpar };
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
