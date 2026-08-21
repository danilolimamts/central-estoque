/* ============================================================
   Divergencias do SAC (tabela f_divergenciasSAC).

   A tabela traz toda devolucao de elevador registrada pelo SAC. O
   painel so quer o que foi erro do CD: item trocado (inversao) ou item
   que nao foi junto (peca faltando). O que e do cliente, da marca ou
   do transporte fica de fora.

   ATENCAO - a causa nao e um campo da planilha. Motivo e Submotivo nao
   tem essa opcao, entao ela e deduzida do texto. As regras estao todas
   em MOTIVOS_FORA, TERMOS_INVERSAO e TERMOS_FALTA logo abaixo, de
   proposito: e o unico lugar a mexer quando a classificacao mudar.
   ============================================================ */

export type Origem = 'CD' | 'LOJA';

export interface DivergenciaSAC {
  pedido: string;
  /* Id Entrega. Nem toda devolucao chegou a virar entrega, entao a
     tela cai no numero do pedido quando ele esta vazio. */
  entrega: string;
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
  /* Data que manda no corte por ano e por mes: a Data Saida, que e
     quando a mercadoria deixou o CD. Cai na Data Emissao Pedido
     quando a saida nao veio preenchida. */
  data: Date | null;
  /* Falso quando a data acima veio da emissao do pedido, e nao da
     saida. A tela avisa, porque as duas datas nao significam a mesma
     coisa e misturar sem dizer distorce a leitura mes a mes. */
  dataPelaSaida: boolean;
  /* Coluna "Considerar ?" da planilha: Nao tira o caso do painel.

     Vazio conta como Sim de proposito. Lacuna de preenchimento nao
     pode apagar devolucao do indicador em silencio - o custo de errar
     para menos e alguem ser cobrado por um numero que nao existe. */
  considerar: boolean;
}

/* Motivos que nao sao responsabilidade do CD:
   - Arrependimento: o cliente desistiu ou comprou errado;
   - Defeito: o produto falhou depois de entregue, e problema da marca;
   - Avaria: quebrou no transporte, e problema da transportadora.
   O CD responde por separar e expedir, nao pelo que acontece depois. */
export const MOTIVOS_FORA = ['arrependimento', 'defeito', 'avaria'];

/* Duas causas que sao do CD, e a diferenca entre elas importa: uma se
   corrige com conferencia na expedicao, a outra com etiqueta e
   endereco. */
export type CausaCD = 'INVERSAO' | 'FALTA';

export const ROTULO_CAUSA: Record<CausaCD, string> = {
  INVERSAO: 'Inversão',
  FALTA: 'Peça faltando',
};

/* Item trocado: base, coluna ou etiqueta que nao correspondem ao
   pedido. E o erro classico de separacao. */
const TERMOS_INVERSAO = [
  'invertid', 'invers', 'base trocada', 'coluna trocada', 'trocaram a base',
  'etiqueta trocada', 'etiqueta errada',
  'base no tamanho incorreto', 'base incorreta', 'base errada',
  'furacao da base', 'furacao errada', 'tamanho incorreto',
  'medida errada', 'nao encaixa', 'incompativel',
  'divergencia operacional cd',
];

/* Item que nao foi junto: falta volume ou peca no que foi expedido. */
const TERMOS_FALTA = [
  'faltou a base', 'sem a base', 'falta a base',
  'faltou peca', 'faltou volume', 'falta de volume', 'faltou item',
  'falta peca', 'falta volume',
];

export function semAcento(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

/* A causa da divergencia, quando ela e do CD.

   Tres condicoes, na ordem em que foram pedidas:
   1. o Motivo nao pode ser de terceiro (cliente, marca ou transporte);
   2. o Produto tem que ser elevador ou base, nao acessorio;
   3. o texto tem que apontar item trocado ou item faltando.

   Devolve nulo quando o caso nao e do CD. */
export function causaDe(d: DivergenciaSAC): CausaCD | null {
  const motivo = semAcento(d.motivo);
  if (MOTIVOS_FORA.some((m) => motivo.includes(m))) return null;
  if (!ehProdutoDeElevador(d)) return null;

  const texto = `${semAcento(d.submotivo)} ${semAcento(d.comentario)}`;
  if (TERMOS_INVERSAO.some((t) => texto.includes(t))) return 'INVERSAO';
  if (TERMOS_FALTA.some((t) => texto.includes(t))) return 'FALTA';
  return null;
}

export function ehCulpaDoCD(d: DivergenciaSAC): boolean {
  return causaDe(d) !== null;
}

/* ============================================================
   De quem foi.

   Inversao e falta descrevem O QUE aconteceu; nao dizem DE QUEM foi.
   O mesmo "veio a peca errada" pode ser separacao no CD, produto que
   saiu errado de fabrica ou cliente que montou o pedido errado - e a
   acao para cada um e outra: conferencia, tratativa com a marca ou
   orientacao na venda.

   A leitura sai do Comentario, que e onde o SAC escreve o que apurou.
   ============================================================ */
export type Responsavel = 'CD' | 'FORNECEDOR' | 'CLIENTE' | 'ANUNCIO' | 'APURAR';

export const ROTULO_RESPONSAVEL: Record<Responsavel, string> = {
  CD: 'Operação CD',
  FORNECEDOR: 'Fornecedor',
  CLIENTE: 'Cliente',
  ANUNCIO: 'Anúncio / cadastro',
  APURAR: 'A apurar',
};

/* O produto ja saiu errado da fabrica: o CD expediu o que recebeu. */
const TERMOS_FORNECEDOR = [
  'fabricante', 'de fabrica', 'da fabrica', 'veio de fabrica', 'saiu de fabrica',
  'fabricacao', 'lubrificacao', 'marca propria', 'fornecedor', 'montagem de fabrica',
  'manual do fabricante', 'epna', 'engenharia', 'nao conformidade de fabrica',
];

/* Divergencia de anuncio: o produto entregue e o que foi pedido, mas
   nao e o que a pagina prometia.

   Antes isso caia em FORNECEDOR, por escolha minha, sem base. O
   anuncio nao e da fabrica nem do CD: quem escreve a descricao, a
   ficha tecnica e a foto e o cadastro. Enquanto nao houver criterio
   para dividir esses casos, eles ficam visiveis em uma gaveta propria
   em vez de inflar o numero de outra area - misturar aqui e criar uma
   cobranca em cima de quem nao errou. */
const TERMOS_ANUNCIO = [
  'divergencia de anuncio', 'divergencia no anuncio', 'anuncio',
  'ficha tecnica', 'descricao do produto', 'foto do produto', 'cadastro do produto',
];

/* O pedido foi montado ou recebido errado do lado do cliente. */
const TERMOS_CLIENTE = [
  'comprou errado', 'desistiu', 'arrepend', 'endereco errado', 'endereco incorreto',
  'nao retirou', 'cliente montou', 'montado pelo cliente', 'instalacao pelo cliente',
  'uso indevido', 'nao quer mais', 'pedido em duplicidade',
];

/* Comentario que nao apurou nada. O SAC usa "-" quando abriu o caso
   sem detalhe. */
function comentarioVazio(texto: string): boolean {
  const t = texto.replace(/[-\s.]/g, '');
  return t.length === 0;
}

/* De quem foi a divergencia.

   O CD e o padrao porque a inversao e a falta acontecem no processo
   dele; fornecedor e cliente sao excecoes que o Comentario precisa
   dizer. Quando o Comentario nao apurou nada, o caso vai para "a
   apurar" em vez de sobrar para o CD: indicador que culpa por omissao
   perde a confianca de quem e cobrado por ele. */
export function responsavelDe(d: DivergenciaSAC): Responsavel {
  const texto = `${semAcento(d.submotivo)} ${semAcento(d.comentario)}`;

  /* "Divergencia operacional CD" e o SAC dizendo, com todas as letras,
     que apurou e foi o CD. Vale mais que qualquer palavra solta. */
  if (texto.includes('operacional cd')) return 'CD';

  /* Fabrica antes de anuncio: "veio de fabrica diferente do anuncio"
     e uma apuracao que chegou na origem: o produto saiu errado. So
     "divergencia de anuncio", sem mencao a fabrica, e a pagina que
     prometeu outra coisa. */
  if (TERMOS_FORNECEDOR.some((t) => texto.includes(t))) return 'FORNECEDOR';
  if (TERMOS_ANUNCIO.some((t) => texto.includes(t))) return 'ANUNCIO';
  if (TERMOS_CLIENTE.some((t) => texto.includes(t))) return 'CLIENTE';
  if (comentarioVazio(semAcento(d.comentario))) return 'APURAR';
  return 'CD';
}

export interface CorteResponsavel {
  responsavel: Responsavel;
  rotulo: string;
  quantidade: number;
  valor: number;
  pct: number;
}

/* Sempre todos, inclusive os zerados: "fornecedor: 0" e a informacao
   de que nenhum caso foi da marca neste periodo.

   O resolvedor e opcional para a tela poder passar o responsavel que
   vale de verdade, ja com os ajustes feitos a mao por cima do texto.
   Sem ele, vale a leitura do Comentario. */
export function porResponsavel(
  lista: DivergenciaSAC[],
  resolver: (d: DivergenciaSAC) => Responsavel = responsavelDe
): CorteResponsavel[] {
  const total = lista.length;
  return (['CD', 'FORNECEDOR', 'ANUNCIO', 'CLIENTE', 'APURAR'] as const).map((responsavel) => {
    const doTipo = lista.filter((d) => resolver(d) === responsavel);
    return {
      responsavel,
      rotulo: ROTULO_RESPONSAVEL[responsavel],
      quantidade: doTipo.length,
      valor: doTipo.reduce((s, d) => s + d.valor, 0),
      pct: total > 0 ? (doTipo.length / total) * 100 : 0,
    };
  });
}

/* Os casos que o painel conta: divergencia que e do CD, seja item
   trocado ou peca faltando. O nome fala em divergencia, e nao em
   inversao, porque inversao e so uma das causas - chamar o conjunto
   pelo nome de uma parte dele fez o painel inteiro parecer medir
   menos do que mede. */
export function divergenciasDoCD(lista: DivergenciaSAC[]): DivergenciaSAC[] {
  return lista.filter(ehCulpaDoCD);
}

/* Quebra por causa, para a tela mostrar onde o CD esta errando. */
export function porCausa(lista: DivergenciaSAC[]): { causa: CausaCD; rotulo: string; quantidade: number; valor: number }[] {
  return (['INVERSAO', 'FALTA'] as const).map((causa) => {
    const doTipo = lista.filter((d) => causaDe(d) === causa);
    return {
      causa,
      rotulo: ROTULO_CAUSA[causa],
      quantidade: doTipo.length,
      valor: doTipo.reduce((s, d) => s + d.valor, 0),
    };
  });
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

/* ============================================================
   Evolucao das divergencias ao longo do ano.

   E a leitura de resultado do projeto: o plano existe para o CD parar
   de errar na expedicao, entao a curva caindo - e o mes fechando em
   zero - e o ganho, nao a lista de acoes concluidas.

   Divergencia, e nao inversao: item trocado e so uma das causas, e
   peca faltando conta igual. O grafico soma as duas.

   Mes que ainda nao aconteceu nao e mes zerado. Contar dezembro como
   conquista em agosto seria inventar resultado, e e o tipo de numero
   que a diretoria derruba na primeira pergunta.
   ============================================================ */
export interface EvolucaoDivergencias {
  meses: MesDivergencia[];
  /* Ultimo mes ja decorrido do ano em tela, de 0 a 11. */
  ateOMes: number;
  /* Mes de maior volume, para medir a queda contra ele. */
  pico: MesDivergencia | null;
  /* Meses seguidos sem nenhum caso, terminando no ultimo decorrido. */
  sequenciaZerada: number;
  /* Meses decorridos que fecharam sem nenhum caso. */
  mesesZerados: number;
  totalCasos: number;
  totalValor: number;
}

export function evolucaoDeDivergencias(
  lista: DivergenciaSAC[],
  ano: number,
  hoje: Date
): EvolucaoDivergencias {
  const meses = porMes(lista, ano);
  /* No ano corrente, so ate o mes de hoje. Em ano passado, o ano
     inteiro; em ano futuro, nada decorrido ainda. */
  const anoDeHoje = hoje.getUTCFullYear();
  const ateOMes = ano < anoDeHoje ? 11 : ano > anoDeHoje ? -1 : hoje.getUTCMonth();

  const decorridos = meses.slice(0, ateOMes + 1);
  const comCaso = decorridos.filter((m) => m.total.quantidade > 0);
  const pico = comCaso.reduce<MesDivergencia | null>(
    (melhor, m) => (melhor == null || m.total.quantidade > melhor.total.quantidade ? m : melhor),
    null
  );

  let sequenciaZerada = 0;
  for (let i = decorridos.length - 1; i >= 0; i--) {
    if (decorridos[i].total.quantidade > 0) break;
    sequenciaZerada++;
  }

  return {
    meses,
    ateOMes,
    pico,
    sequenciaZerada,
    mesesZerados: decorridos.filter((m) => m.total.quantidade === 0).length,
    totalCasos: decorridos.reduce((s, m) => s + m.total.quantidade, 0),
    totalValor: decorridos.reduce((s, m) => s + m.total.valor, 0),
  };
}

/* Onde cai o inicio do projeto dentro do ano mostrado.

   O retorno e a posicao na escala de meses do grafico: 2,5 e "meio de
   marco". Fora do ano mostrado devolve nulo - o marco simplesmente nao
   aparece, porque uma linha encostada na borda esquerda diria que o
   projeto comecou em janeiro. */
export function posicaoDoMarco(inicio: Date | null | undefined, ano: number): number | null {
  if (!inicio || inicio.getUTCFullYear() !== ano) return null;
  const mes = inicio.getUTCMonth();
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return mes + (inicio.getUTCDate() - 1) / diasNoMes;
}

export interface LinhaTransportadora {
  transportadora: string;
  quantidade: number;
  valor: number;
  /* Participacao sobre o total de casos do periodo. */
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
