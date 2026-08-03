/* ============================================================
   Planilha da lista de compra, com o mesmo tema da tabela da tela.

   Usa o xlsx-js-style, que e o SheetJS com escrita de formatacao,
   entao o arquivo sai com as cores da marca em vez de celulas
   cruas. Gerado no navegador, sem nenhuma chamada de rede.
   ============================================================ */
import * as XLSX from 'xlsx-js-style';
import type { GrupoFornecedor } from '../domain/fornecedores';
import { textoCompra } from '../domain/fornecedores';

/* Cores da marca, no formato que o Excel espera (sem o #). */
const COR = {
  navy: '001A72',
  navySuave: '33488E',
  laranja: 'FA4616',
  branco: 'FFFFFF',
  tinta: '1D1F2A',
  tintaSuave: '6B7280',
  linha: 'D5D8E0',
  faixa: 'EEF0F4',
  alerta: 'FBE7E1',
  alertaTinta: 'C83812',
  bom: '1F8A52',
  bomClaro: 'E4F2EA',
};

const FONTE = 'Segoe UI';

type Estilo = Record<string, unknown>;

function borda(cor = COR.linha) {
  const lado = { style: 'thin', color: { rgb: cor } };
  return { top: lado, bottom: lado, left: lado, right: lado };
}

const CABECALHO: Estilo = {
  font: { name: FONTE, sz: 10, bold: true, color: { rgb: COR.branco } },
  fill: { patternType: 'solid', fgColor: { rgb: COR.laranja } },
  alignment: { vertical: 'center', horizontal: 'left' },
  border: borda(COR.laranja),
};

const TITULO: Estilo = {
  font: { name: FONTE, sz: 15, bold: true, color: { rgb: COR.branco } },
  fill: { patternType: 'solid', fgColor: { rgb: COR.navy } },
  alignment: { vertical: 'center' },
};

const SUBTITULO: Estilo = {
  font: { name: FONTE, sz: 10, color: { rgb: COR.branco } },
  fill: { patternType: 'solid', fgColor: { rgb: COR.navy } },
  alignment: { vertical: 'center' },
};

const GRUPO: Estilo = {
  font: { name: FONTE, sz: 11, bold: true, color: { rgb: COR.branco } },
  fill: { patternType: 'solid', fgColor: { rgb: COR.navy } },
  alignment: { vertical: 'center' },
};

const TONELADA: Estilo = {
  font: { name: FONTE, sz: 9, bold: true, color: { rgb: COR.tintaSuave } },
  fill: { patternType: 'solid', fgColor: { rgb: COR.faixa } },
  alignment: { vertical: 'center' },
};

function celula(valor: string | number, estilo: Estilo): XLSX.CellObject {
  return {
    v: valor,
    t: typeof valor === 'number' ? 'n' : 's',
    s: estilo,
  } as XLSX.CellObject;
}

/* Estilo de uma celula comum da tabela, que muda com a situacao. */
function corpo(opcoes: {
  alerta?: boolean;
  apagada?: boolean;
  numero?: boolean;
  negrito?: boolean;
  cor?: string;
  mono?: boolean;
}): Estilo {
  return {
    font: {
      name: opcoes.mono ? 'Consolas' : FONTE,
      sz: 9.5,
      bold: opcoes.negrito,
      italic: opcoes.apagada,
      color: { rgb: opcoes.cor ?? (opcoes.apagada ? COR.tintaSuave : COR.tinta) },
    },
    fill: opcoes.alerta ? { patternType: 'solid', fgColor: { rgb: COR.alerta } } : undefined,
    alignment: {
      vertical: 'center',
      horizontal: opcoes.numero ? 'right' : 'left',
      wrapText: false,
    },
    border: borda(),
  };
}

const COLUNAS = [
  { rotulo: 'Item (elevador)', largura: 14 },
  { rotulo: 'Descrição do elevador', largura: 46 },
  { rotulo: 'Componente', largura: 14 },
  { rotulo: 'Descrição do componente', largura: 48 },
  { rotulo: 'Tipo', largura: 11 },
  { rotulo: 'S/N', largura: 6 },
  { rotulo: 'Saldo CD', largura: 10 },
  { rotulo: 'Elevadores que usam', largura: 19 },
  { rotulo: 'Situação', largura: 13 },
  { rotulo: 'O que comprar', largura: 26 },
];

export function montarPlanilhaCompra(
  grupos: GrupoFornecedor[],
  opcoes: { data?: Date; local?: string } = {}
): XLSX.WorkBook {
  const data = opcoes.data ?? new Date();
  const local = opcoes.local ?? 'CD Cajamar';
  const itens = grupos.reduce((s, g) => s + g.itens, 0);
  const colunas = grupos.reduce((s, g) => s + g.comprarColuna, 0);
  const bases = grupos.reduce((s, g) => s + g.comprarBase, 0);

  const linhas: XLSX.CellObject[][] = [];
  const mesclagens: XLSX.Range[] = [];
  const vazia = (estilo: Estilo) => celula('', estilo);
  const ultima = () => linhas.length - 1;

  /* Cabecalho da marca, nas duas primeiras linhas. */
  linhas.push([celula(`Itens descasados no CD - ${local}`, TITULO), ...COLUNAS.slice(1).map(() => vazia(TITULO))]);
  mesclagens.push({ s: { r: 0, c: 0 }, e: { r: 0, c: COLUNAS.length - 1 } });
  linhas.push([
    celula(
      `${itens} elevador(es) na lista - faltam ${colunas} coluna(s) e ${bases} base(s) - posicao de ${data.toLocaleDateString('pt-BR')}`,
      SUBTITULO
    ),
    ...COLUNAS.slice(1).map(() => vazia(SUBTITULO)),
  ]);
  mesclagens.push({ s: { r: 1, c: 0 }, e: { r: 1, c: COLUNAS.length - 1 } });
  linhas.push(COLUNAS.map(() => vazia({})));
  linhas.push(COLUNAS.map((c) => celula(c.rotulo, CABECALHO)));

  for (const g of grupos) {
    linhas.push([
      celula(
        `${g.fornecedor.toUpperCase()}   ${g.itens} item(ns) - ${g.descasados} descasado(s) - faltam ${g.comprarColuna} coluna(s) e ${g.comprarBase} base(s)`,
        GRUPO
      ),
      ...COLUNAS.slice(1).map(() => vazia(GRUPO)),
    ]);
    mesclagens.push({ s: { r: ultima(), c: 0 }, e: { r: ultima(), c: COLUNAS.length - 1 } });

    for (const t of g.toneladas) {
      linhas.push([
        celula(
          `${t.tonelada} - ratio 1:${t.ratio} - ${t.itens.length} item(ns) - ${t.descasados} descasado(s)`,
          TONELADA
        ),
        ...COLUNAS.slice(1).map(() => vazia(TONELADA)),
      ]);
      mesclagens.push({ s: { r: ultima(), c: 0 }, e: { r: ultima(), c: COLUNAS.length - 1 } });

      for (const i of t.itens) {
        const primeiraLinha = linhas.length;
        const alerta = i.situacao === 'DESCASADO';
        i.componentes.forEach((c, indice) => {
          const apagada = Boolean(c.ausente);
          linhas.push([
            celula(indice === 0 ? i.item : '', corpo({ alerta, negrito: true, mono: true })),
            celula(indice === 0 ? i.nome : '', corpo({ alerta })),
            celula(c.ausente ? 'nao cadastrado' : c.codigo, corpo({ alerta, apagada, mono: !apagada })),
            celula(c.nome, corpo({ alerta, apagada })),
            celula(c.tipo, corpo({ alerta, negrito: true, cor: c.tipo === 'BASE' ? COR.navy : c.tipo === 'COLUNA' ? COR.laranja : COR.tintaSuave })),
            celula(c.sn, corpo({ alerta, negrito: true })),
            celula(c.cd, corpo({ alerta, numero: true, negrito: true, cor: c.cd === 0 ? COR.tintaSuave : COR.tinta })),
            celula(c.paisQueUsam || '', corpo({ alerta, numero: true, cor: c.paisQueUsam > 1 ? COR.laranja : COR.tintaSuave })),
            celula(
              indice === 0 ? i.situacao : '',
              {
                ...corpo({ alerta, negrito: true, cor: alerta ? COR.alertaTinta : COR.bom }),
                fill: {
                  patternType: 'solid',
                  fgColor: { rgb: alerta ? COR.alerta : COR.bomClaro },
                },
              }
            ),
            celula(
              indice === 0 ? textoCompra(i) : '',
              corpo({
                alerta,
                negrito: i.comprarBase + i.comprarColuna > 0,
                cor: i.comprarBase + i.comprarColuna > 0 ? COR.laranja : COR.tintaSuave,
              })
            ),
          ]);
        });
        /* Junta as celulas que valem para o elevador inteiro, igual a
           tela: item, descricao, situacao e o que comprar. */
        if (i.componentes.length > 1) {
          const fim = linhas.length - 1;
          for (const coluna of [0, 1, 8, 9]) {
            mesclagens.push({ s: { r: primeiraLinha, c: coluna }, e: { r: fim, c: coluna } });
          }
        }
        /* Linha de total do elevador, no lugar do rodape da caixa. */
        linhas.push([
          vazia(corpo({})),
          vazia(corpo({})),
          vazia(corpo({})),
          celula('Total do elevador no CD', corpo({ cor: COR.navySuave, negrito: true })),
          vazia(corpo({})),
          vazia(corpo({})),
          celula(`${i.bases} base / ${i.colunas} coluna`, corpo({ numero: true, negrito: true, cor: COR.navySuave })),
          vazia(corpo({})),
          vazia(corpo({})),
          vazia(corpo({})),
        ]);
      }
    }
  }

  const aba = XLSX.utils.aoa_to_sheet(linhas as unknown as unknown[][]);
  /* aoa_to_sheet perde o estilo quando recebe objetos, entao as celulas
     sao regravadas uma a uma. */
  for (let r = 0; r < linhas.length; r++) {
    for (let c = 0; c < linhas[r].length; c++) {
      aba[XLSX.utils.encode_cell({ r, c })] = linhas[r][c];
    }
  }
  aba['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: linhas.length - 1, c: COLUNAS.length - 1 },
  });
  aba['!cols'] = COLUNAS.map((c) => ({ wch: c.largura }));
  aba['!rows'] = linhas.map((_, r) => ({ hpt: r === 0 ? 26 : r === 1 ? 18 : 15 }));
  aba['!merges'] = mesclagens;
  aba['!freeze'] = { xSplit: 0, ySplit: 4 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aba, 'Itens descasados');
  return wb;
}

export function baixarPlanilhaCompra(
  grupos: GrupoFornecedor[],
  opcoes: { data?: Date; local?: string } = {}
): void {
  const wb = montarPlanilhaCompra(grupos, opcoes);
  XLSX.writeFile(wb, `itens-descasados-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
