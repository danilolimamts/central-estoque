/* Fluxo desenhado a mao, no espirito do Miro: caixas que se arrastam e
   setas que as ligam. O bloco guarda este JSON; antes ele guardava o
   codigo de um diagrama escrito em texto, que ninguem conseguia editar
   sem aprender a sintaxe. */

export type FormaDoNo = 'caixa' | 'decisao' | 'inicio' | 'nota';

export interface NoDoFluxo {
  id: string;
  texto: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  forma: FormaDoNo;
  cor: string;
}

export interface LigacaoDoFluxo {
  id: string;
  de: string;
  para: string;
  rotulo: string;
}

export interface Fluxo {
  nos: NoDoFluxo[];
  ligacoes: LigacaoDoFluxo[];
}

export const CORES_DO_FLUXO = [
  { nome: 'Roxo', valor: '#7C3AED' },
  { nome: 'Azul', valor: '#2F6FE0' },
  { nome: 'Verde', valor: '#2E8B57' },
  { nome: 'Âmbar', valor: '#C79212' },
  { nome: 'Vermelho', valor: '#D2453A' },
  { nome: 'Cinza', valor: '#6A6F94' },
];

export const rotuloDaForma: Record<FormaDoNo, string> = {
  caixa: 'Etapa',
  decisao: 'Decisão',
  inicio: 'Início ou fim',
  nota: 'Anotação',
};

const TAMANHOS: Record<FormaDoNo, { largura: number; altura: number }> = {
  caixa: { largura: 180, altura: 64 },
  decisao: { largura: 170, altura: 96 },
  inicio: { largura: 150, altura: 52 },
  nota: { largura: 190, altura: 72 },
};

export function fluxoVazio(): Fluxo {
  return { nos: [], ligacoes: [] };
}

export function noNovo(forma: FormaDoNo, x: number, y: number): NoDoFluxo {
  const { largura, altura } = TAMANHOS[forma];
  return {
    id: crypto.randomUUID(),
    texto: rotuloDaForma[forma],
    x, y, largura, altura, forma,
    cor: forma === 'nota' ? '#C79212' : '#7C3AED',
  };
}

/* O conteudo do bloco pode ser o JSON novo ou o texto do diagrama
   antigo. Ler os dois evita perder o que ja foi desenhado antes. */
export function lerFluxo(conteudo: string): Fluxo | null {
  const limpo = conteudo.trim();
  if (!limpo.startsWith('{')) return null;
  try {
    const lido = JSON.parse(limpo) as Partial<Fluxo>;
    if (!Array.isArray(lido.nos) || !Array.isArray(lido.ligacoes)) return null;
    return { nos: lido.nos, ligacoes: lido.ligacoes };
  } catch {
    return null;
  }
}

export const escreverFluxo = (fluxo: Fluxo) => JSON.stringify(fluxo);

export interface Ponto {
  x: number;
  y: number;
}

/* A seta sai da borda da caixa, nao do centro: ligada centro a centro,
   ela atravessaria o proprio bloco. */
export function bordaMaisProxima(de: NoDoFluxo, para: NoDoFluxo): Ponto {
  const centroDe = { x: de.x + de.largura / 2, y: de.y + de.altura / 2 };
  const centroPara = { x: para.x + para.largura / 2, y: para.y + para.altura / 2 };
  const dx = centroPara.x - centroDe.x;
  const dy = centroPara.y - centroDe.y;
  if (dx === 0 && dy === 0) return centroDe;

  const meiaLargura = de.largura / 2;
  const meiaAltura = de.altura / 2;
  /* Qual borda a reta cruza primeiro: a lateral ou a de cima/baixo. */
  const escala = Math.min(
    dx === 0 ? Infinity : meiaLargura / Math.abs(dx),
    dy === 0 ? Infinity : meiaAltura / Math.abs(dy),
  );
  return { x: centroDe.x + dx * escala, y: centroDe.y + dy * escala };
}

export function limitesDoFluxo(fluxo: Fluxo): { largura: number; altura: number } {
  const largura = Math.max(900, ...fluxo.nos.map((n) => n.x + n.largura + 60));
  const altura = Math.max(420, ...fluxo.nos.map((n) => n.y + n.altura + 60));
  return { largura, altura };
}

/* Posicao livre para o proximo bloco: empilha em coluna e quebra para a
   direita, para dois blocos novos nao nascerem um sobre o outro. */
export function proximaPosicao(fluxo: Fluxo): Ponto {
  const total = fluxo.nos.length;
  const coluna = Math.floor(total / 4);
  const linha = total % 4;
  return { x: 60 + coluna * 260, y: 40 + linha * 110 };
}

/* O Word nao desenha o quadro: o fluxo vira imagem. Gerar o SVG aqui,
   longe da tela, mantem o desenho do documento igual ao que se ve no
   app e deixa a funcao testavel sem navegador. */
export function fluxoParaSvg(fluxo: Fluxo): string {
  const { largura, altura } = limitesDoFluxo(fluxo);
  const escapar = (t: string) => t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const setas = fluxo.ligacoes.map((l) => {
    const de = fluxo.nos.find((n) => n.id === l.de);
    const para = fluxo.nos.find((n) => n.id === l.para);
    if (!de || !para) return '';
    const i = bordaMaisProxima(de, para);
    const f = bordaMaisProxima(para, de);
    const meio = { x: (i.x + f.x) / 2, y: (i.y + f.y) / 2 - 6 };
    return `<line x1="${i.x}" y1="${i.y}" x2="${f.x}" y2="${f.y}" stroke="#6A6F94" stroke-width="2" marker-end="url(#ponta)"/>`
      + (l.rotulo
        ? `<text x="${meio.x}" y="${meio.y}" text-anchor="middle" font-size="11" fill="#6A6F94" font-family="Arial">${escapar(l.rotulo)}</text>`
        : '');
  }).join('');

  const blocos = fluxo.nos.map((n) => {
    const cx = n.x + n.largura / 2;
    const cy = n.y + n.altura / 2;
    const raio = n.forma === 'inicio' ? n.altura / 2 : n.forma === 'nota' ? 4 : 10;
    const forma = n.forma === 'decisao'
      ? `<g transform="rotate(45 ${cx} ${cy})"><rect x="${n.x}" y="${n.y}" width="${n.largura}" height="${n.altura}" rx="10" fill="${n.cor}14" stroke="${n.cor}" stroke-width="2"/></g>`
      : `<rect x="${n.x}" y="${n.y}" width="${n.largura}" height="${n.altura}" rx="${raio}" fill="${n.cor}14" stroke="${n.cor}" stroke-width="2"/>`;
    /* Texto longo quebra em duas linhas: sem isso ele vaza da caixa. */
    const palavras = n.texto.split(' ');
    const meio = Math.ceil(palavras.length / 2);
    const linhas = n.texto.length > 22 && palavras.length > 1
      ? [palavras.slice(0, meio).join(' '), palavras.slice(meio).join(' ')]
      : [n.texto];
    const texto = linhas.map((linha, i) => (
      `<text x="${cx}" y="${cy + (i - (linhas.length - 1) / 2) * 15 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#161933" font-family="Arial">${escapar(linha)}</text>`
    )).join('');
    return forma + texto;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">`
    + '<defs><marker id="ponta" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
    + '<path d="M0,0 L9,4.5 L0,9 z" fill="#6A6F94"/></marker></defs>'
    + `<rect width="${largura}" height="${altura}" fill="#FFFFFF"/>${setas}${blocos}</svg>`;
}
