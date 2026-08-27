/* O fornecedor de uma devolucao nao vem na planilha do SAC: ele e
   descoberto cruzando o codigo do produto com a base mestre. O que
   estes testes protegem e o comportamento nas bordas desse
   cruzamento, que e onde um ranking silenciosamente errado nasce. */
import { describe, it, expect } from 'vitest';
import {
  divergenciasPorFornecedor,
  mapaDeFabricante,
  NAO_IDENTIFICADO,
} from '../src/domain/divergenciasPorFornecedor';
import type { DivergenciaSAC } from '../src/domain/divergencias';
import type { Componente } from '../src/domain/tipos';

function comp(p: Partial<Componente>): Componente {
  return {
    itemVolMultiplo: '', nomeItemVolMultiplo: '', itemComponente: '',
    nomeItemComponente: '', quantidade: 1, inInterface: '', peso: 0,
    linhaProduto: '', marca: '', componenteBaseColuna: '', filtrar: '',
    cd: 0, reversa: 0, ds: 0, outros: 0, chave: '', toneladaFixa: '',
    fabricante: '',
    ...p,
  };
}

function div(p: Partial<DivergenciaSAC>): DivergenciaSAC {
  return {
    pedido: '', entrega: '', filial: 'CD_CAJAMAR', origem: 'CD',
    itemProduto: '', produto: '', motivo: '', submotivo: '', comentario: '',
    transportadora: '', estado: '', canal: '', valor: 0, data: null,
    dataPelaSaida: true, considerar: true,
    ...p,
  };
}

describe('mapa de fabricante', () => {
  it('o item pai vence o componente quando o código aparece nos dois', () => {
    /* O que foi devolvido é o elevador, então o fabricante do item pai
       é o que corresponde ao produto vendido. */
    const mapa = mapaDeFabricante([
      comp({ itemComponente: '5000', fabricante: 'BETA' }),
      comp({ itemVolMultiplo: '5000', fabricante: 'ALFA' }),
    ]);
    expect(mapa.get('5000')).toBe('ALFA');
  });

  it('componente entra quando não existe como item pai', () => {
    /* Peça solta devolvida — uma rampa, uma base — não aparece como
       item pai em lugar nenhum. */
    const mapa = mapaDeFabricante([comp({ itemComponente: '2031441', fabricante: 'BETA' })]);
    expect(mapa.get('2031441')).toBe('BETA');
  });

  it('item sem fabricante preenchido não entra no mapa', () => {
    const mapa = mapaDeFabricante([comp({ itemVolMultiplo: '900', fabricante: '  ' })]);
    expect(mapa.has('900')).toBe(false);
  });
});

describe('divergências por fornecedor', () => {
  const base = [
    comp({ itemVolMultiplo: '100', fabricante: 'ALFA' }),
    comp({ itemVolMultiplo: '200', fabricante: 'BETA' }),
  ];

  it('soma casos e valor por fornecedor', () => {
    const r = divergenciasPorFornecedor(
      [
        div({ itemProduto: '100', valor: 1000 }),
        div({ itemProduto: '100', valor: 500 }),
        div({ itemProduto: '200', valor: 300 }),
      ],
      base
    );
    expect(r.linhas[0]).toMatchObject({ fornecedor: 'ALFA', quantidade: 2, valor: 1500 });
    expect(r.linhas[1]).toMatchObject({ fornecedor: 'BETA', quantidade: 1, valor: 300 });
  });

  it('a participação é sobre o total de casos, incluindo os sem cadastro', () => {
    /* Calcular a participação só sobre os identificados inflaria cada
       fornecedor: 1 de 2 viraria 50% quando é 1 de 4. */
    const r = divergenciasPorFornecedor(
      [
        div({ itemProduto: '100' }),
        div({ itemProduto: '999' }),
        div({ itemProduto: '999' }),
        div({ itemProduto: '999' }),
      ],
      base
    );
    expect(r.total).toBe(4);
    expect(r.linhas[0]).toMatchObject({ fornecedor: 'ALFA', pct: 25 });
  });

  it('produto fora da base mestre não some da conta', () => {
    /* Descartar em silêncio faria o painel mostrar menos devolução do
       que houve — o erro mais caro possível neste cartão. */
    const r = divergenciasPorFornecedor(
      [div({ itemProduto: '100', valor: 10 }), div({ itemProduto: '777', valor: 90 })],
      base
    );
    expect(r.total).toBe(2);
    expect(r.semCadastro).toBe(1);
    expect(r.pctSemCadastro).toBe(50);
    const gap = r.linhas.find((l) => l.semCadastro);
    expect(gap).toMatchObject({ fornecedor: NAO_IDENTIFICADO, quantidade: 1, valor: 90 });
  });

  it('"Não identificado" fica sempre por último, mesmo sendo o maior', () => {
    /* No topo do ranking ele pareceria o fornecedor que mais devolve. */
    const r = divergenciasPorFornecedor(
      [
        div({ itemProduto: '888' }),
        div({ itemProduto: '888' }),
        div({ itemProduto: '888' }),
        div({ itemProduto: '100' }),
      ],
      base
    );
    expect(r.linhas[0].fornecedor).toBe('ALFA');
    expect(r.linhas[r.linhas.length - 1].fornecedor).toBe(NAO_IDENTIFICADO);
  });

  it('empate em casos desempata por custo e depois por nome', () => {
    /* Ordem estável entre importações: sem isso o ranking troca de
       posição sozinho e quem acompanha acha que mudou alguma coisa. */
    const r = divergenciasPorFornecedor(
      [
        div({ itemProduto: '100', valor: 100 }),
        div({ itemProduto: '200', valor: 900 }),
      ],
      base
    );
    expect(r.linhas.map((l) => l.fornecedor)).toEqual(['BETA', 'ALFA']);

    const empate = divergenciasPorFornecedor(
      [div({ itemProduto: '100', valor: 50 }), div({ itemProduto: '200', valor: 50 })],
      base
    );
    expect(empate.linhas.map((l) => l.fornecedor)).toEqual(['ALFA', 'BETA']);
  });

  it('sem base mestre, tudo cai em não identificado — e isso fica visível', () => {
    const r = divergenciasPorFornecedor([div({ itemProduto: '100' })], []);
    expect(r.pctSemCadastro).toBe(100);
    expect(r.linhas).toHaveLength(1);
  });

  it('lista vazia não quebra nem divide por zero', () => {
    const r = divergenciasPorFornecedor([], base);
    expect(r).toMatchObject({ linhas: [], total: 0, semCadastro: 0, pctSemCadastro: 0 });
  });
});

describe('quais produtos ficaram sem fornecedor', () => {
  /* O numero sozinho nao vira acao: "4 casos sem fornecedor" nao diz o
     que cadastrar. A tela precisa da descricao de cada produto. */
  const componentes = [comp({ itemVolMultiplo: '100', fabricante: 'ALFA' })];

  it('lista codigo e descricao de cada produto que nao casou', () => {
    const r = divergenciasPorFornecedor(
      [
        div({ itemProduto: '100', produto: 'ELEVADOR ALFA 4T', valor: 10 }),
        div({ itemProduto: '999', produto: 'RAMPA PARA ALINHAMENTO', valor: 30 }),
        div({ itemProduto: '888', produto: 'COLUNAS_ELEV HIDRAULICO 4T', valor: 20 }),
      ],
      componentes
    );
    expect(r.semCadastro).toBe(2);
    expect(r.itensSemCadastro).toEqual([
      { codigo: '999', produto: 'RAMPA PARA ALINHAMENTO', quantidade: 1, valor: 30 },
      { codigo: '888', produto: 'COLUNAS_ELEV HIDRAULICO 4T', quantidade: 1, valor: 20 },
    ]);
    /* Quem tem fornecedor nao entra na lista da lacuna. */
    expect(r.itensSemCadastro.some((i) => i.codigo === '100')).toBe(false);
  });

  it('junta as devolucoes do mesmo produto em uma linha', () => {
    const r = divergenciasPorFornecedor(
      [
        div({ itemProduto: '999', produto: 'RAMPA', valor: 30 }),
        div({ itemProduto: '999', produto: 'RAMPA', valor: 20 }),
        div({ itemProduto: '777', produto: 'BASE SOLTA', valor: 90 }),
      ],
      componentes
    );
    const rampa = r.itensSemCadastro.find((i) => i.codigo === '999')!;
    expect(rampa.quantidade).toBe(2);
    expect(rampa.valor).toBe(50);
    /* Mais casos primeiro, mesmo custando menos: o que mais volta e o
       que mais urge cadastrar. */
    expect(r.itensSemCadastro.map((i) => i.codigo)).toEqual(['999', '777']);
  });

  it('devolucao sem codigo entra pela descricao, sem sumir da lista', () => {
    const r = divergenciasPorFornecedor(
      [div({ itemProduto: '', produto: 'ELEVADOR SEM CODIGO', valor: 15 })],
      componentes
    );
    expect(r.semCadastro).toBe(1);
    expect(r.itensSemCadastro).toHaveLength(1);
    expect(r.itensSemCadastro[0].codigo).toBe('');
    expect(r.itensSemCadastro[0].produto).toBe('ELEVADOR SEM CODIGO');
  });

  it('aproveita a descricao da outra linha quando uma vem vazia', () => {
    const r = divergenciasPorFornecedor(
      [
        div({ itemProduto: '999', produto: '', valor: 10 }),
        div({ itemProduto: '999', produto: 'RAMPA PARA ALINHAMENTO', valor: 10 }),
      ],
      componentes
    );
    expect(r.itensSemCadastro[0].produto).toBe('RAMPA PARA ALINHAMENTO');
    expect(r.itensSemCadastro[0].quantidade).toBe(2);
  });

  it('sem lacuna nenhuma, a lista vem vazia', () => {
    const r = divergenciasPorFornecedor([div({ itemProduto: '100', produto: 'X' })], componentes);
    expect(r.semCadastro).toBe(0);
    expect(r.itensSemCadastro).toEqual([]);
  });

  it('a soma da lista fecha com o total de casos sem fornecedor', () => {
    const r = divergenciasPorFornecedor(
      [
        div({ itemProduto: '999', valor: 10 }),
        div({ itemProduto: '999', valor: 10 }),
        div({ itemProduto: '888', valor: 5 }),
        div({ itemProduto: '100', valor: 5 }),
      ],
      componentes
    );
    const soma = r.itensSemCadastro.reduce((s, i) => s + i.quantidade, 0);
    expect(soma).toBe(r.semCadastro);
    const linha = r.linhas.find((l) => l.fornecedor === NAO_IDENTIFICADO)!;
    expect(r.itensSemCadastro.reduce((s, i) => s + i.valor, 0)).toBe(linha.valor);
  });
});
