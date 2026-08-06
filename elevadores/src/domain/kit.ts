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
  /* Kits pelo par base x coluna, que e o foco da equalizacao. */
  kits: number;
  /* Kits com o kit inteiro: entra bomba, comando e o que mais compoe
     o produto. E quantos dao para expedir de verdade. */
  kitsCompletos: number;
  /* Componentes fora do par que seguram o kit abaixo do que o par
     permite. Sao eles que impedem a expedicao. */
  limitantes: ComponenteDoKit[];
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
    return {
      kits: 0, kitsCompletos: 0, alvo: 0, componentes: [],
      limitantes: [], casado: false, semEstoque: true,
    };
  }

  const sustentam = componentes.map((c) => Math.floor(c.saldo / c.porKit));
  const detalhados: ComponenteDoKit[] = componentes.map((c, i) => ({
    codigo: c.codigo,
    nome: c.nome,
    tipo: c.tipo,
    porKit: c.porKit,
    saldo: c.saldo,
    kitsQueSustenta: sustentam[i],
    faltam: 0,
  }));

  /* O par base x coluna e o foco da equalizacao: e dele que saem o
     casamento, o alvo e a compra. Os demais componentes entram como
     limite de expedicao, sem mandar na conta do par - senao uma bomba
     zerada faria o projeto inteiro parecer descasado. */
  const doPar = detalhados.filter((c) => c.tipo === 'BASE' || c.tipo === 'COLUNA');
  const base = doPar.length > 0 ? doPar : detalhados;

  const kits = Math.min(...base.map((c) => c.kitsQueSustenta));
  const alvo = Math.max(...base.map((c) => c.kitsQueSustenta));
  for (const c of detalhados) {
    c.faltam = Math.max(0, alvo * c.porKit - c.saldo);
  }

  const kitsCompletos = Math.min(...detalhados.map((c) => c.kitsQueSustenta));
  const limitantes = detalhados.filter(
    (c) => c.tipo !== 'BASE' && c.tipo !== 'COLUNA' && c.kitsQueSustenta < kits
  );

  return {
    kits,
    kitsCompletos,
    alvo,
    componentes: detalhados,
    limitantes,
    /* Casado e todo o par sustentando o mesmo tanto. Sobra de peca em
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
  const faltando = m.componentes.filter(
    (c) => c.faltam > 0 && (c.tipo === 'BASE' || c.tipo === 'COLUNA')
  );
  if (m.semEstoque) return 'Sem estoque de nenhum componente';
  if (faltando.length === 0) return `Equalizado: ${m.kits} kit(s) completo(s)`;
  const partes = faltando.map((c) => `${c.faltam} de ${c.codigo || c.tipo}`);
  return `Comprar ${partes.join(' e ')} para fechar ${m.alvo} kit(s)`;
}

/* Aviso do componente fora do par que impede a expedicao. O par pode
   estar casado e o produto seguir sem poder sair. */
export function explicarLimite(m: MontagemDoKit): string | null {
  if (m.limitantes.length === 0) return null;
  const nomes = m.limitantes
    .map((c) => `${c.tipo}${c.codigo ? ` ${c.codigo}` : ''} (${c.saldo})`)
    .join(', ');
  return `O par fecha ${m.kits}, mas só dá para expedir ${m.kitsCompletos}: ${nomes}`;
}
