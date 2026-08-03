/* ============================================================
   Testes da lista de compra por fornecedor.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  listarPorFornecedor, textoCompra, nomeDoFornecedor, mensagemDeCompra,
} from '../src/domain/fornecedores';
import type { Componente } from '../src/domain/tipos';
import { planejarImagem, LARGURA } from '../src/export/imagemCompra';
import { montarPlanilhaCompra } from '../src/export/excelCompra';

function comp(p: Partial<Componente>): Componente {
  return {
    itemVolMultiplo: '', nomeItemVolMultiplo: '', itemComponente: '', nomeItemComponente: '',
    quantidade: 0, inInterface: '', peso: 0, linhaProduto: '', marca: '', componenteBaseColuna: '',
    filtrar: '', cd: 0, reversa: 0, ds: 0, outros: 0, chave: '', toneladaFixa: '', fabricante: '',
    ...p,
  };
}

/* Reproduz o recorte que o comprador olha: um item de 4 t com uma base
   e uma coluna (descasado, porque 4 t pede duas colunas) e outro item
   do mesmo fornecedor ja fechado. */
const MAQUINAS: Componente[] = [
  comp({ itemVolMultiplo: '865413', nomeItemVolMultiplo: 'ELEVADOR A', itemComponente: '965799', inInterface: 'S', componenteBaseColuna: 'BASE', cd: 1, fabricante: 'MAQUINAS RIBEIRO', marca: 'FORTG', toneladaFixa: '4 t' }),
  comp({ itemVolMultiplo: '865413', nomeItemVolMultiplo: 'ELEVADOR A', itemComponente: '965800', inInterface: 'N', componenteBaseColuna: 'COLUNA', cd: 1, fabricante: 'MAQUINAS RIBEIRO', marca: 'FORTG', toneladaFixa: '4 t' }),
  comp({ itemVolMultiplo: '865413', nomeItemVolMultiplo: 'ELEVADOR A', itemComponente: '965801', inInterface: 'N', componenteBaseColuna: 'COLUNA', cd: 0, fabricante: 'MAQUINAS RIBEIRO', marca: 'FORTG', toneladaFixa: '4 t' }),
  comp({ itemVolMultiplo: '927388', nomeItemVolMultiplo: 'ELEVADOR B', itemComponente: '1019341', inInterface: 'S', componenteBaseColuna: 'BASE', cd: 2, fabricante: 'MAQUINAS RIBEIRO', marca: 'FORTG', toneladaFixa: '2 t' }),
  comp({ itemVolMultiplo: '927388', nomeItemVolMultiplo: 'ELEVADOR B', itemComponente: '1019342', inInterface: 'N', componenteBaseColuna: 'COLUNA', cd: 2, fabricante: 'MAQUINAS RIBEIRO', marca: 'FORTG', toneladaFixa: '2 t' }),
  comp({ itemVolMultiplo: '2786710', nomeItemVolMultiplo: 'ELEVADOR C', itemComponente: '2786712', inInterface: 'N', componenteBaseColuna: 'COLUNA', cd: 1, fabricante: 'AUTOP', marca: 'AUTOP', toneladaFixa: '3,2 t' }),
  comp({ itemVolMultiplo: '2786710', nomeItemVolMultiplo: 'ELEVADOR C', itemComponente: '2786711', inInterface: 'S', componenteBaseColuna: 'BASE', cd: 0, fabricante: 'AUTOP', marca: 'AUTOP', toneladaFixa: '3,2 t' }),
];

describe('agrupamento por fornecedor', () => {
  const grupos = listarPorFornecedor(MAQUINAS);

  it('separa por fornecedor, depois por tonelada', () => {
    expect(grupos.map((g) => g.fornecedor).sort()).toEqual(['AUTOP', 'MAQUINAS RIBEIRO']);
    const mr = grupos.find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!;
    expect(mr.toneladas.map((t) => t.tonelada)).toEqual(['2 t', '4 t']); // ordem numerica
  });

  it('mantem todos os componentes do item pai, inclusive o de saldo zero', () => {
    const mr = grupos.find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!;
    const item = mr.toneladas.find((t) => t.tonelada === '4 t')!.itens[0];
    expect(item.item).toBe('865413');
    expect(item.componentes.map((c) => c.codigo)).toEqual(['965799', '965800', '965801']);
    expect(item.componentes[0].tipo).toBe('BASE');
    expect(item.componentes[0].sn).toBe('S');
  });

  it('aponta o descasado e quantas colunas faltam comprar', () => {
    const mr = grupos.find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!;
    const quatro = mr.toneladas.find((t) => t.tonelada === '4 t')!;
    const item = quatro.itens[0];
    expect(item.bases).toBe(1);
    expect(item.colunas).toBe(1);
    expect(item.colunasNecessarias).toBe(2); // ratio 1:2
    expect(item.deficit).toBe(1);
    expect(item.situacao).toBe('DESCASADO');
    expect(item.comprarColuna).toBe(1);
    expect(item.completos).toBe(0);
    expect(quatro.descasados).toBe(1);
  });

  it('item com base e coluna na medida fica casado', () => {
    const mr = grupos.find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!;
    const dois = mr.toneladas.find((t) => t.tonelada === '2 t')!;
    expect(dois.itens[0].situacao).toBe('CASADO');
    expect(dois.itens[0].completos).toBe(2);
    expect(dois.comprarColuna + dois.comprarBase).toBe(0);
  });

  it('coluna sobrando pede base, e a base traz junto o resto do conjunto', () => {
    const autop = grupos.find((g) => g.fornecedor === 'AUTOP')!;
    const item = autop.toneladas[0].itens[0];
    expect(item.deficit).toBe(-1); // 0 base, 1 coluna
    expect(item.comprarBase).toBe(1);
    expect(item.comprarColuna).toBe(0); // ratio 1:1, a base fecha o conjunto
    expect(item.situacao).toBe('DESCASADO');
  });

  it('soma o total de compra do fornecedor', () => {
    const mr = grupos.find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!;
    expect(mr.itens).toBe(2);
    expect(mr.descasados).toBe(1);
    expect(mr.comprarColuna).toBe(1);
    expect(mr.comprarBase).toBe(0);
  });

  it('traz o kit inteiro, inclusive a bomba, sem contar no casamento', () => {
    const grupos2 = listarPorFornecedor([
      ...MAQUINAS,
      comp({ itemVolMultiplo: '865413', itemComponente: '999', nomeItemComponente: 'BOMBA 4T', componenteBaseColuna: 'BOMBA', cd: 0, fabricante: 'MAQUINAS RIBEIRO', toneladaFixa: '4 t' }),
    ]);
    const item = grupos2
      .find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!
      .toneladas.find((t) => t.tonelada === '4 t')!.itens[0];
    const bomba = item.componentes.find((c) => c.codigo === '999')!;
    expect(bomba.tipo).toBe('BOMBA');
    expect(bomba.cd).toBe(0);
    // A bomba nao mexe na conta de base contra coluna.
    expect(item.colunas).toBe(1);
    expect(item.comprarColuna).toBe(1);
    // Mas conta como peca do kit sem saldo: a 965801 e a bomba.
    expect(item.semSaldo).toBe(2);
  });

  it('item pai sem base nem coluna fica fora da lista', () => {
    const grupos2 = listarPorFornecedor([
      comp({ itemVolMultiplo: 'SOBOMBA', itemComponente: '77', componenteBaseColuna: 'BOMBA', cd: 5, fabricante: 'JM', toneladaFixa: '2 t' }),
    ]);
    expect(grupos2).toHaveLength(0);
  });

  it('base primeiro, coluna depois, o resto do kit no fim', () => {
    const item = listarPorFornecedor([
      ...MAQUINAS,
      comp({ itemVolMultiplo: '865413', itemComponente: '999', componenteBaseColuna: 'BOMBA', cd: 3, fabricante: 'MAQUINAS RIBEIRO', toneladaFixa: '4 t' }),
    ])
      .find((g) => g.fornecedor === 'MAQUINAS RIBEIRO')!
      .toneladas.find((t) => t.tonelada === '4 t')!.itens[0];
    expect(item.componentes.map((c) => c.tipo)).toEqual(['BASE', 'COLUNA', 'COLUNA', 'BOMBA']);
  });
});

describe('kit sem um dos lados cadastrado', () => {
  /* O caso do 4570344: so existe a linha da coluna. O comprador precisa
     ver a base com saldo zero, senao parece que o kit esta completo. */
  const soColuna = listarPorFornecedor([
    comp({ itemVolMultiplo: '4570344', nomeItemVolMultiplo: 'ELEVADOR DOUBLE LOCK', itemComponente: '4570497', inInterface: 'S', componenteBaseColuna: 'COLUNA', cd: 1, fabricante: 'MAQUINAS RIBEIRO', toneladaFixa: '4 t' }),
  ]);
  const item = soColuna[0].toneladas[0].itens[0];

  it('cria a linha da base com saldo zero', () => {
    const base = item.componentes.find((c) => c.tipo === 'BASE')!;
    expect(base.cd).toBe(0);
    expect(base.ausente).toBe(true);
    expect(base.codigo).toBe('');
    expect(base.nome).toMatch(/sem base cadastrada/i);
  });

  it('a linha criada nao inventa saldo nem muda a conta', () => {
    expect(item.bases).toBe(0);
    expect(item.colunas).toBe(1);
    expect(item.situacao).toBe('DESCASADO');
    expect(item.comprarBase).toBe(1);
    expect(item.comprarColuna).toBe(1); // 1 base pede 2 colunas, ja ha 1
  });

  it('kit so com base ganha a linha da coluna', () => {
    const soBase = listarPorFornecedor([
      comp({ itemVolMultiplo: 'X1', itemComponente: 'B1', componenteBaseColuna: 'BASE', cd: 2, fabricante: 'JM', toneladaFixa: '2 t' }),
    ])[0].toneladas[0].itens[0];
    const coluna = soBase.componentes.find((c) => c.tipo === 'COLUNA')!;
    expect(coluna.ausente).toBe(true);
    expect(coluna.cd).toBe(0);
    expect(soBase.comprarColuna).toBe(2);
  });
});

describe('componente que serve mais de um elevador', () => {
  /* A mesma base entra em dois elevadores: o saldo do CD e o mesmo
     estoque, e a tela precisa avisar para a compra nao dobrar. */
  const compartilhado: Componente[] = [
    comp({ itemVolMultiplo: 'P1', itemComponente: 'B99', componenteBaseColuna: 'BASE', cd: 4, fabricante: 'JM', toneladaFixa: '2 t' }),
    comp({ itemVolMultiplo: 'P1', itemComponente: 'C11', componenteBaseColuna: 'COLUNA', cd: 4, fabricante: 'JM', toneladaFixa: '2 t' }),
    comp({ itemVolMultiplo: 'P2', itemComponente: 'B99', componenteBaseColuna: 'BASE', cd: 4, fabricante: 'JM', toneladaFixa: '2 t' }),
    comp({ itemVolMultiplo: 'P2', itemComponente: 'C22', componenteBaseColuna: 'COLUNA', cd: 1, fabricante: 'JM', toneladaFixa: '2 t' }),
  ];

  it('conta em quantos elevadores o componente aparece', () => {
    const grupo = listarPorFornecedor(compartilhado)[0];
    const todos = grupo.toneladas.flatMap((t) => t.itens).flatMap((i) => i.componentes);
    expect(todos.find((c) => c.codigo === 'B99')!.paisQueUsam).toBe(2);
    expect(todos.find((c) => c.codigo === 'C11')!.paisQueUsam).toBe(1);
    expect(grupo.compartilhados).toBe(1);
  });

  it('sem repeticao nao ha o que avisar', () => {
    for (const g of listarPorFornecedor(MAQUINAS)) expect(g.compartilhados).toBe(0);
  });
});

describe('nome do fornecedor e texto de compra', () => {
  it('usa o fabricante e cai para a marca quando falta', () => {
    expect(nomeDoFornecedor({ fabricante: 'JM', marca: 'FORTG' })).toBe('JM');
    expect(nomeDoFornecedor({ fabricante: '', marca: 'FORTG' })).toBe('FORTG');
    expect(nomeDoFornecedor({ fabricante: '', marca: '' })).toBe('—');
  });

  it('escreve o que comprar', () => {
    expect(textoCompra({ situacao: 'DESCASADO', comprarColuna: 2, comprarBase: 0 })).toBe('comprar 2 coluna(s)');
    expect(textoCompra({ situacao: 'DESCASADO', comprarColuna: 1, comprarBase: 1 })).toBe('comprar 1 coluna(s) e 1 base(s)');
    expect(textoCompra({ situacao: 'CASADO', comprarColuna: 0, comprarBase: 0 })).toBe('equalizado');
    expect(textoCompra({ situacao: 'SEM ESTOQUE', comprarColuna: 0, comprarBase: 0 })).toBe('sem estoque');
  });
});

describe('mensagem para o comprador', () => {
  const texto = mensagemDeCompra(listarPorFornecedor(MAQUINAS), {
    data: new Date(2026, 7, 3),
    local: 'CD Cajamar',
  });

  it('abre com a posicao e o total que falta comprar', () => {
    expect(texto).toContain('CD Cajamar');
    expect(texto).toContain('03/08/2026');
    expect(texto).toMatch(/Faltam 1 coluna\(s\) e 1 base\(s\)/);
  });

  it('separa por fornecedor e detalha o item descasado', () => {
    expect(texto).toContain('MAQUINAS RIBEIRO');
    expect(texto).toContain('AUTOP');
    expect(texto).toContain('865413');
    expect(texto).toContain('No CD hoje: 1 base(s) e 1 coluna(s). comprar 1 coluna(s).');
  });

  it('lista os componentes de cada elevador com o saldo', () => {
    expect(texto).toMatch(/BASE\s+965799\s+saldo 1/);
    expect(texto).toMatch(/COLUNA\s+965801\s+saldo 0/);
  });

  it('avisa quando um componente serve mais de um elevador', () => {
    const compartilhado = listarPorFornecedor([
      comp({ itemVolMultiplo: 'P1', itemComponente: 'B99', componenteBaseColuna: 'BASE', cd: 4, fabricante: 'JM', toneladaFixa: '2 t' }),
      comp({ itemVolMultiplo: 'P2', itemComponente: 'B99', componenteBaseColuna: 'BASE', cd: 4, fabricante: 'JM', toneladaFixa: '2 t' }),
    ]);
    const aviso = mensagemDeCompra(compartilhado);
    expect(aviso).toContain('serve 2 elevadores');
    expect(aviso).toMatch(/nao pode ser somada duas vezes/);
    expect(mensagemDeCompra(listarPorFornecedor(MAQUINAS))).not.toContain('nao pode ser somada');
  });

  it('nao usa travessao, para nao quebrar no corpo do e-mail', () => {
    expect(texto).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('plano da imagem da lista', () => {
  const grupos = listarPorFornecedor(MAQUINAS);

  it('abre cada fornecedor, cada tonelada e cada componente', () => {
    const plano = planejarImagem(grupos, { data: new Date(2026, 7, 3) });
    const tipos = plano.linhas.map((l) => l.tipo);
    expect(tipos.filter((t) => t === 'fornecedor')).toHaveLength(2);
    expect(tipos.filter((t) => t === 'tonelada')).toHaveLength(3); // 2 t, 4 t e 3,2 t
    expect(plano.ocultas).toBe(0);
    expect(plano.resumo).toContain('3 elevador(es)');
    expect(plano.data).toBe('03/08/2026');
  });

  it('a altura cresce com o numero de linhas', () => {
    const cheio = planejarImagem(grupos);
    const vazio = planejarImagem([]);
    expect(cheio.altura).toBeGreaterThan(vazio.altura);
    expect(cheio.largura).toBe(LARGURA);
  });

  it('marca a primeira e a ultima linha de cada elevador, com o total no fim', () => {
    const plano = planejarImagem(grupos);
    const doItem = plano.linhas.filter(
      (l): l is Extract<typeof l, { tipo: 'componente' }> => l.tipo === 'componente'
    );
    const primeiras = doItem.filter((l) => l.primeira);
    const ultimas = doItem.filter((l) => l.ultima);
    expect(primeiras).toHaveLength(3); // um por elevador
    expect(ultimas).toHaveLength(3);
    expect(ultimas[0].totalItem).toMatch(/base . \d+ coluna/);
    /* So a primeira linha do elevador repete o codigo e a situacao. */
    for (const l of doItem) {
      if (!l.primeira) expect(l.item).toBe('');
      if (!l.primeira) expect(l.situacao).toBe('');
    }
  });

  it('corta por fornecedor inteiro quando passa do limite, e conta o resto', () => {
    const plano = planejarImagem(grupos, { maxLinhas: 6 });
    expect(plano.ocultas).toBeGreaterThan(0);
    expect(plano.linhas.filter((l) => l.tipo === 'fornecedor')).toHaveLength(1);
  });
});

describe('planilha da lista de compra', () => {
  const wb = montarPlanilhaCompra(listarPorFornecedor(MAQUINAS), { data: new Date(2026, 7, 3) });
  const aba = wb.Sheets[wb.SheetNames[0]];

  it('tem uma aba com o titulo da marca e o cabecalho das colunas', () => {
    expect(wb.SheetNames).toEqual(['Itens descasados']);
    expect(String(aba.A1.v)).toContain('Itens descasados no CD');
    expect(aba.A4.v).toBe('Item (elevador)');
    expect(aba.G4.v).toBe('Saldo CD');
  });

  it('as celulas levam a formatacao, nao so o valor', () => {
    expect((aba.A4.s as { fill: { fgColor: { rgb: string } } }).fill.fgColor.rgb).toBe('FA4616');
    expect((aba.A1.s as { fill: { fgColor: { rgb: string } } }).fill.fgColor.rgb).toBe('001A72');
    expect(aba['!cols']).toHaveLength(10);
    expect(aba['!merges']!.length).toBeGreaterThan(0);
  });

  it('o saldo do componente entra como numero, para o Excel somar', () => {
    const celulas = Object.keys(aba).filter((k) => /^G\d+$/.test(k));
    const saldos = celulas.map((k) => aba[k]).filter((c) => c.t === 'n');
    expect(saldos.length).toBeGreaterThan(0);
  });
});
