/* ============================================================
   Testes da montagem do kit pela composicao real.

   Os dois primeiros casos sao da base de verdade e foram os que
   mostraram o erro do calculo por tonelada.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { montarKit, faltamDoTipo, explicarCompra, explicarLimite, porKitDe } from '../src/domain/kit';

const c = (codigo: string, tipo: string, porKit: number, saldo: number) => ({
  codigo, nome: codigo, tipo, porKit, saldo,
});

describe('caso real 2031433 — elevador com duas colunas diferentes', () => {
  /* 1 base + 1 coluna com acionador + 1 coluna sem acionador, uma de
     cada por elevador. Saldos 32, 31 e 32. */
  const kit = montarKit([
    c('2032019', 'BASE', 1, 32),
    c('2032020', 'COLUNA', 1, 31),
    c('2032021', 'COLUNA', 1, 32),
  ]);

  it('monta 31 elevadores, nao 32: manda o componente mais escasso', () => {
    expect(kit.kits).toBe(31);
  });

  it('o alvo e 32, que e onde os outros dois componentes ja estao', () => {
    expect(kit.alvo).toBe(32);
  });

  it('acusa descasado, porque sobra peca sem par', () => {
    expect(kit.casado).toBe(false);
  });

  it('falta 1 unidade do 2032020, e so dele', () => {
    const falta = kit.componentes.filter((x) => x.faltam > 0);
    expect(falta).toHaveLength(1);
    expect(falta[0].codigo).toBe('2032020');
    expect(falta[0].faltam).toBe(1);
    expect(faltamDoTipo(kit, 'COLUNA')).toBe(1);
    expect(faltamDoTipo(kit, 'BASE')).toBe(0);
  });

  it('a acao nomeia o componente, nao diz "1 coluna" generica', () => {
    expect(explicarCompra(kit)).toContain('2032020');
  });
});

describe('caso real 2031441 — rampa de 4000 com uma coluna so', () => {
  /* A tonelada comeca com 4, o que fazia o calculo antigo exigir duas
     colunas por base e acusar falta de 2 colunas. O kit leva uma de
     cada, e todos os saldos sao 2. */
  const kit = montarKit([
    c('2032070', 'BASE', 1, 2),
    c('2032074', 'COLUNA', 1, 2),
    c('2032080', 'OUTROS', 1, 2),
    c('4101860', 'OUTROS', 1, 2),
  ]);

  it('esta casado: as quantidades batem', () => {
    expect(kit.casado).toBe(true);
    expect(kit.kits).toBe(2);
    expect(kit.alvo).toBe(2);
  });

  it('nao manda comprar nada', () => {
    expect(kit.componentes.every((x) => x.faltam === 0)).toBe(true);
    expect(faltamDoTipo(kit, 'COLUNA')).toBe(0);
    expect(explicarCompra(kit)).toContain('Equalizado');
  });
});

describe('kit que consome mais de uma unidade do mesmo componente', () => {
  it('divide o saldo pela quantidade por kit', () => {
    /* 1 base + 2 colunas iguais por elevador. */
    const kit = montarKit([c('B', 'BASE', 1, 10), c('C', 'COLUNA', 2, 16)]);
    expect(kit.kits).toBe(8); // 16 colunas / 2 = 8
    expect(kit.alvo).toBe(10);
    expect(kit.componentes.find((x) => x.codigo === 'C')!.faltam).toBe(4); // 10*2 - 16
  });

  it('quantidade zerada ou vazia vale como uma unidade', () => {
    expect(porKitDe({ quantidade: 0 })).toBe(1);
    expect(porKitDe({ quantidade: NaN })).toBe(1);
    expect(porKitDe({ quantidade: -3 })).toBe(1);
    expect(porKitDe({ quantidade: 2 })).toBe(2);
  });
});

describe('bordas', () => {
  it('kit sem componente nenhum nao quebra', () => {
    const kit = montarKit([]);
    expect(kit.kits).toBe(0);
    expect(kit.semEstoque).toBe(true);
    expect(kit.casado).toBe(false);
  });

  it('tudo zerado e sem estoque, nao descasado', () => {
    const kit = montarKit([c('B', 'BASE', 1, 0), c('C', 'COLUNA', 1, 0)]);
    expect(kit.semEstoque).toBe(true);
    expect(kit.kits).toBe(0);
    expect(kit.alvo).toBe(0);
    expect(kit.casado).toBe(true); // 0 = 0: nao ha desequilibrio
    expect(explicarCompra(kit)).toContain('Sem estoque');
  });

  it('componente unico sempre fecha casado', () => {
    const kit = montarKit([c('B', 'BASE', 1, 7)]);
    expect(kit.kits).toBe(7);
    expect(kit.casado).toBe(true);
  });

  it('a base sobrando tambem e descasamento, nao so a coluna', () => {
    const kit = montarKit([c('B', 'BASE', 1, 9), c('C', 'COLUNA', 1, 4)]);
    expect(kit.kits).toBe(4);
    expect(kit.alvo).toBe(9);
    expect(faltamDoTipo(kit, 'COLUNA')).toBe(5);
    expect(faltamDoTipo(kit, 'BASE')).toBe(0);
  });

  it('cada componente sustenta o que o proprio saldo permite', () => {
    const kit = montarKit([c('B', 'BASE', 1, 5), c('C', 'COLUNA', 2, 6)]);
    expect(kit.componentes.find((x) => x.codigo === 'B')!.kitsQueSustenta).toBe(5);
    expect(kit.componentes.find((x) => x.codigo === 'C')!.kitsQueSustenta).toBe(3);
  });
});

describe('kit inteiro entra na conta, mas o foco e o par base x coluna', () => {
  it('bomba zerada nao descasa o par, mas impede a expedicao', () => {
    const kit = montarKit([
      c('B', 'BASE', 1, 5),
      c('C', 'COLUNA', 1, 5),
      c('BM', 'BOMBA', 1, 0),
    ]);
    /* O par esta equalizado: 5 bases e 5 colunas. */
    expect(kit.kits).toBe(5);
    expect(kit.casado).toBe(true);
    /* Mas sem bomba nao sai nenhum produto completo. */
    expect(kit.kitsCompletos).toBe(0);
    expect(kit.limitantes.map((x) => x.codigo)).toEqual(['BM']);
    expect(explicarLimite(kit)).toContain('só dá para expedir 0');
  });

  it('componente fora do par com saldo de sobra nao vira limitante', () => {
    const kit = montarKit([
      c('B', 'BASE', 1, 3),
      c('C', 'COLUNA', 1, 3),
      c('BM', 'BOMBA', 1, 99),
    ]);
    expect(kit.kits).toBe(3);
    expect(kit.kitsCompletos).toBe(3);
    expect(kit.limitantes).toEqual([]);
    expect(explicarLimite(kit)).toBeNull();
  });

  it('a compra continua olhando so base e coluna', () => {
    const kit = montarKit([
      c('B', 'BASE', 1, 9),
      c('C', 'COLUNA', 1, 4),
      c('BM', 'BOMBA', 1, 0),
    ]);
    expect(faltamDoTipo(kit, 'COLUNA')).toBe(5);
    /* A bomba tem falta calculada, mas nao entra na frase de compra:
       o comprador do projeto compra base e coluna. */
    expect(kit.componentes.find((x) => x.codigo === 'BM')!.faltam).toBe(9);
    expect(explicarCompra(kit)).toContain('C');
    expect(explicarCompra(kit)).not.toContain('BM');
  });

  it('a rampa com os quatro componentes segue casada e expedivel', () => {
    const kit = montarKit([
      c('2032070', 'BASE', 1, 2),
      c('2032074', 'COLUNA', 1, 2),
      c('2032080', 'OUTROS', 1, 2),
      c('4101860', 'OUTROS', 1, 2),
    ]);
    expect(kit.casado).toBe(true);
    expect(kit.kits).toBe(2);
    expect(kit.kitsCompletos).toBe(2);
    expect(kit.limitantes).toEqual([]);
  });

  it('kit sem base nem coluna cai para os componentes que tiver', () => {
    const kit = montarKit([c('X', 'OUTROS', 1, 4)]);
    expect(kit.kits).toBe(4);
    expect(kit.kitsCompletos).toBe(4);
  });
});
