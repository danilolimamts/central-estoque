/* ============================================================
   Componentes de interface.

   Usam as mesmas classes do design system do Inventario Rotativo
   (src/estilos/tema.css), para os dois apps terem a mesma cara:
   painel com relevo suave, KPI com faixa colorida no topo, tabela
   com cabecalho azul, tags arredondadas e barra de filtros.
   ============================================================ */
import type { ReactNode, CSSProperties } from 'react';
import type { StatusConjunto, DiagnosticoValoracao } from '../../domain/tipos';

/* Aceita os nomes em portugues e os valores do CSS, porque as telas
   foram escritas com as duas formas. */
type Alinhamento = 'esquerda' | 'direita' | 'centro' | 'left' | 'right' | 'center';

function paraAlinhamento(direita?: boolean, alinha?: Alinhamento): CSSProperties['textAlign'] {
  if (alinha === 'direita' || alinha === 'right') return 'right';
  if (alinha === 'centro' || alinha === 'center') return 'center';
  if (alinha === 'esquerda' || alinha === 'left') return 'left';
  return direita ? 'right' : undefined;
}

export function Cartao({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo?: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      {(titulo || acoes) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            {titulo && <h3>{titulo}</h3>}
            {descricao && <div className="panel-sub" style={{ marginBottom: 0 }}>{descricao}</div>}
          </div>
          {acoes && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{acoes}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* Faixa colorida no topo do cartao, como no Inventario Rotativo. */
type TomKpi = 'azul' | 'laranja' | 'bom' | 'ruim';
const CLASSE_TOM: Record<TomKpi, string> = {
  azul: '',
  laranja: 'orange',
  bom: 'good',
  ruim: 'bad',
};

export function Kpi({
  rotulo,
  valor,
  detalhe,
  dica,
  sufixo,
  tom,
  cor,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  /* Texto de apoio abaixo do numero. */
  dica?: ReactNode;
  /* Unidade colada ao numero, por exemplo "un". */
  sufixo?: string;
  tom?: TomKpi;
  /* Cor livre da faixa do topo, quando nao for um dos tons do tema. */
  cor?: string;
}) {
  const apoio = detalhe ?? dica;
  return (
    <div className={`kpi-card ${tom ? CLASSE_TOM[tom] : ''}`}>
      {cor && !tom && (
        <span
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: cor }}
        />
      )}
      <div className="num">
        {valor}
        {sufixo && <span style={{ fontSize: 13, marginLeft: 3, color: 'var(--ink-soft)' }}>{sufixo}</span>}
      </div>
      <div className="label">{rotulo}</div>
      {apoio && <div className="sub">{apoio}</div>}
    </div>
  );
}

export function GradeKpis({ children }: { children: ReactNode }) {
  return <div className="kpi-grid">{children}</div>;
}

type TomTag = 'blue' | 'orange' | 'good' | 'bad' | 'muted';

export function Selo({
  children,
  tom,
  cor,
}: {
  children: ReactNode;
  tom?: TomTag;
  /* Cor livre, para os casos que nao caem nos tons do tema. */
  cor?: string;
}) {
  if (cor && !tom) {
    return (
      <span className="tag" style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
        {children}
      </span>
    );
  }
  return <span className={`tag tag-${tom ?? 'muted'}`}>{children}</span>;
}

const TOM_STATUS: Record<StatusConjunto, TomTag> = {
  CASADO: 'good',
  REVERSA: 'orange',
  DESCASADO: 'bad',
  'SEM ESTOQUE': 'muted',
};

export function SeloStatus({ status }: { status: StatusConjunto }) {
  return <Selo tom={TOM_STATUS[status]}>{status}</Selo>;
}

const TOM_VALORACAO: Record<DiagnosticoValoracao, TomTag> = {
  OK: 'good',
  CORRIGIR: 'bad',
  DUPLICADO: 'orange',
  'SEM S': 'muted',
};

const ROTULO_VALORACAO: Record<DiagnosticoValoracao, string> = {
  OK: 'OK',
  CORRIGIR: 'S na base',
  DUPLICADO: 'S duplicado',
  'SEM S': 'Sem S',
};

export function SeloValoracao({ diagnostico }: { diagnostico: DiagnosticoValoracao }) {
  return <Selo tom={TOM_VALORACAO[diagnostico]}>{ROTULO_VALORACAO[diagnostico]}</Selo>;
}

/* Selo S / N usado no meio do texto da auditoria. */
export function SeloSN({ valor }: { valor: 'S' | 'N' }) {
  return <span className={`eq-sn ${valor === 'S' ? 's' : 'n'}`}>{valor}</span>;
}

export function Barra({
  nome,
  valor,
  maximo,
  cor,
  tom,
}: {
  nome: string;
  valor: number;
  maximo: number;
  /* Aceita uma cor livre (usada pelos rankings) ou um tom do tema. */
  cor?: string;
  tom?: 'azul' | 'laranja' | 'bom' | 'ruim';
}) {
  const largura = maximo > 0 ? Math.max(2, Math.round((valor / maximo) * 100)) : 0;
  const classe = tom === 'laranja' ? 'orange' : tom === 'bom' ? 'pos' : tom === 'ruim' ? 'neg' : '';
  return (
    <div className="bi-hbar-row">
      <div className="bi-hbar-label" title={nome}>
        {nome}
      </div>
      <div className="bi-hbar-track">
        <div
          className={`bi-hbar-fill ${classe}`}
          style={{ width: `${largura}%`, background: cor || undefined }}
        />
      </div>
      <div className="bi-hbar-val">{valor.toLocaleString('pt-BR')}</div>
    </div>
  );
}

export function Tabela({
  children,
  altura,
  style,
}: {
  children: ReactNode;
  altura?: number;
  style?: CSSProperties;
}) {
  return (
    <div className="table-wrap">
      <div className="table-scroll" style={altura ? { maxHeight: altura, ...style } : style}>
        <table>{children}</table>
      </div>
    </div>
  );
}

export function Th({
  children,
  direita,
  alinha,
  largura,
  style,
}: {
  children: ReactNode;
  direita?: boolean;
  alinha?: Alinhamento;
  largura?: number;
  style?: CSSProperties;
}) {
  return (
    <th style={{ textAlign: paraAlinhamento(direita, alinha) ?? 'left', width: largura, cursor: 'default', ...style }}>
      {children}
    </th>
  );
}

export function Td({
  children,
  direita,
  alinha,
  mono,
  numerico,
  style,
}: {
  children: ReactNode;
  direita?: boolean;
  alinha?: Alinhamento;
  mono?: boolean;
  /* Numero alinhado em coluna, com fonte de largura fixa. */
  numerico?: boolean;
  style?: CSSProperties;
}) {
  return (
    <td
      className={mono || numerico ? 'mono' : undefined}
      style={{ textAlign: paraAlinhamento(direita || numerico, alinha), ...style }}
    >
      {children}
    </td>
  );
}

export function BarraFiltros({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}

export function Campo({
  rotulo,
  children,
}: {
  rotulo?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ margin: 0 }}>
      {rotulo}
      {children}
    </label>
  );
}

export function Busca({
  valor,
  aoMudar,
  placeholder,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
    />
  );
}

export function Selecao<T extends string>({
  valor,
  aoMudar,
  opcoes,
  rotulo,
  rotuloTodos,
}: {
  valor: T;
  aoMudar: (v: T) => void;
  /* Aceita a lista pronta ou so os valores, quando o rotulo e o proprio valor. */
  opcoes: readonly (T | { valor: T; rotulo: string })[];
  rotulo?: string;
  /* Primeira opcao, que representa "sem filtro". */
  rotuloTodos?: string;
}) {
  const lista = opcoes.map((o) =>
    typeof o === 'string' ? { valor: o as T, rotulo: o as string } : o
  );
  return (
    <select
      value={valor}
      onChange={(e) => aoMudar(e.target.value as T)}
      aria-label={rotulo ?? rotuloTodos}
      style={{ width: 'auto' }}
    >
      {rotuloTodos && <option value="">{rotuloTodos}</option>}
      {lista.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}

/* Alternador de visao (por marca / por fabricante), no formato de chips. */
export function Chips<T extends string>({
  valor,
  aoMudar,
  opcoes,
}: {
  valor: T;
  aoMudar: (v: T) => void;
  opcoes: { valor: T; rotulo: string }[];
}) {
  return (
    <>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          className={`chip ${valor === o.valor ? 'active' : ''}`}
          aria-pressed={valor === o.valor}
          onClick={() => aoMudar(o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </>
  );
}

export function Botao({
  children,
  aoClicar,
  variante = 'secundario',
  desabilitado,
  titulo,
}: {
  children: ReactNode;
  aoClicar?: () => void;
  variante?: 'primario' | 'secundario' | 'laranja';
  desabilitado?: boolean;
  titulo?: string;
}) {
  const classe =
    variante === 'primario' ? 'btn-primary' : variante === 'laranja' ? 'btn-orange' : 'btn-secondary';
  return (
    <button
      className={`btn ${classe}`}
      onClick={aoClicar}
      disabled={desabilitado}
      title={titulo}
      style={desabilitado ? { opacity: 0.5, cursor: 'default' } : undefined}
    >
      {children}
    </button>
  );
}

export function Vazio({ children, icone = '📭' }: { children: ReactNode; icone?: string }) {
  return (
    <div className="empty-state">
      <div className="eicon">{icone}</div>
      <div style={{ fontSize: 12.5 }}>{children}</div>
    </div>
  );
}

/* Marca visual do fornecedor: sigla colorida antes do nome, como no v3.
   As logos dos fabricantes sao marcas de terceiros e nao podem ser
   embutidas, entao cada um recebe sigla e cor fixas da paleta. */
const MARCAS_VISUAIS: Record<string, { sigla: string; cor: string }> = {
  ENGECASS: { sigla: 'EGC', cor: '#001A72' },
  'MAQUINAS RIBEIRO': { sigla: 'MR', cor: '#FA4616' },
  'JM MAQUINAS': { sigla: 'JM', cor: '#33488E' },
  JM: { sigla: 'JM', cor: '#33488E' },
  KREBS: { sigla: 'KRB', cor: '#C83812' },
  AUTOP: { sigla: 'ATP', cor: '#1A3180' },
  'LOJA DO MECANICO': { sigla: 'LDM', cor: '#FE5000' },
  RIBEIRO: { sigla: 'RIB', cor: '#E13F14' },
  FORTG: { sigla: 'FTG', cor: '#4C4A55' },
};

const PALETA_FORNEC = [
  '#001A72', '#FA4616', '#33488E', '#C83812', '#1A3180',
  '#E13F14', '#4C4A55', '#00155B', '#F8592D', '#0B1934',
];

export function marcaVisual(nome: string): { sigla: string; cor: string } {
  const n = (nome || '').toUpperCase().trim();
  if (MARCAS_VISUAIS[n]) return MARCAS_VISUAIS[n];
  const palavras = n.split(/\s+/).filter(Boolean);
  const sigla = (palavras.length > 1 ? palavras.map((p) => p[0]).join('') : n.slice(0, 3)).slice(0, 3) || '?';
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return { sigla, cor: PALETA_FORNEC[h % PALETA_FORNEC.length] };
}

export function Fornecedor({ nome }: { nome: string }) {
  const m = marcaVisual(nome);
  return (
    <span className="eq-fornec">
      <span className="eq-fornec-sigla" style={{ background: m.cor }}>
        {m.sigla}
      </span>
      <span>{nome || '—'}</span>
    </span>
  );
}
