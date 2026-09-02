import { useEffect, useMemo, useState } from 'react';
import { Aviso, SeloStatus, Vazio } from '@/componentes/ui';
import { coresStatus } from '@/config/tokens';
import { diasEntre, encerrado, formatarData, hoje, paraData } from '@/dominio/regras';
import { listarMarcosGerais, mensagemDeErro } from '@/estado/dados';
import type { Marco, Projeto } from '@/dominio/tipos';

interface Props {
  projetos: Projeto[];
  aoAbrir: (p: Projeto) => void;
}

interface Faixa { inicio: Date; fim: Date; total: number }

function calcularFaixa(lista: Projeto[]): Faixa | null {
  const datas = lista
    .flatMap((p) => [paraData(p.inicio_previsto), paraData(p.fim_previsto)])
    .filter((d): d is Date => d !== null);
  if (!datas.length) return null;
  const min = new Date(Math.min(...datas.map((d) => d.getTime())));
  const max = new Date(Math.max(...datas.map((d) => d.getTime())));
  /* A faixa comeca no primeiro dia do mes e termina no ultimo: sem
     isso as colunas de mes ficam desalinhadas das barras. */
  const inicio = new Date(min.getFullYear(), min.getMonth(), 1);
  const fim = new Date(max.getFullYear(), max.getMonth() + 1, 0);
  return { inicio, fim, total: Math.max(1, diasEntre(inicio, fim)) };
}

function meses(faixa: Faixa) {
  const lista: { rotulo: string; largura: number }[] = [];
  const cursor = new Date(faixa.inicio);
  while (cursor <= faixa.fim) {
    const fimDoMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const ate = fimDoMes > faixa.fim ? faixa.fim : fimDoMes;
    lista.push({
      rotulo: cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      largura: ((diasEntre(cursor, ate) + 1) / faixa.total) * 100,
    });
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }
  return lista;
}

export default function Cronograma({ projetos, aoAbrir }: Props) {
  const [marcos, setMarcos] = useState<Marco[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);

  useEffect(() => {
    listarMarcosGerais().then(setMarcos).catch((e) => setErro(mensagemDeErro(e)));
  }, []);

  const lista = useMemo(
    () => projetos
      .filter((p) => (mostrarEncerrados || !encerrado(p)) && (p.inicio_previsto || p.fim_previsto))
      .sort((a, b) => (a.inicio_previsto ?? a.fim_previsto ?? '').localeCompare(b.inicio_previsto ?? b.fim_previsto ?? '')),
    [projetos, mostrarEncerrados],
  );

  const faixa = useMemo(() => calcularFaixa(lista), [lista]);
  const colunas = faixa ? meses(faixa) : [];
  const posicao = (d: Date) => (faixa ? (diasEntre(faixa.inicio, d) / faixa.total) * 100 : 0);
  const marcaHoje = faixa && hoje() >= faixa.inicio && hoje() <= faixa.fim ? posicao(hoje()) : null;

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!faixa || !lista.length) {
    return <div className="cartao p-4"><Vazio>Nenhum projeto com datas previstas para montar o cronograma.</Vazio></div>;
  }

  return (
    <div className="cartao overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha px-4 py-3">
        <h2 className="font-titulo text-sm font-extrabold">Cronograma</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mostrarEncerrados} onChange={(e) => setMostrarEncerrados(e.target.checked)} />
          Mostrar encerrados
        </label>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="flex border-b border-linha bg-papel text-[11px] font-bold uppercase tracking-wider text-tinta-suave">
            <div className="w-64 shrink-0 px-4 py-2">Projeto</div>
            <div className="relative flex flex-1 pr-4">
              {colunas.map((m) => (
                <div key={m.rotulo} className="border-l border-linha px-1 py-2" style={{ width: `${m.largura}%` }}>
                  {m.rotulo}
                </div>
              ))}
            </div>
          </div>

          {lista.map((p) => {
            const ini = paraData(p.inicio_previsto) ?? paraData(p.fim_previsto)!;
            const fim = paraData(p.fim_previsto) ?? ini;
            const esquerda = posicao(ini);
            const largura = Math.max(1.2, posicao(fim) - esquerda);
            const doProjeto = marcos.filter((m) => m.projeto_id === p.id && m.data_prevista);

            return (
              <div key={p.id} className="flex cursor-pointer items-center border-b border-linha hover:bg-papel" onClick={() => aoAbrir(p)}>
                <div className="w-64 shrink-0 px-4 py-2">
                  <p className="truncate text-sm font-semibold" title={p.nome}>{p.nome}</p>
                  <p className="text-xs text-tinta-suave">{formatarData(p.inicio_previsto)} → {formatarData(p.fim_previsto)}</p>
                </div>
                <div className="relative h-12 flex-1 pr-4">
                  {marcaHoje !== null && (
                    <span className="absolute top-0 h-full border-l border-dashed border-vermelho/60" style={{ left: `${marcaHoje}%` }} />
                  )}
                  <div
                    className="absolute top-3 h-5 rounded-md"
                    style={{ left: `${esquerda}%`, width: `${largura}%`, backgroundColor: `${coresStatus[p.status]}33` }}
                    title={`${p.nome} — ${p.percentual}%`}
                  >
                    {/* Preenchimento interno = avanco informado. */}
                    <div className="h-full rounded-md" style={{ width: `${p.percentual}%`, backgroundColor: coresStatus[p.status] }} />
                  </div>
                  {doProjeto.map((m) => (
                    <span
                      key={m.id}
                      className="absolute top-[18px] h-3 w-3 rotate-45 border-2 border-white"
                      style={{
                        left: `calc(${posicao(paraData(m.data_prevista)!)}% - 6px)`,
                        backgroundColor: m.concluido ? '#2E8B57' : '#161933',
                      }}
                      title={`${m.nome} — ${formatarData(m.data_prevista)}${m.concluido ? ' (concluído)' : ''}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-xs text-tinta-suave">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rotate-45 bg-tinta" /> Marco previsto
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rotate-45 bg-verde" /> Marco concluído
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 border-l border-dashed border-vermelho" /> Hoje
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {[...new Set(lista.map((p) => p.status))].map((s) => <SeloStatus key={s} status={s} />)}
        </span>
      </div>
    </div>
  );
}
