/* ============================================================
   Lista de compra em imagem, para colar no e-mail ou no Teams.

   O desenho e feito em canvas, com as cores da marca, para sair igual
   a tabela da tela. O planejamento das linhas fica separado do
   desenho, para poder ser conferido em teste sem navegador.
   ============================================================ */
import type { GrupoFornecedor } from '../domain/fornecedores';
import { textoCompra } from '../domain/fornecedores';
import { LOGO_HORIZONTAL } from '../dados/logo';

const CORES = {
  navy: '#001A72',
  navySuave: '#33488E',
  laranja: '#FA4616',
  tinta: '#1D1F2A',
  tintaSuave: '#6B7280',
  linha: '#D5D8E0',
  papel: '#FFFFFF',
  faixa: '#F4F5F7',
  alerta: '#FBE7E1',
  alertaTinta: '#C83812',
  bom: '#1F8A52',
};

export const COLUNAS_IMAGEM = [
  { chave: 'item', rotulo: 'Item', largura: 110 },
  { chave: 'elevador', rotulo: 'Elevador', largura: 282 },
  { chave: 'componente', rotulo: 'Componente', largura: 120 },
  { chave: 'descricao', rotulo: 'Descrição do componente', largura: 330 },
  { chave: 'tipo', rotulo: 'Tipo', largura: 90 },
  { chave: 'sn', rotulo: 'S/N', largura: 50 },
  { chave: 'cd', rotulo: 'Saldo CD', largura: 118 },
  { chave: 'situacao', rotulo: 'Situação', largura: 110 },
  { chave: 'compra', rotulo: 'O que comprar', largura: 190 },
] as const;

export const LARGURA = COLUNAS_IMAGEM.reduce((s, c) => s + c.largura, 0) + 48;
const ALTURA_LINHA = 26;
/* A ultima linha do elevador ganha uma tira a mais, onde entra o total
   de base e de coluna sem encostar no risco da caixa. */
const SOBRA_ULTIMA = 11;
const ALTURA_GRUPO = 32;
const ALTURA_TON = 24;
const ALTURA_CABECALHO = 34;
const TOPO = 108;
const RODAPE = 44;

export type LinhaImagem =
  | { tipo: 'fornecedor'; texto: string; detalhe: string }
  | { tipo: 'tonelada'; texto: string }
  | {
      tipo: 'componente';
      item: string;
      elevador: string;
      componente: string;
      descricao: string;
      classe: string;
      sn: string;
      cd: string;
      situacao: string;
      compra: string;
      primeira: boolean;
      ultima: boolean;
      alerta: boolean;
      apagada: boolean;
      totalItem: string;
    };

export interface PlanoImagem {
  linhas: LinhaImagem[];
  largura: number;
  altura: number;
  /* Linhas que nao couberam no limite pedido. */
  ocultas: number;
  titulo: string;
  resumo: string;
  data: string;
}

/* Monta a sequencia de linhas do desenho. Puro, sem canvas. */
export function planejarImagem(
  grupos: GrupoFornecedor[],
  opcoes: { data?: Date; local?: string; maxLinhas?: number } = {}
): PlanoImagem {
  const max = opcoes.maxLinhas ?? 260;
  const data = opcoes.data ?? new Date();
  const linhas: LinhaImagem[] = [];
  let ocultas = 0;

  for (const g of grupos) {
    const daqui: LinhaImagem[] = [
      {
        tipo: 'fornecedor',
        texto: g.fornecedor.toUpperCase(),
        detalhe:
          `${g.itens} item(ns) · ${g.descasados} descasado(s)` +
          (g.comprarColuna + g.comprarBase > 0
            ? ` · faltam ${g.comprarColuna} coluna(s) e ${g.comprarBase} base(s)`
            : ''),
      },
    ];
    for (const t of g.toneladas) {
      daqui.push({
        tipo: 'tonelada',
        texto: `${t.tonelada} · ratio 1:${t.ratio} · ${t.itens.length} item(ns)`,
      });
      for (const i of t.itens) {
        i.componentes.forEach((c, indice) => {
          daqui.push({
            tipo: 'componente',
            item: indice === 0 ? i.item : '',
            elevador: indice === 0 ? i.nome : '',
            componente: c.ausente ? 'não cadastrado' : c.codigo,
            descricao: c.nome,
            classe: c.tipo,
            sn: c.sn === 'S' || c.sn === 'N' ? c.sn : '',
            cd: String(c.cd),
            situacao: indice === 0 ? i.situacao : '',
            compra: indice === 0 ? textoCompra(i) : '',
            primeira: indice === 0,
            ultima: indice === i.componentes.length - 1,
            alerta: i.situacao === 'DESCASADO',
            apagada: Boolean(c.ausente),
            totalItem:
              indice === i.componentes.length - 1 ? `${i.bases} base · ${i.colunas} coluna` : '',
          });
        });
      }
    }
    /* O fornecedor entra inteiro ou nao entra: cortar no meio de um
       elevador deixaria o comprador com meia informacao. */
    if (linhas.length + daqui.length > max && linhas.length > 0) {
      ocultas += daqui.filter((l) => l.tipo === 'componente').length;
      continue;
    }
    linhas.push(...daqui);
  }

  let altura = TOPO + ALTURA_CABECALHO + RODAPE;
  for (const l of linhas) {
    if (l.tipo === 'fornecedor') altura += ALTURA_GRUPO;
    else if (l.tipo === 'tonelada') altura += ALTURA_TON;
    else altura += ALTURA_LINHA + (l.ultima ? SOBRA_ULTIMA : 0);
  }

  const itens = grupos.reduce((s, g) => s + g.itens, 0);
  const colunas = grupos.reduce((s, g) => s + g.comprarColuna, 0);
  const bases = grupos.reduce((s, g) => s + g.comprarBase, 0);

  return {
    linhas,
    largura: LARGURA,
    altura,
    ocultas,
    titulo: `Itens descasados no CD · ${opcoes.local ?? 'CD Cajamar'}`,
    resumo: `${itens} elevador(es) na lista · faltam ${colunas} coluna(s) e ${bases} base(s)`,
    data: data.toLocaleDateString('pt-BR'),
  };
}

/* Corta o texto que nao cabe na coluna, colocando reticencias. */
function encaixar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string {
  if (ctx.measureText(texto).width <= largura) return texto;
  let corte = texto;
  while (corte.length > 1 && ctx.measureText(`${corte}...`).width > largura) {
    corte = corte.slice(0, -1);
  }
  return `${corte}...`;
}

function selo(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  fundo: string,
  tinta: string
): void {
  ctx.font = '700 10px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const largura = ctx.measureText(texto).width + 14;
  ctx.fillStyle = fundo;
  ctx.beginPath();
  ctx.roundRect(x, y - 9, largura, 17, 8);
  ctx.fill();
  ctx.fillStyle = tinta;
  ctx.fillText(texto, x + 7, y + 3);
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

/* Desenha o plano em um canvas. A escala deixa a imagem nitida quando
   colada no e-mail e ampliada na tela do comprador. */
export async function desenharImagemCompra(plano: PlanoImagem, escala = 2): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = plano.largura * escala;
  canvas.height = plano.altura * escala;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(escala, escala);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = CORES.papel;
  ctx.fillRect(0, 0, plano.largura, plano.altura);

  /* Cabecalho da marca. */
  ctx.fillStyle = CORES.navy;
  ctx.fillRect(0, 0, plano.largura, 84);
  ctx.fillStyle = CORES.laranja;
  ctx.fillRect(0, 84, plano.largura, 4);

  const logo = await carregarLogo();
  let esquerda = 24;
  if (logo) {
    const altura = 40;
    const largura = (logo.width / logo.height) * altura;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(esquerda, 22, largura + 16, altura + 12, 8);
    ctx.fill();
    ctx.drawImage(logo, esquerda + 8, 28, largura, altura);
    esquerda += largura + 32;
  }
  ctx.fillStyle = '#fff';
  ctx.font = '700 20px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillText(plano.titulo, esquerda, 40);
  ctx.font = '13px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.fillText(`${plano.resumo} · posição de ${plano.data}`, esquerda, 62);

  /* Cabecalho das colunas. */
  let y = TOPO;
  ctx.fillStyle = CORES.laranja;
  ctx.fillRect(24, y - ALTURA_CABECALHO + 8, plano.largura - 48, ALTURA_CABECALHO);
  ctx.fillStyle = '#fff';
  ctx.font = '700 11px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  let x = 24;
  for (const col of COLUNAS_IMAGEM) {
    const direita = col.chave === 'cd';
    ctx.textAlign = direita ? 'right' : 'left';
    ctx.fillText(col.rotulo.toUpperCase(), direita ? x + col.largura - 10 : x + 10, y - 3);
    x += col.largura;
  }
  ctx.textAlign = 'left';

  for (const linha of plano.linhas) {
    if (linha.tipo === 'fornecedor') {
      ctx.fillStyle = CORES.navy;
      ctx.fillRect(24, y, plano.largura - 48, ALTURA_GRUPO);
      ctx.fillStyle = '#fff';
      ctx.font = '800 13px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(linha.texto, 34, y + 21);
      const largura = ctx.measureText(linha.texto).width;
      ctx.font = '11px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText(linha.detalhe, 34 + largura + 14, y + 21);
      y += ALTURA_GRUPO;
      continue;
    }
    if (linha.tipo === 'tonelada') {
      ctx.fillStyle = CORES.faixa;
      ctx.fillRect(24, y, plano.largura - 48, ALTURA_TON);
      ctx.fillStyle = CORES.tintaSuave;
      ctx.font = '700 10px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(linha.texto.toUpperCase(), 44, y + 16);
      y += ALTURA_TON;
      continue;
    }

    const alturaLinha = ALTURA_LINHA + (linha.ultima ? SOBRA_ULTIMA : 0);
    if (linha.alerta) {
      ctx.fillStyle = CORES.alerta;
      ctx.fillRect(24, y, plano.largura - 48, alturaLinha);
    }
    if (linha.primeira) {
      ctx.strokeStyle = CORES.linha;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(24, y + 0.5);
      ctx.lineTo(plano.largura - 24, y + 0.5);
      ctx.stroke();
    }

    const base = y + 17;
    x = 24;
    for (const col of COLUNAS_IMAGEM) {
      const interno = col.largura - 20;
      ctx.font = '11.5px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = linha.apagada ? CORES.tintaSuave : CORES.tinta;

      if (col.chave === 'item') {
        ctx.font = '700 11.5px "SF Mono", Consolas, monospace';
        ctx.fillText(encaixar(ctx, linha.item, interno), x + 10, base);
      } else if (col.chave === 'elevador') {
        ctx.fillText(encaixar(ctx, linha.elevador, interno), x + 10, base);
      } else if (col.chave === 'componente') {
        ctx.font = linha.apagada
          ? 'italic 11px -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
          : '11.5px "SF Mono", Consolas, monospace';
        ctx.fillText(encaixar(ctx, linha.componente, interno), x + 10, base);
      } else if (col.chave === 'descricao') {
        ctx.fillText(encaixar(ctx, linha.descricao, interno), x + 10, base);
      } else if (col.chave === 'tipo') {
        const fundo =
          linha.classe === 'BASE' ? '#E8ECF7' : linha.classe === 'COLUNA' ? '#FFEDE7' : '#EEF0F4';
        const tinta =
          linha.classe === 'BASE' ? CORES.navy : linha.classe === 'COLUNA' ? CORES.laranja : CORES.tintaSuave;
        selo(ctx, linha.classe, x + 10, base - 4, fundo, tinta);
      } else if (col.chave === 'sn' && linha.sn) {
        selo(ctx, linha.sn, x + 10, base - 4, linha.sn === 'S' ? CORES.laranja : CORES.navy, '#fff');
      } else if (col.chave === 'cd') {
        ctx.font = '700 12px "SF Mono", Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = linha.cd === '0' ? CORES.tintaSuave : CORES.tinta;
        ctx.fillText(linha.cd, x + col.largura - 10, base);
        if (linha.totalItem) {
          ctx.font = '700 9px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
          ctx.fillStyle = CORES.navySuave;
          ctx.fillText(linha.totalItem, x + col.largura - 10, y + alturaLinha - 5);
        }
        ctx.textAlign = 'left';
        /* Caixa que amarra os componentes do mesmo elevador. */
        ctx.strokeStyle = CORES.navySuave;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 4, y);
        ctx.lineTo(x + 4, y + alturaLinha);
        ctx.moveTo(x + col.largura - 2, y);
        ctx.lineTo(x + col.largura - 2, y + alturaLinha);
        if (linha.primeira) {
          ctx.moveTo(x + 4, y + 0.5);
          ctx.lineTo(x + col.largura - 2, y + 0.5);
        }
        if (linha.ultima) {
          ctx.moveTo(x + 4, y + alturaLinha - 0.5);
          ctx.lineTo(x + col.largura - 2, y + alturaLinha - 0.5);
        }
        ctx.stroke();
      } else if (col.chave === 'situacao' && linha.situacao) {
        const bom = linha.situacao === 'CASADO';
        selo(
          ctx,
          linha.situacao,
          x + 10,
          base - 4,
          bom ? '#E4F2EA' : CORES.alerta,
          bom ? CORES.bom : CORES.alertaTinta
        );
      } else if (col.chave === 'compra' && linha.compra) {
        const falta = linha.compra.startsWith('comprar');
        ctx.font = `${falta ? '700 ' : ''}11.5px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
        ctx.fillStyle = falta ? CORES.laranja : CORES.tintaSuave;
        ctx.fillText(encaixar(ctx, linha.compra, interno), x + 10, base);
      }
      x += col.largura;
    }
    y += alturaLinha;
  }

  ctx.fillStyle = CORES.tintaSuave;
  ctx.font = '11px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const rodape =
    plano.ocultas > 0
      ? `Mais ${plano.ocultas} linha(s) na planilha em anexo. Gerado pela Central de Equalizacao de Elevadores.`
      : 'Gerado pela Central de Equalizacao de Elevadores.';
  ctx.fillText(rodape, 24, y + 24);

  return canvas;
}

export async function baixarImagemCompra(
  grupos: GrupoFornecedor[],
  opcoes: { data?: Date; local?: string } = {}
): Promise<void> {
  const plano = planejarImagem(grupos, opcoes);
  const canvas = await desenharImagemCompra(plano);
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `itens-descasados-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
}
