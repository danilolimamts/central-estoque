import { useMemo } from 'react';
import Grafico from '@/componentes/Grafico';
import { Barra, Indicador, SeloSaude, SeloStatus, Vazio } from '@/componentes/ui';
import { coresStatus } from '@/config/tokens';
import {
  atrasado, calcularIndicadores, diasDeAtraso, encerrado, entregasPorMes,
  formatarData, percentualEsperado, saude, venceEm,
} from '@/dominio/regras';
import type { Pessoa, Projeto } from '@/dominio/tipos';
import { STATUS, rotuloStatus } from '@/dominio/tipos';

interface Props {
  projetos: Projeto[];
  pessoas: Pessoa[];
  aoAbrir: (p: Projeto) => void;
}

export default function Painel({ projetos, pessoas, aoAbrir }: Props) {
  const indicadores = useMemo(() => calcularIndicadores(projetos), [projetos]);
  const entregas = useMemo(() => entregasPorMes(projetos), [projetos]);
  const nomePessoa = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '—';

  /* Fila de atencao: atrasados primeiro, depois o que vence em 15 dias.
     E o unico recorte do painel que pede acao imediata. */
  const atencao = useMemo(() => projetos
    .filter((p) => !encerrado(p) && (atrasado(p) || venceEm(p, 15)))
    .sort((a, b) => diasDeAtraso(b) - diasDeAtraso(a) || (a.fim_previsto ?? '').localeCompare(b.fim_previsto ?? '')),
  [projetos]);

  const usados = STATUS.filter((s) => indicadores.porStatus[s] > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Indicador titulo="Em andamento" valor={indicadores.ativos} detalhe={`${indicadores.total} no total`} />
        <Indicador titulo="Atrasados" valor={indicadores.atrasados} cor="#D2453A" detalhe="passaram do fim previsto" />
        <Indicador titulo="Vencendo" valor={indicadores.vencendo} cor="#C79212" detalhe="nos próximos 15 dias" />
        <Indicador titulo="Concluídos" valor={indicadores.concluidos} cor="#2E8B57" detalhe="no histórico" />
        <Indicador titulo="Avanço médio" valor={`${indicadores.percentualMedio}%`} detalhe="projetos não encerrados" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="cartao p-4">
          <h2 className="mb-3 font-titulo text-sm font-extrabold">Projetos por situação</h2>
          {usados.length ? (
            <Grafico
              serie="Projetos"
              horizontal
              altura={Math.max(160, usados.length * 42)}
              rotulos={usados.map((s) => rotuloStatus[s])}
              valores={usados.map((s) => indicadores.porStatus[s])}
              cores={usados.map((s) => coresStatus[s])}
            />
          ) : <Vazio>Nenhum projeto cadastrado ainda.</Vazio>}
        </div>

        <div className="cartao p-4">
          <h2 className="mb-3 font-titulo text-sm font-extrabold">Entregas concluídas por mês</h2>
          <Grafico
            serie="Entregas"
            altura={240}
            rotulos={entregas.map((e) => e.rotulo)}
            valores={entregas.map((e) => e.total)}
            cores="#6D28D9"
          />
        </div>
      </div>

      <div className="cartao overflow-hidden">
        <div className="flex items-center justify-between border-b border-linha px-4 py-3">
          <h2 className="font-titulo text-sm font-extrabold">Requer atenção</h2>
          <span className="text-xs text-tinta-suave">{atencao.length} projeto(s)</span>
        </div>
        {atencao.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-papel text-left text-[11px] uppercase tracking-wider text-tinta-suave">
                <tr>
                  <th className="px-4 py-2 font-bold">Projeto</th>
                  <th className="px-4 py-2 font-bold">Responsável</th>
                  <th className="px-4 py-2 font-bold">Situação</th>
                  <th className="px-4 py-2 font-bold">Fim previsto</th>
                  <th className="px-4 py-2 font-bold">Saúde</th>
                  <th className="px-4 py-2 font-bold w-40">Avanço</th>
                </tr>
              </thead>
              <tbody>
                {atencao.map((p) => (
                  <tr key={p.id} className="cursor-pointer border-t border-linha hover:bg-papel" onClick={() => aoAbrir(p)}>
                    <td className="px-4 py-2 font-semibold">{p.nome}</td>
                    <td className="px-4 py-2 text-tinta-suave">{nomePessoa(p.responsavel_id)}</td>
                    <td className="px-4 py-2"><SeloStatus status={p.status} /></td>
                    <td className="px-4 py-2 text-tinta-suave">
                      {formatarData(p.fim_previsto)}
                      {diasDeAtraso(p) > 0 && (
                        <span className="ml-2 font-bold text-vermelho">+{diasDeAtraso(p)}d</span>
                      )}
                    </td>
                    <td className="px-4 py-2"><SeloSaude saude={saude(p)} /></td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Barra valor={p.percentual} esperado={percentualEsperado(p)} />
                        <span className="w-9 text-right text-xs font-bold">{p.percentual}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Vazio>Nenhum projeto atrasado ou vencendo nos próximos 15 dias.</Vazio>}
      </div>
    </div>
  );
}
