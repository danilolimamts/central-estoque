import { useMemo, useState } from 'react';
import FormularioProjeto from './FormularioProjeto';
import { Barra, SeloPrioridade, SeloSaude, SeloStatus, Vazio } from '@/componentes/ui';
import { atrasado, diasDeAtraso, formatarData, percentualEsperado, saude } from '@/dominio/regras';
import { filhosDe, percentualEfetivo, rotuloDosFilhos } from '@/dominio/arvore';
import type { Pessoa, Projeto, StatusProjeto } from '@/dominio/tipos';
import { STATUS, rotuloStatus } from '@/dominio/tipos';

interface Props {
  projetos: Projeto[];
  pessoas: Pessoa[];
  aoAbrir: (p: Projeto) => void;
  recarregar: () => Promise<void>;
}

export default function ListaProjetos({ projetos, pessoas, aoAbrir, recarregar }: Props) {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<StatusProjeto | ''>('');
  const [responsavel, setResponsavel] = useState('');
  const [area, setArea] = useState('');
  const [soAtrasados, setSoAtrasados] = useState(false);
  /* Por padrao a carteira mostra so os projetos de topo: com dezenas de
     melhorias dentro de um guarda-chuva, a lista plana vira ruido. */
  const [incluirMelhorias, setIncluirMelhorias] = useState(false);
  const [formAberto, setFormAberto] = useState(false);

  const areas = useMemo(
    () => [...new Set(projetos.map((p) => p.area).filter(Boolean) as string[])].sort(),
    [projetos],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return projetos.filter((p) => {
      if (!incluirMelhorias && p.projeto_pai_id) return false;
      if (termo && !`${p.nome} ${p.codigo ?? ''} ${p.descricao ?? ''}`.toLowerCase().includes(termo)) return false;
      if (status && p.status !== status) return false;
      if (responsavel && p.responsavel_id !== responsavel) return false;
      if (area && p.area !== area) return false;
      if (soAtrasados && !atrasado(p)) return false;
      return true;
    });
  }, [projetos, busca, status, responsavel, area, soAtrasados, incluirMelhorias]);

  const nomePessoa = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '—';

  return (
    <div className="space-y-4">
      {/* Filtros em uma linha unica acima da tabela. */}
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[200px] flex-1">
          <span className="rotulo">Buscar</span>
          <input className="campo" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, código ou descrição" />
        </label>
        <label>
          <span className="rotulo">Situação</span>
          <select className="campo" value={status} onChange={(e) => setStatus(e.target.value as StatusProjeto | '')}>
            <option value="">Todas</option>
            {STATUS.map((s) => <option key={s} value={s}>{rotuloStatus[s]}</option>)}
          </select>
        </label>
        <label>
          <span className="rotulo">Responsável</span>
          <select className="campo" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
            <option value="">Todos</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label>
          <span className="rotulo">Área</span>
          <select className="campo" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
          <input type="checkbox" checked={soAtrasados} onChange={(e) => setSoAtrasados(e.target.checked)} />
          Só atrasados
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
          <input type="checkbox" checked={incluirMelhorias} onChange={(e) => setIncluirMelhorias(e.target.checked)} />
          Incluir melhorias
        </label>
        <div className="ml-auto flex gap-2">
          <button
            className="botao-neutro"
            onClick={async () => {
              /* Importacao tardia: a biblioteca de planilha so desce
                 quando alguem clica em exportar. */
              const { exportarCarteira } = await import('@/exportar/excel');
              exportarCarteira(filtrados, pessoas);
            }}
          >Exportar Excel</button>
          <button className="botao-primario" onClick={() => setFormAberto(true)}>Novo projeto</button>
        </div>
      </div>

      <div className="cartao overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-papel text-left text-[11px] uppercase tracking-wider text-tinta-suave">
              <tr>
                <th className="px-4 py-2 font-bold">Projeto</th>
                <th className="px-4 py-2 font-bold">Área</th>
                <th className="px-4 py-2 font-bold">Responsável</th>
                <th className="px-4 py-2 font-bold">Situação</th>
                <th className="px-4 py-2 font-bold">Prioridade</th>
                <th className="px-4 py-2 font-bold">Prazo</th>
                <th className="px-4 py-2 font-bold">Saúde</th>
                <th className="px-4 py-2 font-bold w-44">Avanço</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="cursor-pointer border-t border-linha hover:bg-papel" onClick={() => aoAbrir(p)}>
                  <td className="px-4 py-2">
                    <span className="font-semibold">{p.nome}</span>
                    {p.codigo && <span className="ml-2 text-xs text-tinta-suave">{p.codigo}</span>}
                    {filhosDe(projetos, p.id).length > 0 && (
                      <span className="ml-2 rounded-full bg-roxo-suave px-2 py-0.5 text-[11px] font-bold text-roxo-escuro">
                        {filhosDe(projetos, p.id).length} {rotuloDosFilhos(p).toLowerCase()}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-tinta-suave">{p.area ?? '—'}</td>
                  <td className="px-4 py-2 text-tinta-suave">{nomePessoa(p.responsavel_id)}</td>
                  <td className="px-4 py-2"><SeloStatus status={p.status} /></td>
                  <td className="px-4 py-2"><SeloPrioridade prioridade={p.prioridade} /></td>
                  <td className="px-4 py-2 text-tinta-suave">
                    {formatarData(p.fim_previsto)}
                    {diasDeAtraso(p) > 0 && <span className="ml-2 font-bold text-vermelho">+{diasDeAtraso(p)}d</span>}
                  </td>
                  <td className="px-4 py-2"><SeloSaude saude={saude(p)} /></td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Barra valor={percentualEfetivo(projetos, p)} esperado={percentualEsperado(p)} />
                      <span className="w-9 text-right text-xs font-bold">
                        {percentualEfetivo(projetos, p)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtrados.length && <Vazio>Nenhum projeto encontrado com estes filtros.</Vazio>}
      </div>

      <FormularioProjeto
        aberto={formAberto} projeto={null} projetos={projetos} pessoas={pessoas}
        aoFechar={() => setFormAberto(false)} aoSalvar={recarregar}
      />
    </div>
  );
}
