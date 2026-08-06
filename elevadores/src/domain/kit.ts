/* ============================================================
   Montagem do kit a partir da composicao real do item pai.

   O calculo antigo somava tudo que era BASE de um lado, tudo que era
   COLUNA do outro, e deduzia quantas colunas cada base precisa a
   partir da TONELADA (4 t e 5 t pediam duas). Isso quebra em dois
   casos que existem na base:

   1. Kit com duas colunas DIFERENTES. O 2031433 tem 1 base
      (2032019), 1 coluna com acionador (2032020) e 1 coluna sem
      acionador (2032021), uma de cada por elevador. Somar as duas
      colunas trata pecas distintas como intercambiaveis: com 32, 31 e
      32 de saldo, montam-se 31 elevadores, nao 32 - e o que falta e 1
      unidade do 2032020 especificamente, nao "1 coluna" qualquer.

   2. Kit de uma coluna so em produto de 4 t. A rampa 2031441 leva 1
      base e 1 coluna, mas a tonelada 4000 fazia o calculo exigir 2
      colunas por base e acusar falta de 2 colunas em um kit que esta
      completo.

   A composicao ja esta na planilha: cada componente traz a quantidade
   por kit. E dela que sai a conta, componente a componente.
   ============================================================ */
import type { Componente } from './tipos';

export interface ComponenteDoKit {
  codigo: string;
  nome: string;
  tipo: string;
  /* Quantas unidades deste componente cada kit consome. */
  porKit: number;
  saldo: number;
  /* Quantos kits este componente sozinho sustenta. */
  kitsQueSustenta: number;
  /* Quanto falta dele para chegar ao alvo do item. */
  faltam: number;
}

export interface MontagemDoKit {
  /* Kits completos possiveis: manda o componente mais escasso. */
  kits: number;
  /* Kits que dariam se o componente escasso fosse reposto. E o alvo
     da compra: equalizar por cima, nao por baixo. */
  alvo: number;
  componentes: ComponenteDoKit[];
  /* Verdadeiro quando todos os componentes sustentam o mesmo numero
     de kits: nao sobra peca sem par. */
  casado: boolean;
  /* Nenhum componente com saldo. */
  semEstoque: boolean;
}

/* Quantidade por kit. A planilha as vezes traz 0 ou vazio, que na
   pratica significa uma unidade; dividir por zero quebraria a conta. */
export function porKitDe(c: Pick<Componente, 'quantidade'>): number {
  const q = Number(c.quantidade);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

/* Monta o kit a partir dos componentes de UM item pai.

   Os componentes precisam vir ja filtrados para o que entra no kit:
   esta funcao nao decide o que e peca de conjunto, so faz a conta. */
export function montarKit(
  componentes: { codigo: string; nome: string; tipo: string; porKit: number; saldo: number }[]
): MontagemDoKit {
  if (componentes.length === 0) {
    return { kits: 0, alvo: 0, componentes: [], casado: false, semEstoque: true };
  }

  const sustentam = componentes.map((c) => Math.floor(c.saldo / c.porKit));
  const kits = Math.min(...sustentam);
  const alvo = Math.max(...sustentam);

  const detalhados: ComponenteDoKit[] = componentes.map((c, i) => ({
    codigo: c.codigo,
    nome: c.nome,
    tipo: c.tipo,
    porKit: c.porKit,
    saldo: c.saldo,
    kitsQueSustenta: sustentam[i],
    faltam: Math.max(0, alvo * c.porKit - c.saldo),
  }));

  return {
    kits,
    alvo,
    componentes: detalhados,
    /* Casado e todo mundo sustentando o mesmo tanto. Sobra de peca em
       um componente ja e descasamento, mesmo que o kit feche. */
    casado: kits === alvo,
    semEstoque: componentes.every((c) => c.saldo === 0),
  };
}

/* Total a comprar de um tipo de componente para equalizar o item. */
export function faltamDoTipo(m: MontagemDoKit, tipo: string): number {
  return m.componentes.filter((c) => c.tipo === tipo).reduce((s, c) => s + c.faltam, 0);
}

/* Frase da acao de compra, item a item. Nomeia o componente porque
   "comprar 1 coluna" nao diz qual das duas colunas do kit falta. */
export function explicarCompra(m: MontagemDoKit): string {
  const faltando = m.componentes.filter((c) => c.faltam > 0);
  if (m.semEstoque) return 'Sem estoque de nenhum componente';
  if (faltando.length === 0) return `Equalizado: ${m.kits} kit(s) completo(s)`;
  const partes = faltando.map((c) => `${c.faltam} de ${c.codigo || c.tipo}`);
  return `Comprar ${partes.join(' e ')} para fechar ${m.alvo} kit(s)`;
}
