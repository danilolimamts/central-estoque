/* ============================================================
   Componentes de UI compartilhados. Todos estilizados pelos
   tokens em estilos.css, para funcionarem nos dois temas.
   ============================================================ */
import type { ReactNode, CSSProperties } from 'react';
import { coresStatus } from '../../config/tokens';
import type { StatusConjunto, DiagnosticoValoracao } from '../../domain/tipos';

export function Cartao({
  titulo,
  descricao,
  acoes,
  children,
  className = '',
}: {
  titulo?: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`cartao ${className}`}>
      {titulo && (
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-3.5">
          <h2 className="text-[15px]">{titulo}</h2>
          {descricao && (
            <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              {descricao}
            </span>
          )}
          {acoes && <div className="ml-auto">{acoes}</div>}
        </header>
      )}
      <div className="px-4 pb-4 pt-3.5">{children}</div>
    </section>
  );
}

export function Kpi({
  rotulo,
  valor,
  sufixo,
  dica,
  cor = 'var(--laranja)',
}: {
  rotulo: string;
  valor: ReactNode;
  sufixo?: string;
  dica?: string;
  cor?: string;
}) {
  return (
    <div
      className="cartao relative overflow-hidden px-4 py-3.5 transition-transform hover:-translate-y-0.5"
      style={{ boxShadow: 'var(--sombra)' }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: cor }} aria-hidden="true" />
      <div className="text-[11.5px] uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
        {rotulo}
      </div>
      <div className="num mt-1.5 text-3xl leading-tight">
        {valor}
        {sufixo && (
          <small className="ml-1 font-sans text-sm" style={{ color: 'var(--ink-soft)' }}>
            {sufixo}
          </small>
        )}
      </div>
      {dica && (
        <div className="mt-1 text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>
          {dica}
        </div>
      )}
    </div>
  );
}

export function Selo({ children, cor }: { children: ReactNode; cor: string }) {
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold"
      style={{ background: `${cor}22`, color: cor }}
    >
      {children}
    </span>
  );
}

export function SeloStatus({ status }: { status: StatusConjunto }) {
  return <Selo cor={coresStatus[status]}>{status}</Selo>;
}

const CORES_VALORACAO: Record<DiagnosticoValoracao, string> = {
  OK: 'var(--verde)',
  CORRIGIR: 'var(--laranja)',
  DUPLICADO: 'var(--navy)',
  'SEM S': 'var(--ambar)',
};

export function SeloValoracao({ diagnostico }: { diagnostico: DiagnosticoValoracao }) {
  return <Selo cor={CORES_VALORACAO[diagnostico]}>{diagnostico}</Selo>;
}

/* Barra horizontal usada nos rankings. */
export function Barra({
  nome,
  valor,
  maximo,
  cor = 'var(--laranja)',
  larguraNome = 140,
}: {
  nome: string;
  valor: number;
  maximo: number;
  cor?: string;
  larguraNome?: number;
}) {
  const pct = maximo > 0 ? Math.max(3, Math.round((valor / maximo) * 100)) : 0;
  return (
    <div
      className="mb-2 grid items-center gap-2.5"
      style={{ gridTemplateColumns: `${larguraNome}px 1fr 48px` }}
    >
      <div className="truncate text-xs" title={nome}>
        {nome}
      </div>
      <div className="h-4 overflow-hidden rounded" style={{ background: 'var(--surface-2)' }}>
        <div className="h-full rounded" style={{ width: `${pct}%`, background: cor }} />
      </div>
      <div className="num text-right text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
        {valor.toLocaleString('pt-BR')}
      </div>
    </div>
  );
}

export function Tabela({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="rolagem-x">
      <table className="w-full border-collapse text-[12.5px]" style={style}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  alinha = 'left',
}: {
  children?: ReactNode;
  alinha?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      className="whitespace-nowrap px-3 py-2.5 text-[11.5px] font-medium"
      style={{ background: 'var(--navy)', color: '#fff', textAlign: alinha, fontFamily: 'Poppins, sans-serif' }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  alinha = 'left',
  numerico = false,
}: {
  children?: ReactNode;
  alinha?: 'left' | 'right' | 'center';
  numerico?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2.5 ${numerico ? 'tabular-nums' : ''}`}
      style={{ borderBottom: '1px solid var(--line)', textAlign: alinha }}
    >
      {children}
    </td>
  );
}

export function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
        {rotulo}
      </span>
      {children}
    </label>
  );
}

const CLASSE_CONTROLE =
  'rounded-lg border px-2.5 py-1.5 text-[12.5px] outline-none';
const ESTILO_CONTROLE: CSSProperties = {
  borderColor: 'var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
};

export function Selecao({
  valor,
  aoMudar,
  opcoes,
  rotuloTodos = 'Todos',
}: {
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: string[];
  rotuloTodos?: string;
}) {
  return (
    <select
      className={CLASSE_CONTROLE}
      style={ESTILO_CONTROLE}
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
    >
      <option value="">{rotuloTodos}</option>
      {opcoes.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Busca({
  valor,
  aoMudar,
  placeholder,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      className={CLASSE_CONTROLE}
      style={ESTILO_CONTROLE}
      value={valor}
      placeholder={placeholder}
      onChange={(e) => aoMudar(e.target.value)}
    />
  );
}

export function Botao({
  children,
  aoClicar,
  variante = 'primario',
  tipo = 'button',
  desabilitado = false,
}: {
  children: ReactNode;
  aoClicar?: () => void;
  variante?: 'primario' | 'secundario';
  tipo?: 'button' | 'submit';
  desabilitado?: boolean;
}) {
  const primario = variante === 'primario';
  return (
    <button
      type={tipo}
      onClick={aoClicar}
      disabled={desabilitado}
      className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        fontFamily: 'Poppins, sans-serif',
        background: primario ? 'var(--laranja)' : 'var(--surface-2)',
        color: primario ? '#fff' : 'var(--ink)',
        border: `1px solid ${primario ? 'var(--laranja)' : 'var(--line)'}`,
      }}
    >
      {children}
    </button>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-center text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
      {children}
    </p>
  );
}
