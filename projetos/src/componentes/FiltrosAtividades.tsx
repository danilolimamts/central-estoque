import { Selo } from '@/componentes/ui';
import { coresStatus } from '@/config/tokens';
import { CONTEUDOS, alternar, filtrosAtivos, filtrosVazios } from '@/dominio/filtros';
import type { FiltroDePrazo, FiltrosDeAtividade, Presenca } from '@/dominio/filtros';
import type { Pessoa, Prioridade, StatusProjeto } from '@/dominio/tipos';
import { PRIORIDADES, STATUS, rotuloPrioridade, rotuloStatus } from '@/dominio/tipos';

interface Props {
  filtros: FiltrosDeAtividade;
  aoMudar: (f: FiltrosDeAtividade) => void;
  pessoas: Pessoa[];
  aberto: boolean;
  aoAlternar: () => void;
  mostrando: number;
  total: number;
}

const PRAZOS: { valor: FiltroDePrazo; rotulo: string }[] = [
  { valor: 'tanto', rotulo: 'Qualquer prazo' },
  { valor: 'vencidas', rotulo: 'Vencidas' },
  { valor: 'proximas', rotulo: 'Vencem em 7 dias' },
  { valor: 'sem_prazo', rotulo: 'Sem prazo' },
];

/* Tres botoes em vez de caixa marcada: "tanto faz", "com" e "sem".
   Perguntar "quais melhorias ainda nao tem documentacao" e o uso mais
   frequente, e com caixa simples isso nao se pergunta. */
function Presente({ rotulo, valor, aoMudar }: {
  rotulo: string; valor: Presenca; aoMudar: (v: Presenca) => void;
}) {
  const opcoes: { v: Presenca; r: string }[] = [
    { v: 'tanto', r: '—' }, { v: 'com', r: 'Com' }, { v: 'sem', r: 'Sem' },
  ];
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="truncate text-xs text-tinta">{rotulo}</span>
      <div className="flex shrink-0 rounded-lg border border-linha p-0.5 text-[11px] font-bold">
        {opcoes.map((o) => (
          <button
            key={o.v}
            onClick={() => aoMudar(o.v)}
            className={`rounded px-1.5 py-0.5 ${
              valor === o.v ? 'bg-roxo-suave text-roxo-escuro' : 'text-tinta-suave hover:text-tinta'
            }`}
          >{o.r}</button>
        ))}
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-linha px-3 py-3 first:border-t-0">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-tinta-suave">{titulo}</p>
      {children}
    </div>
  );
}

/* Barra de filtros da lista de atividades. Retratil porque o quadro
   precisa da largura toda quando ninguem esta filtrando: fechada, sobra
   so a aba com o numero de filtros ligados. */
export default function FiltrosAtividades({
  filtros, aoMudar, pessoas, aberto, aoAlternar, mostrando, total,
}: Props) {
  const ativos = filtrosAtivos(filtros);

  if (!aberto) {
    return (
      <div className="shrink-0 border-b border-linha p-2 lg:border-b-0 lg:border-r">
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-roxo-escuro hover:bg-papel lg:h-full lg:w-auto lg:flex-col lg:justify-start"
          onClick={aoAlternar}
          title="Abrir filtros"
        >
          <span aria-hidden>»</span>
          <span className="lg:[writing-mode:vertical-rl]">Filtros</span>
          {ativos > 0 && (
            <span className="rounded-full bg-roxo px-1.5 text-[11px] text-white">{ativos}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <aside className="shrink-0 border-b border-linha lg:w-60 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-xs font-bold text-tinta">
          Filtros {ativos > 0 && <span className="text-roxo-escuro">({ativos})</span>}
        </span>
        <div className="flex items-center gap-2">
          {ativos > 0 && (
            <button className="text-[11px] font-bold text-tinta-suave hover:text-vermelho" onClick={() => aoMudar(filtrosVazios())}>
              Limpar
            </button>
          )}
          <button className="text-xs font-bold text-roxo-escuro" onClick={aoAlternar} title="Fechar filtros">«</button>
        </div>
      </div>

      <Grupo titulo="Buscar">
        <input
          className="campo py-1 text-xs" value={filtros.texto}
          onChange={(e) => aoMudar({ ...filtros, texto: e.target.value })}
          placeholder="Nome, código ou descrição"
        />
      </Grupo>

      <Grupo titulo="Tem dentro">
        {CONTEUDOS.map(({ campo, rotulo }) => (
          <Presente
            key={campo} rotulo={rotulo} valor={filtros[campo]}
            aoMudar={(v) => aoMudar({ ...filtros, [campo]: v })}
          />
        ))}
      </Grupo>

      <Grupo titulo="Situação">
        <div className="flex flex-wrap gap-1">
          {STATUS.map((s) => (
            <button
              key={s}
              onClick={() => aoMudar({ ...filtros, status: alternar<StatusProjeto>(filtros.status, s) })}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold transition ${
                filtros.status.includes(s)
                  ? 'border-transparent text-white'
                  : 'border-linha text-tinta-suave hover:border-roxo-claro'
              }`}
              style={filtros.status.includes(s) ? { backgroundColor: coresStatus[s] } : undefined}
            >{rotuloStatus[s]}</button>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Prioridade">
        <div className="flex flex-wrap gap-1">
          {PRIORIDADES.map((p) => (
            <button
              key={p}
              onClick={() => aoMudar({ ...filtros, prioridades: alternar<Prioridade>(filtros.prioridades, p) })}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold transition ${
                filtros.prioridades.includes(p)
                  ? 'border-roxo bg-roxo-suave text-roxo-escuro'
                  : 'border-linha text-tinta-suave hover:border-roxo-claro'
              }`}
            >{rotuloPrioridade[p]}</button>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Prazo">
        <select
          className="campo py-1 text-xs" value={filtros.prazo}
          onChange={(e) => aoMudar({ ...filtros, prazo: e.target.value as FiltroDePrazo })}
        >
          {PRAZOS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
        </select>
      </Grupo>

      <Grupo titulo="Responsável">
        <select
          className="campo py-1 text-xs" value={filtros.responsavelId}
          onChange={(e) => aoMudar({ ...filtros, responsavelId: e.target.value })}
        >
          <option value="">Qualquer um</option>
          {pessoas.filter((p) => p.ativo).map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </Grupo>

      <div className="border-t border-linha px-3 py-2">
        <Selo cor={mostrando === total ? '#6A6F94' : '#6D28D9'}>
          {mostrando} de {total}
        </Selo>
      </div>
    </aside>
  );
}
