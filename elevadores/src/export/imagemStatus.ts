/* ============================================================
   Status do projeto em uma pagina, para colar no corpo do e-mail.

   E o mesmo conteudo da tela Status do Projeto reduzido ao que a
   diretoria le em trinta segundos: score, saude, andamento das acoes,
   pilares, ganhos e o que vem a seguir.

   O calculo do layout fica separado do desenho. Assim da para
   conferir a pagina em teste, sem navegador, e o canvas so executa o
   que ja foi decidido aqui.
   ============================================================ */
import type { Acao, MetricasProjeto } from '../domain/tipos';
import {
  explicarSaude,
  montarMatriz,
  proximosPassos,
  resumirGanhos,
  situacaoDe,
} from '../domain/projeto';
import type { ResumoGanho, Passo } from '../domain/projeto';
import { LOGO_HORIZONTAL } from '../dados/logo';

const CORES = {
  navy: '#001A72',
  navySuave: '#33488E',
  navyClaro: '#E8ECF7',
  laranja: '#FA4616',
  tinta: '#1D1F2A',
  tintaSuave: '#6B7280',
  linha: '#D5D8E0',
  papel: '#FFFFFF',
  faixa: '#F4F5F7',
};

/* Verde concluido, amarelo em andamento, vermelho nao iniciado: a
   mesma escala da matriz da tela, para quem ve os dois nao ter que
   reaprender a legenda. */
export const CORES_SITUACAO = {
  concluida: '#1F7A4C',
  andamento: '#B8860B',
  pendente: '#C83812',
} as const;

const CORES_SAUDE = {
  saudavel: '#1F7A4C',
  atencao: '#B8860B',
  critico: '#C83812',
} as const;

const ROTULO_SAUDE = {
  saudavel: 'Saudável',
  atencao: 'Atenção',
  critico: 'Crítico',
} as const;

export const LARGURA = 900;
const MARGEM = 28;
const LARGURA_UTIL = LARGURA - MARGEM * 2;

/* Alturas de cada faixa da pagina, na ordem em que sao empilhadas. */
const H_CABECALHO = 92;
const H_DESTAQUE = 118;
const H_KPIS = 88;
const H_ANDAMENTO = 96;
const H_COLUNAS = 190;
const H_PASSO_LINHA = 19;
const H_PASSO_EXTRA = 16; // respiro entre um passo e o proximo
const H_RODAPE = 46;
const ESPACO = 18;

export const FONTE_PASSO = '12.5px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/* Mede um texto. No navegador quem mede e o canvas; no teste entra uma
   medida deterministica, para o resultado nao depender das fontes
   instaladas na maquina. */
export type Medidor = (texto: string, fonte: string) => number;

/* Quebra o texto em linhas que cabem na largura, sem cortar palavra. */
export function quebrarLinhas(
  texto: string,
  largura: number,
  fonte: string,
  medir: Medidor
): string[] {
  const palavras = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];
  const linhas: string[] = [];
  let atual = palavras[0];
  for (const palavra of palavras.slice(1)) {
    const tentativa = `${atual} ${palavra}`;
    if (medir(tentativa, fonte) <= largura) atual = tentativa;
    else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  linhas.push(atual);
  return linhas;
}

export interface BlocoKpi {
  rotulo: string;
  valor: string;
  detalhe: string;
  cor: string;
}

export interface FatiaAndamento {
  chave: 'concluida' | 'andamento' | 'pendente';
  rotulo: string;
  quantidade: number;
  pct: number;
  cor: string;
}

export interface BarraPilar {
  rotulo: string;
  valor: number; // 0 a 100
  detalhe: string;
}

export interface PassoNaPagina {
  linhas: string[];
  quantidade: number;
}

export interface PaginaStatus {
  largura: number;
  altura: number;
  titulo: string;
  subtitulo: string;
  data: string;
  score: number;
  saudeRotulo: string;
  saudeCor: string;
  frase: string[];
  kpis: BlocoKpi[];
  andamento: FatiaAndamento[];
  pilares: BarraPilar[];
  ganhos: ResumoGanho[];
  passos: PassoNaPagina[];
  /* Passos que nao couberam na pagina, contados para o rodape. */
  passosOcultos: number;
  rodape: string;
}

/* Quantos passos cabem sem a pagina virar duas. */
const MAX_PASSOS = 4;
const MAX_LINHAS_FRASE = 2;

export function montarOnePage(
  acoes: Acao[],
  metricas: MetricasProjeto,
  medir: Medidor,
  opcoes: { data?: Date; local?: string } = {}
): PaginaStatus {
  const data = opcoes.data ?? new Date();
  const total = metricas.total;

  const contagem = {
    concluida: acoes.filter((a) => situacaoDe(a) === 'concluida').length,
    andamento: acoes.filter((a) => situacaoDe(a) === 'andamento').length,
    pendente: acoes.filter((a) => situacaoDe(a) === 'pendente').length,
  };
  const rotulos = {
    concluida: 'Concluídas',
    andamento: 'Em andamento',
    pendente: 'Não iniciadas',
  } as const;
  const andamento: FatiaAndamento[] = (['concluida', 'andamento', 'pendente'] as const).map((k) => ({
    chave: k,
    rotulo: rotulos[k],
    quantidade: contagem[k],
    pct: total > 0 ? (contagem[k] / total) * 100 : 0,
    cor: CORES_SITUACAO[k],
  }));

  const kpis: BlocoKpi[] = [
    {
      rotulo: 'Ações no plano',
      valor: String(total),
      detalhe: `${metricas.propostas} frente(s) · ${metricas.responsaveis} responsável(is)`,
      cor: CORES.navy,
    },
    {
      rotulo: 'Concluídas',
      valor: String(metricas.concluidas),
      detalhe: `${metricas.pctConcluidas.toFixed(0)}% do plano`,
      cor: CORES_SITUACAO.concluida,
    },
    {
      rotulo: 'Em andamento',
      valor: String(metricas.emAndamento),
      detalhe: 'já saíram do papel',
      cor: CORES_SITUACAO.andamento,
    },
    {
      rotulo: 'Em atraso',
      valor: String(metricas.atrasadas),
      detalhe:
        total > 0 ? `${((metricas.atrasadas / total) * 100).toFixed(0)}% com prazo vencido` : 'sem prazo vencido',
      cor: metricas.atrasadas > 0 ? CORES_SITUACAO.pendente : CORES.tintaSuave,
    },
  ];

  const pilares: BarraPilar[] = metricas.pilares.map((p) => ({
    rotulo: p.rotulo,
    valor: p.valor,
    detalhe: `${p.valor.toFixed(0)} · peso ${(p.peso * 100).toFixed(0)}%`,
  }));

  const passosBrutos: Passo[] = proximosPassos(acoes, metricas, montarMatriz(acoes));
  const passos: PassoNaPagina[] = passosBrutos.slice(0, MAX_PASSOS).map((p) => ({
    quantidade: p.quantidade,
    /* 34px de recuo do numero do passo. */
    linhas: quebrarLinhas(p.texto, LARGURA_UTIL - 34, FONTE_PASSO, medir),
  }));

  const frase = quebrarLinhas(
    explicarSaude(metricas),
    LARGURA_UTIL - 210,
    '13.5px -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    medir
  ).slice(0, MAX_LINHAS_FRASE);

  const linhasDePasso = passos.reduce((s, p) => s + p.linhas.length, 0);
  const alturaPassos = 34 + linhasDePasso * H_PASSO_LINHA + passos.length * H_PASSO_EXTRA;

  const altura =
    H_CABECALHO +
    ESPACO +
    H_DESTAQUE +
    ESPACO +
    H_KPIS +
    ESPACO +
    H_ANDAMENTO +
    ESPACO +
    H_COLUNAS +
    ESPACO +
    alturaPassos +
    H_RODAPE;

  return {
    largura: LARGURA,
    altura: Math.round(altura),
    titulo: 'Equalização de Elevadores',
    subtitulo: `Status do projeto · ${opcoes.local ?? 'CD Cajamar'}`,
    data: data.toLocaleDateString('pt-BR'),
    score: metricas.score,
    saudeRotulo: ROTULO_SAUDE[metricas.saude],
    saudeCor: CORES_SAUDE[metricas.saude],
    frase,
    kpis,
    andamento,
    pilares,
    ganhos: resumirGanhos(acoes),
    passos,
    passosOcultos: Math.max(0, passosBrutos.length - passos.length),
    rodape: 'Gerado pela Central de Equalização de Elevadores · Loja do Mecânico',
  };
}

/* ============================================================
   Desenho
   ============================================================ */

function fonte(peso: string, tamanho: number): string {
  return `${peso} ${tamanho}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
}

function caixa(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  largura: number,
  altura: number,
  fundo: string,
  borda?: string
): void {
  ctx.fillStyle = fundo;
  ctx.beginPath();
  ctx.roundRect(x, y, largura, altura, 10);
  ctx.fill();
  if (borda) {
    ctx.strokeStyle = borda;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function encaixar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string {
  if (ctx.measureText(texto).width <= largura) return texto;
  let corte = texto;
  while (corte.length > 1 && ctx.measureText(`${corte}...`).width > largura) {
    corte = corte.slice(0, -1);
  }
  return `${corte}...`;
}

async function carregarLogo(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.src = LOGO_HORIZONTAL;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/* Titulo de secao, com o risco laranja curto por baixo. */
function tituloSecao(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number): void {
  ctx.fillStyle = CORES.navy;
  ctx.font = fonte('800', 12.5);
  ctx.fillText(texto.toUpperCase(), x, y);
  ctx.fillStyle = CORES.laranja;
  ctx.fillRect(x, y + 6, 26, 3);
}

export async function desenharOnePage(pagina: PaginaStatus, escala = 2): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = pagina.largura * escala;
  canvas.height = pagina.altura * escala;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(escala, escala);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = CORES.papel;
  ctx.fillRect(0, 0, pagina.largura, pagina.altura);

  /* ---- Cabecalho ---- */
  ctx.fillStyle = CORES.navy;
  ctx.fillRect(0, 0, pagina.largura, H_CABECALHO - 4);
  ctx.fillStyle = CORES.laranja;
  ctx.fillRect(0, H_CABECALHO - 4, pagina.largura, 4);

  const logo = await carregarLogo();
  let esquerda = MARGEM;
  if (logo) {
    const altura = 38;
    const largura = (logo.width / logo.height) * altura;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(esquerda, 20, largura + 16, altura + 12, 8);
    ctx.fill();
    ctx.drawImage(logo, esquerda + 8, 26, largura, altura);
    esquerda += largura + 32;
  }
  ctx.fillStyle = '#fff';
  ctx.font = fonte('800', 21);
  ctx.fillText(pagina.titulo, esquerda, 42);
  ctx.font = fonte('400', 13);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText(pagina.subtitulo, esquerda, 64);

  ctx.textAlign = 'right';
  ctx.font = fonte('700', 13);
  ctx.fillStyle = '#fff';
  ctx.fillText(`Posição de ${pagina.data}`, pagina.largura - MARGEM, 52);
  ctx.textAlign = 'left';

  let y = H_CABECALHO + ESPACO;

  /* ---- Score e saude ---- */
  const larguraScore = 190;
  caixa(ctx, MARGEM, y, larguraScore, H_DESTAQUE, CORES.navy);
  ctx.textAlign = 'center';
  const meioScore = MARGEM + larguraScore / 2;
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.font = fonte('700', 11);
  ctx.fillText('SCORE DO PROJETO', meioScore, y + 26);
  ctx.fillStyle = '#fff';
  ctx.font = fonte('800', 52);
  ctx.fillText(String(pagina.score), meioScore, y + 78);
  ctx.font = fonte('600', 12);
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.fillText('de 100 pontos', meioScore, y + 99);
  ctx.textAlign = 'left';

  const xSaude = MARGEM + larguraScore + 14;
  const larguraSaude = LARGURA_UTIL - larguraScore - 14;
  caixa(ctx, xSaude, y, larguraSaude, H_DESTAQUE, CORES.faixa, CORES.linha);
  /* Tira colorida da saude, na lateral da caixa. */
  ctx.fillStyle = pagina.saudeCor;
  ctx.beginPath();
  /* Raios no sentido horario a partir do canto superior esquerdo: so o
     lado de fora e arredondado, o de dentro encosta na caixa. */
  ctx.roundRect(xSaude, y, 6, H_DESTAQUE, [10, 0, 0, 10]);
  ctx.fill();

  ctx.fillStyle = pagina.saudeCor;
  ctx.font = fonte('800', 20);
  ctx.fillText(`Saúde: ${pagina.saudeRotulo}`, xSaude + 22, y + 36);
  ctx.fillStyle = CORES.tinta;
  ctx.font = fonte('400', 13.5);
  pagina.frase.forEach((linha, i) => {
    ctx.fillText(linha, xSaude + 22, y + 62 + i * 20);
  });
  y += H_DESTAQUE + ESPACO;

  /* ---- KPIs ---- */
  const larguraKpi = (LARGURA_UTIL - 3 * 12) / 4;
  pagina.kpis.forEach((k, i) => {
    const x = MARGEM + i * (larguraKpi + 12);
    caixa(ctx, x, y, larguraKpi, H_KPIS, CORES.papel, CORES.linha);
    ctx.fillStyle = k.cor;
    ctx.fillRect(x, y, larguraKpi, 3);
    ctx.fillStyle = CORES.tintaSuave;
    ctx.font = fonte('700', 10.5);
    ctx.fillText(k.rotulo.toUpperCase(), x + 14, y + 25);
    ctx.fillStyle = k.cor;
    ctx.font = fonte('800', 30);
    ctx.fillText(k.valor, x + 14, y + 58);
    ctx.fillStyle = CORES.tintaSuave;
    ctx.font = fonte('400', 11);
    ctx.fillText(encaixar(ctx, k.detalhe, larguraKpi - 28), x + 14, y + 76);
  });
  y += H_KPIS + ESPACO;

  /* ---- Andamento das acoes ---- */
  tituloSecao(ctx, 'Andamento das ações', MARGEM, y + 12);
  const yBarra = y + 32;
  const alturaBarra = 26;
  let x = MARGEM;
  const totalFatias = pagina.andamento.reduce((s, f) => s + f.quantidade, 0);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(MARGEM, yBarra, LARGURA_UTIL, alturaBarra, 6);
  ctx.clip();
  if (totalFatias === 0) {
    ctx.fillStyle = CORES.faixa;
    ctx.fillRect(MARGEM, yBarra, LARGURA_UTIL, alturaBarra);
  }
  for (const fatia of pagina.andamento) {
    const largura = totalFatias > 0 ? (fatia.quantidade / totalFatias) * LARGURA_UTIL : 0;
    if (largura <= 0) continue;
    ctx.fillStyle = fatia.cor;
    ctx.fillRect(x, yBarra, largura, alturaBarra);
    /* O numero so entra na fatia quando ha espaco para ele. */
    if (largura > 46) {
      ctx.fillStyle = '#fff';
      ctx.font = fonte('800', 12);
      ctx.textAlign = 'center';
      ctx.fillText(String(fatia.quantidade), x + largura / 2, yBarra + 18);
      ctx.textAlign = 'left';
    }
    x += largura;
  }
  ctx.restore();

  /* Legenda logo abaixo da barra. */
  let xLegenda = MARGEM;
  for (const fatia of pagina.andamento) {
    ctx.fillStyle = fatia.cor;
    ctx.beginPath();
    ctx.roundRect(xLegenda, yBarra + alturaBarra + 12, 10, 10, 3);
    ctx.fill();
    ctx.fillStyle = CORES.tinta;
    ctx.font = fonte('600', 11.5);
    const texto = `${fatia.rotulo}: ${fatia.quantidade} (${fatia.pct.toFixed(0)}%)`;
    ctx.fillText(texto, xLegenda + 16, yBarra + alturaBarra + 21);
    xLegenda += 16 + ctx.measureText(texto).width + 26;
  }
  y += H_ANDAMENTO + ESPACO;

  /* ---- Pilares e ganhos, lado a lado ---- */
  const larguraColuna = (LARGURA_UTIL - 18) / 2;
  const xGanhos = MARGEM + larguraColuna + 18;

  tituloSecao(ctx, 'Pilares do score', MARGEM, y + 12);
  let yLinha = y + 38;
  for (const pilar of pagina.pilares) {
    ctx.fillStyle = CORES.tinta;
    ctx.font = fonte('600', 12);
    ctx.fillText(pilar.rotulo, MARGEM, yLinha);
    ctx.textAlign = 'right';
    ctx.fillStyle = CORES.tintaSuave;
    ctx.font = fonte('700', 11);
    ctx.fillText(pilar.detalhe, MARGEM + larguraColuna, yLinha);
    ctx.textAlign = 'left';
    ctx.fillStyle = CORES.faixa;
    ctx.beginPath();
    ctx.roundRect(MARGEM, yLinha + 7, larguraColuna, 8, 4);
    ctx.fill();
    ctx.fillStyle = CORES.navy;
    ctx.beginPath();
    ctx.roundRect(MARGEM, yLinha + 7, Math.max(2, (pilar.valor / 100) * larguraColuna), 8, 4);
    ctx.fill();
    yLinha += 36;
  }

  tituloSecao(ctx, 'Ganhos do projeto', xGanhos, y + 12);
  yLinha = y + 38;
  for (const ganho of pagina.ganhos) {
    ctx.fillStyle = ganho.total > 0 ? CORES.tinta : CORES.tintaSuave;
    ctx.font = fonte('600', 12);
    ctx.fillText(ganho.rotulo, xGanhos, yLinha);
    ctx.textAlign = 'right';
    ctx.fillStyle = CORES.tintaSuave;
    ctx.font = fonte('700', 11);
    ctx.fillText(
      ganho.total > 0 ? `${ganho.entregues}/${ganho.total} entregues` : 'sem ação',
      xGanhos + larguraColuna,
      yLinha
    );
    ctx.textAlign = 'left';
    ctx.fillStyle = CORES.faixa;
    ctx.beginPath();
    ctx.roundRect(xGanhos, yLinha + 7, larguraColuna, 8, 4);
    ctx.fill();
    if (ganho.total > 0) {
      ctx.fillStyle = CORES_SITUACAO.concluida;
      ctx.beginPath();
      ctx.roundRect(xGanhos, yLinha + 7, Math.max(2, (ganho.pct / 100) * larguraColuna), 8, 4);
      ctx.fill();
    }
    yLinha += 29;
  }
  y += H_COLUNAS + ESPACO;

  /* ---- Proximos passos ---- */
  tituloSecao(ctx, 'Próximos passos', MARGEM, y + 12);
  let yPasso = y + 38;
  pagina.passos.forEach((passo, i) => {
    ctx.fillStyle = CORES.navyClaro;
    ctx.beginPath();
    ctx.roundRect(MARGEM, yPasso - 12, 22, 22, 6);
    ctx.fill();
    ctx.fillStyle = CORES.navy;
    ctx.font = fonte('800', 12);
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), MARGEM + 11, yPasso + 4);
    ctx.textAlign = 'left';

    ctx.fillStyle = CORES.tinta;
    ctx.font = FONTE_PASSO;
    passo.linhas.forEach((linha, j) => {
      ctx.fillText(linha, MARGEM + 34, yPasso + 4 + j * H_PASSO_LINHA);
    });
    yPasso += passo.linhas.length * H_PASSO_LINHA + H_PASSO_EXTRA;
  });

  /* ---- Rodape ---- */
  ctx.strokeStyle = CORES.linha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGEM, pagina.altura - 30.5);
  ctx.lineTo(pagina.largura - MARGEM, pagina.altura - 30.5);
  ctx.stroke();
  ctx.fillStyle = CORES.tintaSuave;
  ctx.font = fonte('400', 11);
  const rodape =
    pagina.passosOcultos > 0
      ? `${pagina.rodape} · mais ${pagina.passosOcultos} passo(s) na tela do projeto`
      : pagina.rodape;
  ctx.fillText(rodape, MARGEM, pagina.altura - 12);

  return canvas;
}

/* Nome do arquivo com a data, para as versoes nao se sobrescreverem
   na pasta de downloads de quem acompanha o projeto. */
function nomeArquivo(data: Date): string {
  return `status-projeto-elevadores-${data.toISOString().slice(0, 10)}.png`;
}

async function gerar(
  acoes: Acao[],
  metricas: MetricasProjeto,
  opcoes: { data?: Date; local?: string } = {}
): Promise<{ canvas: HTMLCanvasElement; pagina: PaginaStatus }> {
  const medida = document.createElement('canvas').getContext('2d')!;
  const medir: Medidor = (texto, fonteTexto) => {
    medida.font = fonteTexto;
    return medida.measureText(texto).width;
  };
  const pagina = montarOnePage(acoes, metricas, medir, opcoes);
  const canvas = await desenharOnePage(pagina);
  return { canvas, pagina };
}

export async function baixarOnePage(
  acoes: Acao[],
  metricas: MetricasProjeto,
  opcoes: { data?: Date; local?: string } = {}
): Promise<void> {
  const { canvas } = await gerar(acoes, metricas, opcoes);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = nomeArquivo(opcoes.data ?? new Date());
  a.click();
}

/* Copia a imagem para a area de transferencia: e o caminho mais curto
   para colar direto no corpo do e-mail, sem passar por anexo.
   Nem todo navegador deixa, entao o retorno diz se deu certo e a tela
   cai no download quando nao da. */
export async function copiarOnePage(
  acoes: Acao[],
  metricas: MetricasProjeto,
  opcoes: { data?: Date; local?: string } = {}
): Promise<boolean> {
  try {
    const { canvas } = await gerar(acoes, metricas, opcoes);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

/* Resumo em texto puro, para o corpo do e-mail acompanhar a imagem.
   Quem le no celular costuma ver o texto antes da imagem carregar. */
export function textoStatus(
  metricas: MetricasProjeto,
  pagina: PaginaStatus,
  data: Date = new Date()
): string {
  const linhas = [
    `Equalização de Elevadores — status do projeto em ${data.toLocaleDateString('pt-BR')}`,
    '',
    `Score: ${metricas.score}/100 · Saúde: ${pagina.saudeRotulo}`,
    pagina.frase.join(' '),
    '',
    'Andamento das ações:',
    ...pagina.andamento.map((f) => `  - ${f.rotulo}: ${f.quantidade} (${f.pct.toFixed(0)}%)`),
    '',
    'Próximos passos:',
    ...pagina.passos.map((p, i) => `  ${i + 1}. ${p.linhas.join(' ')}`),
    '',
    'A imagem em anexo traz a página completa, com os pilares do score e os ganhos do projeto.',
  ];
  return linhas.join('\n');
}
