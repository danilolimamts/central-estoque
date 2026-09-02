import { useState } from 'react';
import { Aviso, Campo, Modal } from '@/componentes/ui';
import { mensagemDeErro, salvarProjeto } from '@/estado/dados';
import type { Pessoa, Prioridade, Projeto, StatusProjeto } from '@/dominio/tipos';
import { PRIORIDADES, STATUS, rotuloPrioridade, rotuloStatus } from '@/dominio/tipos';

interface Props {
  aberto: boolean;
  projeto: Projeto | null;
  pessoas: Pessoa[];
  aoFechar: () => void;
  aoSalvar: () => Promise<void> | void;
}

const vazio = (v: string) => (v.trim() === '' ? null : v.trim());

export default function FormularioProjeto({ aberto, projeto, pessoas, aoFechar, aoSalvar }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSalvando(true);
    setErro(null);
    try {
      await salvarProjeto({
        nome: String(f.get('nome')),
        codigo: vazio(String(f.get('codigo'))),
        descricao: vazio(String(f.get('descricao'))),
        area: vazio(String(f.get('area'))),
        responsavel_id: vazio(String(f.get('responsavel_id'))),
        status: f.get('status') as StatusProjeto,
        prioridade: f.get('prioridade') as Prioridade,
        inicio_previsto: vazio(String(f.get('inicio_previsto'))),
        fim_previsto: vazio(String(f.get('fim_previsto'))),
        inicio_real: vazio(String(f.get('inicio_real'))),
        fim_real: vazio(String(f.get('fim_real'))),
        percentual: Number(f.get('percentual')),
      }, projeto?.id);
      await aoSalvar();
      aoFechar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={projeto ? 'Editar projeto' : 'Novo projeto'}>
      <form onSubmit={enviar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Campo rotulo="Nome *">
            <input name="nome" required defaultValue={projeto?.nome ?? ''} className="campo" />
          </Campo>
          <Campo rotulo="Código">
            <input name="codigo" defaultValue={projeto?.codigo ?? ''} className="campo" placeholder="PRJ-001" />
          </Campo>
        </div>

        <Campo rotulo="Descrição">
          <textarea name="descricao" rows={2} defaultValue={projeto?.descricao ?? ''} className="campo" />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Área">
            <input name="area" defaultValue={projeto?.area ?? ''} className="campo" placeholder="Recebimento, Expedição…" />
          </Campo>
          <Campo rotulo="Responsável">
            <select name="responsavel_id" defaultValue={projeto?.responsavel_id ?? ''} className="campo">
              <option value="">Sem responsável</option>
              {pessoas.filter((p) => p.ativo).map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Situação">
            <select name="status" defaultValue={projeto?.status ?? 'nao_iniciado'} className="campo">
              {STATUS.map((s) => <option key={s} value={s}>{rotuloStatus[s]}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Prioridade">
            <select name="prioridade" defaultValue={projeto?.prioridade ?? 'media'} className="campo">
              {PRIORIDADES.map((p) => <option key={p} value={p}>{rotuloPrioridade[p]}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Avanço (%)">
            <input name="percentual" type="number" min={0} max={100} defaultValue={projeto?.percentual ?? 0} className="campo" />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo="Início previsto">
            <input name="inicio_previsto" type="date" defaultValue={projeto?.inicio_previsto ?? ''} className="campo" />
          </Campo>
          <Campo rotulo="Fim previsto">
            <input name="fim_previsto" type="date" defaultValue={projeto?.fim_previsto ?? ''} className="campo" />
          </Campo>
          <Campo rotulo="Início real">
            <input name="inicio_real" type="date" defaultValue={projeto?.inicio_real ?? ''} className="campo" />
          </Campo>
          <Campo rotulo="Fim real">
            <input name="fim_real" type="date" defaultValue={projeto?.fim_real ?? ''} className="campo" />
          </Campo>
        </div>

        {erro && <Aviso>{erro}</Aviso>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="botao-neutro" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="botao-primario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
