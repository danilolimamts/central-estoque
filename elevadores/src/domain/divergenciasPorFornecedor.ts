/* ============================================================
   Divergencias do SAC agrupadas por fornecedor.

   ATENCAO: a aba Divergencias SAC nao tem coluna de fornecedor. As
   unicas pistas do produto sao "Item Produto" e "Produto" ("929051 -
   RAMPA PARA ALINHAMENTO..."), e o fornecedor mora na aba Multiplos,
   no campo Fabricante.

   Entao este agrupamento e um cruzamento, nao uma leitura direta: o
   codigo do produto devolvido e procurado na base mestre para
   descobrir de quem e o elevador. Isso tem duas consequencias que a
   tela precisa mostrar, nunca esconder:

   1. Produto que nao esta na aba Multiplos nao tem fornecedor. Ele nao
      pode sumir da conta - vai para "Nao identificado", com o numero a
      vista. Se essa fatia for grande, o ranking inteiro perde valor, e
      quem le tem o direito de saber disso.
   2. O cruzamento e por codigo. Codigo escrito de outro jeito na
      planilha do SAC nao casa, mesmo sendo o mesmo produto.

   O que este modulo NAO faz: dizer de quem e a culpa. Ele responde
   "de qual fornecedor era o elevador que voltou", que e outra
   pergunta. A responsabilidade apurada pelo SAC continua em
   porResponsavel, e as duas leituras nao sao intercambiaveis.
   ============================================================ */
import type { Componente } from './tipos';
import type { DivergenciaSAC } from './divergencias';

/* Casos que nao acharam fornecedor na base mestre. Nome proprio para
   nunca ser confundido com um fornecedor de verdade. */
export const NAO_IDENTIFICADO = 'Não identificado';

export interface LinhaFornecedorSAC {
  fornecedor: string;
  quantidade: number;
  valor: number;
  /* Participacao sobre o total de casos do periodo. */
  pct: number;
  /* Marca a linha de "Nao identificado", para a tela poder trata-la
     como o que ela e: uma lacuna de cadastro, nao um resultado. */
  semCadastro: boolean;
}

/* Um produto que nao achou fornecedor na base mestre. Sem a descricao
   o numero nao vira acao: "4 casos sem fornecedor" nao diz o que
   cadastrar, "4570497 - COLUNAS_ELEV HIDRAULICO 4T" diz. */
export interface ItemSemCadastro {
  codigo: string;
  produto: string;
  quantidade: number;
  valor: number;
}

export interface ResumoFornecedorSAC {
  linhas: LinhaFornecedorSAC[];
  /* Quantos casos entraram sem fornecedor conhecido, e o que isso
     representa. E o numero que diz se da para confiar no ranking. */
  semCadastro: number;
  pctSemCadastro: number;
  total: number;
  /* Quais produtos ficaram de fora, para o cadastro poder ser
     corrigido. Do que mais aparece para o que menos aparece. */
  itensSemCadastro: ItemSemCadastro[];
}

/* Codigo do produto -> fabricante.

   O item pai (o elevador) vem primeiro e vence: e ele que corresponde
   ao que foi vendido. O componente entra depois, para o caso de a
   devolucao ter sido de uma peca solta - uma rampa, uma base - que nao
   aparece como item pai em lugar nenhum. */
export function mapaDeFabricante(componentes: Componente[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const c of componentes) {
    const codigo = c.itemVolMultiplo?.trim();
    const fab = c.fabricante?.trim();
    if (codigo && fab && !mapa.has(codigo)) mapa.set(codigo, fab);
  }
  for (const c of componentes) {
    const codigo = c.itemComponente?.trim();
    const fab = c.fabricante?.trim();
    if (codigo && fab && !mapa.has(codigo)) mapa.set(codigo, fab);
  }
  return mapa;
}

export function divergenciasPorFornecedor(
  lista: DivergenciaSAC[],
  componentes: Componente[]
): ResumoFornecedorSAC {
  const mapa = mapaDeFabricante(componentes);
  const somas = new Map<string, { quantidade: number; valor: number }>();
  /* Os produtos que caem em "Nao identificado", um por codigo. */
  const semCadastroPorItem = new Map<string, ItemSemCadastro>();

  for (const d of lista) {
    const codigo = d.itemProduto?.trim();
    const fornecedor = (codigo && mapa.get(codigo)) || NAO_IDENTIFICADO;
    const atual = somas.get(fornecedor) ?? { quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    atual.valor += d.valor;
    somas.set(fornecedor, atual);

    if (fornecedor === NAO_IDENTIFICADO) {
      /* Devolucao sem codigo existe: entra agrupada pela descricao,
         que e a unica pista que sobrou do que voltou. */
      const chave = codigo || `sem codigo: ${d.produto?.trim() ?? ''}`;
      const item = semCadastroPorItem.get(chave) ?? {
        codigo: codigo ?? '',
        produto: d.produto?.trim() ?? '',
        quantidade: 0,
        valor: 0,
      };
      item.quantidade += 1;
      item.valor += d.valor;
      /* A descricao pode faltar em uma linha e vir na outra do mesmo
         codigo; fica a primeira que estiver preenchida. */
      if (!item.produto) item.produto = d.produto?.trim() ?? '';
      semCadastroPorItem.set(chave, item);
    }
  }

  const total = lista.length;
  const linhas: LinhaFornecedorSAC[] = [...somas.entries()].map(([fornecedor, s]) => ({
    fornecedor,
    quantidade: s.quantidade,
    valor: s.valor,
    pct: total > 0 ? (s.quantidade / total) * 100 : 0,
    semCadastro: fornecedor === NAO_IDENTIFICADO,
  }));

  /* Mais casos primeiro; empate desempata pelo custo e depois pelo
     nome, para a ordem nao mudar de uma importacao para outra.

     "Nao identificado" vai sempre para o fim: ele nao disputa o
     ranking, e no topo daria a impressao de ser o maior fornecedor. */
  linhas.sort((a, b) => {
    if (a.semCadastro !== b.semCadastro) return a.semCadastro ? 1 : -1;
    return (
      b.quantidade - a.quantidade ||
      b.valor - a.valor ||
      a.fornecedor.localeCompare(b.fornecedor, 'pt-BR')
    );
  });

  const semCadastro = somas.get(NAO_IDENTIFICADO)?.quantidade ?? 0;
  const itensSemCadastro = [...semCadastroPorItem.values()].sort(
    (a, b) =>
      b.quantidade - a.quantidade ||
      b.valor - a.valor ||
      a.codigo.localeCompare(b.codigo, 'pt-BR')
  );

  return {
    linhas,
    semCadastro,
    pctSemCadastro: total > 0 ? (semCadastro / total) * 100 : 0,
    total,
    itensSemCadastro,
  };
}
