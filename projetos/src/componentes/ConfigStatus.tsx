import { useEffect, useState } from 'react';
import { Aviso, Modal, Selo } from '@/componentes/ui';
import { mensagemDeErro } from '@/estado/dados';
import { salvarConfigDeStatus, statusPadrao } from '@/estado/configuracao';
import type { ConfigDeStatus } from '@/estado/configuracao';
import { STATUS } from '@/dominio/tipos';
import type { StatusProjeto } from '@/dominio/tipos';

interface Props {
  aberto: boolean;
  config: ConfigDeStatus;
  /* Situações que já têm atividade: desmarcar uma delas não some com o
     trabalho, e a tela precisa dizer isso na hora. */
  emUso: StatusProjeto[];
  aoFechar: () => void;
  recarregar: () => Promise<void>;
}

export default function ConfigStatus({ aberto, config, emUso, aoFechar, recarregar }: Props) {
  const [rascunho, setRascunho] = useState<ConfigDeStatus>(config);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (aberto) setRascunho(config); }, [aberto, config]);

  function mudar(s: StatusProjeto, mudanca: Partial<ConfigDeStatus[StatusProjeto]>) {
    setRascunho((atual) => ({ ...atual, [s]: { ...atual[s], ...mudanca } }));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await salvarConfigDeStatus(rascunho);
      await recarregar();
      aoFechar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Situações das atividades" largura="max-w-2xl">
      <p className="mb-3 text-sm text-tinta-suave">
        Desmarque a situação que sua equipe não usa e ela some das listas, do quadro e dos
        filtros. Renomeie para o vocabulário do seu processo e escolha a cor. Vale para todo
        mundo que abre o módulo.
      </p>

      <div className="space-y-2">
        {STATUS.map((s) => {
          const usada = emUso.includes(s);
          return (
            <div key={s} className="flex flex-wrap items-center gap-3 rounded-lg border border-linha px-3 py-2">
              <label className="flex w-28 shrink-0 items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox" checked={rascunho[s].usar}
                  onChange={(e) => mudar(s, { usar: e.target.checked })}
                />
                Usar
              </label>

              <input
                className="campo min-w-[160px] flex-1 py-1 text-sm"
                value={rascunho[s].rotulo}
                onChange={(e) => mudar(s, { rotulo: e.target.value })}
                placeholder={statusPadrao()[s].rotulo}
              />

              <input
                type="color" className="h-8 w-12 cursor-pointer rounded border border-linha"
                value={rascunho[s].cor}
                onChange={(e) => mudar(s, { cor: e.target.value })}
                title="Cor da situação"
              />

              <Selo cor={rascunho[s].cor}>{rascunho[s].rotulo || statusPadrao()[s].rotulo}</Selo>

              {usada && !rascunho[s].usar && (
                <span className="text-[11px] font-bold text-ambar">
                  em uso hoje: continua aparecendo enquanto houver atividade nela
                </span>
              )}
            </div>
          );
        })}
      </div>

      {erro && <div className="mt-3"><Aviso>{erro}</Aviso></div>}

      <div className="mt-4 flex justify-between gap-2">
        <button className="botao-neutro" onClick={() => setRascunho(statusPadrao())}>
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
