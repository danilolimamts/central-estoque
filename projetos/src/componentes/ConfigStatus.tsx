import { useEffect, useState } from 'react';
import { Aviso, Modal, Selo } from '@/componentes/ui';
import { mensagemDeErro } from '@/estado/dados';
import { salvarSituacoes } from '@/estado/configuracao';
import { SITUACOES_PADRAO, chaveNova, definirSituacoes, percentualDaSituacao, situacoes } from '@/dominio/situacoes';
import type { Significado, Situacao } from '@/dominio/situacoes';

interface Props {
  aberto: boolean;
  situacoes: Situacao[];
  /* Situações que já têm atividade: apagar uma delas deixaria cartão
     órfão, então a tela impede e explica. */
  emUso: string[];
  aoFechar: () => void;
  recarregar: () => Promise<void>;
}

const SIGNIFICADOS: { valor: Significado; rotulo: string; explica: string }[] = [
  { valor: 'aberta', rotulo: 'Em aberto', explica: 'trabalho em andamento; conta como pendente' },
  { valor: 'concluida', rotulo: 'Concluída', explica: 'entra no avanço e encerra a atividade' },
  { valor: 'cancelada', rotulo: 'Cancelada', explica: 'sai da conta do avanço' },
];

const CORES = ['#9E86D8', '#2F6FE0', '#C79212', '#B0568F', '#2E8B57', '#D2453A', '#6A6F94', '#0F766E'];

const situacoesDoRegistro = () => situacoes();

export default function ConfigStatus({ aberto, situacoes, emUso, aoFechar, recarregar }: Props) {
  const [rascunho, setRascunho] = useState<Situacao[]>(situacoes);
  const [novo, setNovo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (aberto) { setRascunho(situacoes); setNovo(''); setErro(null); } }, [aberto, situacoes]);

  /* O numero que apareceria se o campo ficasse vazio. Vem do proprio
     rascunho — mexer na ordem ou ligar uma situacao muda a divisao na
     hora —, entao o registro do dominio e emprestado e devolvido. */
  function automatico(chave: string): number {
    const guardado = situacoesDoRegistro();
    try {
      definirSituacoes(rascunho.map((s) => ({ ...s, avanco: null })));
      return percentualDaSituacao(chave);
    } finally {
      definirSituacoes(guardado);
    }
  }

  function mudar(chave: string, mudanca: Partial<Situacao>) {
    setRascunho((atual) => atual.map((s) => (s.chave === chave ? { ...s, ...mudanca } : s)));
  }

  function mover(i: number, direcao: -1 | 1) {
    setRascunho((atual) => {
      const j = i + direcao;
      if (j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  function adicionar() {
    const rotulo = novo.trim();
    if (!rotulo) return;
    const chave = chaveNova(rotulo, rascunho.map((s) => s.chave));
    setRascunho((atual) => [...atual, {
      chave, rotulo, cor: CORES[atual.length % CORES.length], usar: true, significado: 'aberta',
      avanco: null,
    }]);
    setNovo('');
  }

  function remover(chave: string) {
    if (emUso.includes(chave)) return;
    setRascunho((atual) => atual.filter((s) => s.chave !== chave));
  }

  async function salvar() {
    if (rascunho.every((s) => !s.usar)) {
      setErro('Deixe pelo menos uma situação ligada, senão não há para onde mover uma atividade.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await salvarSituacoes(rascunho.map((s) => ({ ...s, rotulo: s.rotulo.trim() || s.chave })));
      await recarregar();
      aoFechar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Situações das atividades" largura="max-w-3xl">
      <p className="mb-3 text-sm text-tinta-suave">
        Crie as situações do seu processo, renomeie e escolha a cor. A <strong>ordem desta
        lista</strong> é a ordem das colunas no quadro e da lista ordenada por situação: use ▲▼
        para, por exemplo, deixar <em>Concluído</em> por último. No próprio quadro as setas
        ‹ › do cabeçalho fazem o mesmo. O <strong>significado</strong> é o que muda conta: só a
        situação marcada como concluída entra no avanço, e a cancelada sai da conta. Vale para
        todo mundo que abre o módulo.
      </p>

      <div className="space-y-2">
        {rascunho.map((s, i) => {
          const usada = emUso.includes(s.chave);
          return (
            <div key={s.chave} className="flex flex-wrap items-center gap-2 rounded-lg border border-linha px-3 py-2">
              {/* A posicao em numero: sem ela, "subir" e "descer" nao
                  dizem onde a coluna vai parar no quadro. */}
              <span className="w-5 shrink-0 text-center text-[11px] font-bold text-tinta-suave">{i + 1}º</span>
              <div className="flex flex-col text-[11px] leading-none text-tinta-suave">
                <button className="hover:text-roxo-escuro" onClick={() => mover(i, -1)} title="Subir uma posição">▲</button>
                <button className="hover:text-roxo-escuro" onClick={() => mover(i, 1)} title="Descer uma posição">▼</button>
              </div>

              <label className="flex shrink-0 items-center gap-1.5 text-xs font-bold" title="Aparece nas listas e no quadro">
                <input type="checkbox" checked={s.usar} onChange={(e) => mudar(s.chave, { usar: e.target.checked })} />
                Usar
              </label>

              <input
                className="campo min-w-[150px] flex-1 py-1 text-sm"
                value={s.rotulo}
                onChange={(e) => mudar(s.chave, { rotulo: e.target.value })}
              />

              <input
                type="color" className="h-8 w-10 cursor-pointer rounded border border-linha"
                value={s.cor} onChange={(e) => mudar(s.chave, { cor: e.target.value })}
                title="Cor"
              />

              {/* Avanco da situacao: vazio significa "divida a esteira em
                  partes iguais", e o numero cinza mostra quanto isso da. */}
              <label className="flex shrink-0 items-center gap-1 text-[11px] text-tinta-suave" title="Quanto a atividade vale de avanço nesta situação. Vazio: divide a esteira em partes iguais.">
                <input
                  type="number" min={0} max={100}
                  className="campo w-16 py-1 text-xs"
                  value={s.avanco ?? ''}
                  placeholder={`${automatico(s.chave)}`}
                  onChange={(e) => mudar(s.chave, {
                    avanco: e.target.value === '' ? null : Number(e.target.value),
                  })}
                />
                %
              </label>

              <select
                className="campo w-40 py-1 text-xs"
                value={s.significado}
                onChange={(e) => mudar(s.chave, { significado: e.target.value as Significado })}
                title={SIGNIFICADOS.find((x) => x.valor === s.significado)?.explica}
              >
                {SIGNIFICADOS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
              </select>

              <Selo cor={s.cor}>{s.rotulo || s.chave}</Selo>

              {usada ? (
                <span className="text-[11px] text-tinta-suave" title="Há atividades nesta situação">em uso</span>
              ) : (
                <button
                  className="text-[11px] font-bold text-vermelho hover:underline"
                  onClick={() => remover(s.chave)}
                >Remover</button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-papel px-3 py-2">
        <label className="min-w-[220px] flex-1">
          <span className="rotulo">Nova situação</span>
          <input
            className="campo py-1 text-sm" value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
            placeholder="Ex.: Aguardando Bseller"
          />
        </label>
        <button className="botao-neutro" onClick={adicionar} disabled={!novo.trim()}>+ Adicionar</button>
      </div>

      <p className="mt-2 text-[11px] text-tinta-suave">
        Situação com atividade dentro não pode ser removida — mova as atividades antes, ou apenas
        desmarque <strong>Usar</strong> para ela sumir das telas sem perder o que já existe.
      </p>

      {erro && <div className="mt-3"><Aviso>{erro}</Aviso></div>}

      <div className="mt-4 flex justify-between gap-2">
        <button className="botao-neutro" onClick={() => setRascunho(SITUACOES_PADRAO)}>
          Voltar ao padrão
        </button>
        <div className="flex gap-2">
          <button className="botao-neutro" onClick={aoFechar}>Cancelar</button>
          <button className="botao-primario" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
