/* ============================================================
   Divergencias do SAC (tabela f_divergenciasSAC).

   A tabela traz toda devolucao de elevador registrada pelo SAC. O
   painel so quer um recorte dela: os casos de inversao de base, em que
   a operacao mandou base trocada, de medida errada ou incompativel com
   a coluna.

   ATENCAO - a inversao nao e um campo da planilha. Motivo e Submotivo
   nao tem essa opcao, entao ela e deduzida do texto. As regras estao
   todas em INVERSAO e FORA logo abaixo, de proposito: e o unico lugar
   a mexer quando a classificacao precisar mudar.
   ============================================================ */

export type Origem = 'CD' | 'LOJA';

export interface DivergenciaSAC {
  pedido: string;
  /* Filial que despachou. E o que separa CD de loja. */
  filial: string;
  origem: Origem;
  itemProduto: string;
  produto: string;
  motivo: string;
  submotivo: string;
  comentario: string;
  transportadora: string;
  estado: string;
  canal: string;
  /* Valor da devolucao, sempre positivo. Na planilha vem negativo. */
  valor: number;
  /* Data Emissao Pedido: e a data pedida para o corte por mes. */
  data: Date | null;
}

/* Arrependimento e erro do cliente, nao da operacao: fica de fora por
   regra do projeto, e leva junto o "Comprou Errado", que e o cliente
   escolhendo o modelo errado. */
export const MOTIVO_FORA = 'ARREPENDIMENTO';

/* Termos do Comentario e do Submotivo que dizem que o problema foi na
   base do elevador: base trocada, de medida errada ou que nao chegou. */
const BASE_ENVOLVIDA = [
  'invertid', 'invers', 'base trocada', 'coluna trocada', 'trocaram a base',
  'base no tamanho incorreto', 'base incorreta', 'base errada',
  'furacao da base', 'furacao errada', 'tamanho incorreto',
  'medida errada', 'nao encaixa', 'incompativel',
  'divergencia operacional cd',
  /* Base que nao chegou tambem e divergencia de base. */
  'faltou a base', 'sem a base', 'falta a base',
];

export function semAcento(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export type TipoProduto = 'ELEVADOR' | 'BASE' | 'COLUNA' | 'OUTRO';

/* A descricao do produto comeca pelo tipo: "ELEVADOR AUTOMOTIVO...",
   "BASE PARA ELEVADOR...", "RAMPA PARA ALINHAMENTO...".

   Olhar so o inicio e o que separa o produto do acessorio: "BORRACHA
   PARA SAPATA U PARA ELEVADOR" cita elevador, mas e borracha. Procurar
   a palavra em qualquer posicao traria o acessorio junto. */
export function tipoDoProduto(descricao: string): TipoProduto {
  const t = semAcento(descricao);
  if (t.startsWith('elevador')) return 'ELEVADOR';
  if (t.startsWith('base')) return 'BASE';
  if (t.startsWith('coluna')) return 'COLUNA';
  return 'OUTRO';
}

/* Entra no painel so o que e elevador, base ou coluna: rampa, sapata e
   borracha sao acessorios e nao tem base para inverter. */
export function ehProdutoDeElevador(d: DivergenciaSAC): boolean {
  return tipoDoProduto(d.produto) !== 'OUTRO';
}

/* O caso entra na conta?

   Tres condicoes, na ordem em que foram pedidas:
   1. nao pode ser arrependimento, que e erro do cliente;
   2. o Comentario tem que apontar problema na base do elevador;
   3. o Produto tem que ser elevador ou base, nao acessorio. */
export function ehInversaoDeBase(d: DivergenciaSAC): boolean {
  if (semAcento(d.motivo).includes(semAcento(MOTIVO_FORA))) return false;
  if (!ehProdutoDeElevador(d)) return false;

  const texto = `${semAcento(d.submotivo)} ${semAcento(d.comentario)}`;
  return BASE_ENVOLVIDA.some((t) => texto.includes(t));
}

export function inversoesDeBase(lista: DivergenciaSAC[]): DivergenciaSAC[] {
  return lista.filter(ehInversaoDeBase);
}

/* CD e um indicador; toda filial que nao e CD conta como loja. */
export function origemDaFilial(filial: string): Origem {
  return semAcento(filial).startsWith('cd') ? 'CD' : 'LOJA';
}

export interface Corte {
  quantidade: number;
  valor: number;
}

export interface TotaisDivergencia {
  cd: Corte;
  lojas: Corte;
  total: Corte;
}

function somar(lista: DivergenciaSAC[]): Corte {
  return {
    quantidade: lista.length,
    valor: lista.reduce((s, d) => s + d.valor, 0),
  };
}

export function totalizar(lista: DivergenciaSAC[]): TotaisDivergencia {
  return {
    cd: somar(lista.filter((d) => d.origem === 'CD')),
    lojas: somar(lista.filter((d) => d.origem === 'LOJA')),
    total: somar(lista),
  };
}

export function anosDisponiveis(lista: DivergenciaSAC[]): number[] {
  const anos = new Set<number>();
  for (const d of lista) if (d.data) anos.add(d.data.getUTCFullYear());
  return [...anos].sort((a, z) => z - a);
}

export function doAno(lista: DivergenciaSAC[], ano: number): DivergenciaSAC[] {
  return lista.filter((d) => d.data != null && d.data.getUTCFullYear() === ano);
}

export const MESES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const;

export interface MesDivergencia {
  mes: number; // 0 a 11
  rotulo: string;
  cd: Corte;
  lojas: Corte;
  total: Corte;
}

/* Os doze meses do ano, inclusive os vazios: o mes sem divergencia e
   informacao, some do grafico se for omitido. */
export function porMes(lista: DivergenciaSAC[], ano: number): MesDivergencia[] {
  const doAnoEscolhido = doAno(lista, ano);
  return MESES.map((rotulo, mes) => {
    const doMes = doAnoEscolhido.filter((d) => d.data!.getUTCMonth() === mes);
    const t = totalizar(doMes);
    return { mes, rotulo, cd: t.cd, lojas: t.lojas, total: t.total };
  });
}

export interface LinhaTransportadora {
  transportadora: string;
  quantidade: number;
  valor: number;
  /* Participacao sobre o total de inversoes do periodo. */
  pct: number;
}

/* Ranking das transportadoras. "RETIRA" e o cliente que buscou na loja
   e "Nao localizado" e cadastro em branco: nenhum dos dois e
   transportadora, entao saem do indice para nao sujar o ranking. */
const NAO_SAO_TRANSPORTADORA = ['retira', 'nao localizado', ''];

export function porTransportadora(lista: DivergenciaSAC[]): LinhaTransportadora[] {
  const validas = lista.filter((d) => !NAO_SAO_TRANSPORTADORA.includes(semAcento(d.transportadora)));
  const total = validas.length;
  const mapa = new Map<string, { quantidade: number; valor: number }>();
  for (const d of validas) {
    const nome = d.transportadora.trim() || '—';
    const atual = mapa.get(nome) ?? { quantidade: 0, valor: 0 };
    atual.quantidade++;
    atual.valor += d.valor;
    mapa.set(nome, atual);
  }
  return [...mapa.entries()]
    .map(([transportadora, v]) => ({
      transportadora,
      quantidade: v.quantidade,
      valor: v.valor,
      pct: total > 0 ? (v.quantidade / total) * 100 : 0,
    }))
    .sort((a, z) => z.quantidade - a.quantidade || z.valor - a.valor);
}

/* Variacao do mes contra o anterior, para a frase do painel. */
export function variacaoMensal(meses: MesDivergencia[], mes: number): number | null {
  if (mes <= 0) return null;
  const anterior = meses[mes - 1]?.total.quantidade ?? 0;
  const atual = meses[mes]?.total.quantidade ?? 0;
  if (anterior === 0) return atual === 0 ? 0 : null;
  return ((atual - anterior) / anterior) * 100;
}

export function formatarReal(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
