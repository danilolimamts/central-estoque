/* ============================================================
   Lista de compra por fornecedor.

   O comprador olha o estoque pelo fornecedor que ele atende, nao
   pela chave do conjunto. Aqui os componentes sao agrupados em
   Fornecedor (fabricante) -> Tonelada -> Item pai, e cada item pai
   mostra as bases e as colunas que existem no CD, o que esta
   descasado e quantas pecas faltam comprar.
   ============================================================ */
import type { Componente } from './tipos';
import { tipoComponente } from './equalizacao';
import { ratioDaTonelada } from '../config/regras';

export type SituacaoItem = 'CASADO' | 'DESCASADO' | 'SEM ESTOQUE';

/* Uma linha de componente do item pai. Traz o kit inteiro, nao so a
   base e a coluna: bomba, comando e motor tambem faltam no CD e o
   comprador precisa ver. */
export interface LinhaComponente {
  codigo: string;
  nome: string;
  /* BASE, COLUNA ou o que vier na planilha (BOMBA, COMANDO, MOTOR...). */
  tipo: string;
  /* Campo "in interface": o S deve ficar na coluna. */
  sn: string;
  cd: number;
  reversa: number;
  /* Quantos itens pai usam este mesmo componente. Acima de 1 o saldo do
     CD e o mesmo estoque nos dois lugares, entao a compra nao pode ser
     somada duas vezes. */
  paisQueUsam: number;
  /* Linha criada pelo sistema porque o kit nao tem esse lado cadastrado.
     Entra com saldo zero, para o comprador ver que falta o par. */
  ausente?: boolean;
}

export interface ItemFornecedor {
  item: string; // item pai (elevador)
  nome: string;
  marca: string;
  fabricante: string;
  tonelada: string;
  ratio: number;

  componentes: LinhaComponente[];
  bases: number;
  colunas: number;
  /* Colunas que as bases existentes pedem. */
  colunasNecessarias: number;
  deficit: number; // positivo falta coluna, negativo sobra coluna
  completos: number;

  situacao: SituacaoItem;
  comprarColuna: number;
  comprarBase: number;
  /* Componentes do kit com saldo zero no CD, de qualquer tipo. */
  semSaldo: number;
}

export interface GrupoTonelada {
  tonelada: string;
  ratio: number;
  itens: ItemFornecedor[];
  descasados: number;
  comprarColuna: number;
  comprarBase: number;
}

export interface GrupoFornecedor {
  fornecedor: string;
  marcas: string[];
  toneladas: GrupoTonelada[];
  itens: number;
  descasados: number;
  comprarColuna: number;
  comprarBase: number;
  /* Componentes deste fornecedor que servem mais de um elevador. */
  compartilhados: number;
}

/* Nome que o comprador usa. O fabricante manda; a marca entra quando
   o fabricante nao veio preenchido. */
export function nomeDoFornecedor(c: { fabricante: string; marca: string }): string {
  return (String(c.fabricante ?? '').trim() || String(c.marca ?? '').trim() || '—');
}

/* Ordena tonelada de forma numerica: 2 t, 3 t, 3,2 t, 4 t. */
function ordemTonelada(t: string): number {
  return parseFloat(String(t ?? '').replace(',', '.')) || 0;
}

/* Base primeiro, coluna depois, o resto do kit em seguida. */
function ordemTipo(t: string): number {
  return t === 'BASE' ? 0 : t === 'COLUNA' ? 1 : 2;
}

function fecharItem(item: ItemFornecedor): ItemFornecedor {
  /* O kit sem um dos lados cadastrados ganha a linha com saldo zero: o
     comprador precisa ver que ha 1 coluna e nenhuma base. */
  for (const tipo of ['BASE', 'COLUNA'] as const) {
    if (item.componentes.some((c) => c.tipo === tipo)) continue;
    item.componentes.push({
      codigo: '',
      nome: `Sem ${tipo.toLowerCase()} cadastrada neste kit`,
      tipo,
      sn: '',
      cd: 0,
      reversa: 0,
      paisQueUsam: 0,
      ausente: true,
    });
  }

  item.componentes.sort(
    (a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo) || a.tipo.localeCompare(b.tipo) ||
      a.codigo.localeCompare(b.codigo)
  );
  item.semSaldo = item.componentes.filter((c) => c.cd === 0).length;
  item.colunasNecessarias = item.bases * item.ratio;
  item.deficit = item.colunasNecessarias - item.colunas;
  item.completos = Math.max(0, Math.min(item.bases, Math.floor(item.colunas / item.ratio)));

  if (item.bases === 0 && item.colunas === 0) {
    item.situacao = 'SEM ESTOQUE';
  } else if (item.deficit === 0) {
    item.situacao = 'CASADO';
  } else {
    item.situacao = 'DESCASADO';
  }

  if (item.deficit > 0) {
    // Faltam colunas para as bases que ja estao no CD.
    item.comprarColuna = item.deficit;
  } else if (item.deficit < 0) {
    // Sobram colunas sem base. Compra base e completa o ultimo conjunto.
    const sobra = -item.deficit;
    item.comprarBase = Math.ceil(sobra / item.ratio);
    item.comprarColuna = item.comprarBase * item.ratio - sobra;
  }
  return item;
}

/* Monta a arvore Fornecedor -> Tonelada -> Item pai.

   Entram os kits que tem base ou coluna, que sao os elevadores do
   projeto. De cada kit vem o componente inteiro, incluindo bomba,
   comando e motor: eles nao entram na conta do casamento, mas faltam
   no CD do mesmo jeito e o comprador precisa ver. */
export function listarPorFornecedor(componentes: Componente[]): GrupoFornecedor[] {
  const itens = new Map<string, ItemFornecedor>();
  const marcasPorFornecedor = new Map<string, Set<string>>();

  /* Primeiro descobre quais componentes servem mais de um elevador: o
     saldo deles e o mesmo estoque, e a compra nao pode dobrar. */
  const paisPorComponente = new Map<string, Set<string>>();
  for (const c of componentes) {
    const codigo = String(c.itemComponente ?? '').trim();
    const pai = String(c.itemVolMultiplo ?? '').trim();
    if (!codigo || !pai) continue;
    const pais = paisPorComponente.get(codigo) ?? new Set<string>();
    pais.add(pai);
    paisPorComponente.set(codigo, pais);
  }

  /* Quais itens pai sao elevadores do projeto: os que tem base ou
     coluna. O resto da planilha nao entra na lista de compra. */
  const kits = new Set<string>();
  for (const c of componentes) {
    if (tipoComponente(c) === 'OUTRO') continue;
    const pai = String(c.itemVolMultiplo ?? '').trim();
    if (pai) kits.add(pai);
  }

  for (const c of componentes) {
    const codigoPai = String(c.itemVolMultiplo ?? '').trim();
    if (!codigoPai || !kits.has(codigoPai)) continue;
    const bruto = tipoComponente(c);
    const tipo =
      bruto === 'OUTRO' ? String(c.componenteBaseColuna ?? '').trim().toUpperCase() || 'OUTRO' : bruto;

    const fornecedor = nomeDoFornecedor(c);
    let item = itens.get(codigoPai);
    if (!item) {
      item = {
        item: codigoPai,
        nome: c.nomeItemVolMultiplo,
        marca: c.marca,
        fabricante: fornecedor,
        tonelada: c.toneladaFixa || '—',
        ratio: ratioDaTonelada(c.toneladaFixa),
        componentes: [],
        bases: 0,
        colunas: 0,
        colunasNecessarias: 0,
        deficit: 0,
        completos: 0,
        situacao: 'SEM ESTOQUE',
        comprarColuna: 0,
        comprarBase: 0,
        semSaldo: 0,
      };
      itens.set(codigoPai, item);
    }

    const codigo = String(c.itemComponente ?? '').trim();
    item.componentes.push({
      codigo,
      nome: c.nomeItemComponente,
      tipo,
      sn: String(c.inInterface ?? '').trim().toUpperCase(),
      cd: c.cd,
      reversa: c.reversa,
      paisQueUsam: paisPorComponente.get(codigo)?.size ?? 1,
    });
    /* So base e coluna entram na conta do casamento. */
    if (tipo === 'BASE') item.bases += c.cd;
    else if (tipo === 'COLUNA') item.colunas += c.cd;

    const marcas = marcasPorFornecedor.get(fornecedor) ?? new Set<string>();
    if (c.marca) marcas.add(c.marca);
    marcasPorFornecedor.set(fornecedor, marcas);
  }

  /* Agrupa os itens ja fechados por fornecedor e tonelada. */
  const grupos = new Map<string, Map<string, ItemFornecedor[]>>();
  for (const item of itens.values()) {
    fecharItem(item);
    const porTon = grupos.get(item.fabricante) ?? new Map<string, ItemFornecedor[]>();
    const lista = porTon.get(item.tonelada) ?? [];
    lista.push(item);
    porTon.set(item.tonelada, lista);
    grupos.set(item.fabricante, porTon);
  }

  const saida: GrupoFornecedor[] = [];
  for (const [fornecedor, porTon] of grupos) {
    const toneladas: GrupoTonelada[] = [];
    for (const [tonelada, lista] of porTon) {
      /* Quem tem mais peca a comprar aparece primeiro dentro da tonelada. */
      lista.sort(
        (a, b) =>
          b.comprarColuna + b.comprarBase - (a.comprarColuna + a.comprarBase) ||
          a.item.localeCompare(b.item)
      );
      toneladas.push({
        tonelada,
        ratio: lista[0].ratio,
        itens: lista,
        descasados: lista.filter((i) => i.situacao === 'DESCASADO').length,
        comprarColuna: lista.reduce((s, i) => s + i.comprarColuna, 0),
        comprarBase: lista.reduce((s, i) => s + i.comprarBase, 0),
      });
    }
    toneladas.sort((a, b) => ordemTonelada(a.tonelada) - ordemTonelada(b.tonelada));

    const todos = toneladas.flatMap((t) => t.itens);
    saida.push({
      fornecedor,
      marcas: [...(marcasPorFornecedor.get(fornecedor) ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      toneladas,
      itens: todos.length,
      descasados: todos.filter((i) => i.situacao === 'DESCASADO').length,
      comprarColuna: toneladas.reduce((s, t) => s + t.comprarColuna, 0),
      comprarBase: toneladas.reduce((s, t) => s + t.comprarBase, 0),
      compartilhados: new Set(
        todos.flatMap((i) => i.componentes.filter((c) => c.paisQueUsam > 1).map((c) => c.codigo))
      ).size,
    });
  }

  /* Fornecedor com mais peca a comprar primeiro: e por onde o comprador
     comeca o dia. */
  saida.sort(
    (a, b) =>
      b.comprarColuna + b.comprarBase - (a.comprarColuna + a.comprarBase) ||
      a.fornecedor.localeCompare(b.fornecedor, 'pt-BR')
  );
  return saida;
}

/* Mensagem pronta para o comprador, em texto puro.

   Vai por e-mail, entao nada de tabela: um bloco por fornecedor, e
   dentro dele um bloco por elevador com o saldo de hoje, o que falta e
   os componentes que formam o conjunto. */
export function mensagemDeCompra(
  grupos: GrupoFornecedor[],
  opcoes: { data?: Date; local?: string } = {}
): string {
  const data = opcoes.data ?? new Date();
  const local = opcoes.local ?? 'CD Cajamar';
  const itens = grupos.reduce((s, g) => s + g.itens, 0);
  const colunas = grupos.reduce((s, g) => s + g.comprarColuna, 0);
  const bases = grupos.reduce((s, g) => s + g.comprarBase, 0);

  const linhas: string[] = [
    `Itens descasados no CD - ${local}`,
    `Posicao de ${data.toLocaleDateString('pt-BR')}`,
    '',
    `${itens} elevador(es) na lista. Faltam ${colunas} coluna(s) e ${bases} base(s) para fechar os conjuntos.`,
  ];

  for (const g of grupos) {
    linhas.push('', `${g.fornecedor.toUpperCase()}`, '-'.repeat(g.fornecedor.length));
    for (const t of g.toneladas) {
      for (const i of t.itens) {
        linhas.push(
          `${i.item} - ${i.nome || 'sem descricao'} (${i.tonelada}, ratio 1:${i.ratio})`,
          `   No CD hoje: ${i.bases} base(s) e ${i.colunas} coluna(s). ${textoCompra(i)}.`
        );
        for (const c of i.componentes) {
          const repete = c.paisQueUsam > 1 ? ` [serve ${c.paisQueUsam} elevadores]` : '';
          const codigo = c.ausente ? '(sem cadastro)' : c.codigo;
          linhas.push(`   ${c.tipo.padEnd(7)} ${codigo.padEnd(14)} saldo ${c.cd}  ${c.nome}${repete}`);
        }
        if (i.semSaldo > 0) {
          linhas.push(`   ${i.semSaldo} componente(s) do kit estao com saldo zero no CD.`);
        }
      }
    }
    linhas.push(
      `Total ${g.fornecedor}: comprar ${g.comprarColuna} coluna(s) e ${g.comprarBase} base(s).`
    );
  }

  const repetidos = grupos.reduce((s, g) => s + g.compartilhados, 0);
  if (repetidos > 0) {
    linhas.push(
      '',
      `Atencao: ${repetidos} componente(s) servem mais de um elevador. O saldo do CD deles e o mesmo`,
      'estoque em todos, entao a quantidade a comprar nao pode ser somada duas vezes.'
    );
  }
  return linhas.join('\n');
}

/* O que comprar, em texto curto, igual na tela e na copia. */
export function textoCompra(i: {
  situacao: SituacaoItem;
  comprarColuna: number;
  comprarBase: number;
}): string {
  if (i.situacao === 'SEM ESTOQUE') return 'sem estoque';
  const partes: string[] = [];
  if (i.comprarColuna > 0) partes.push(`${i.comprarColuna} coluna(s)`);
  if (i.comprarBase > 0) partes.push(`${i.comprarBase} base(s)`);
  return partes.length > 0 ? `comprar ${partes.join(' e ')}` : 'equalizado';
}
