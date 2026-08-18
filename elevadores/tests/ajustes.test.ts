/* ============================================================
   Testes da reclassificacao manual do responsavel.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  identificarCaso,
  mapaDeAjustes,
  responsavelFinal,
  ajusteDe,
  registrarAjuste,
  removerAjuste,
  ajustesAplicados,
} from '../src/domain/ajustes';
import type { AjusteResponsavel } from '../src/domain/ajustes';
import { origemDaFilial, porResponsavel } from '../src/domain/divergencias';
import type { DivergenciaSAC } from '../src/domain/divergencias';

function div(p: Partial<DivergenciaSAC> = {}): DivergenciaSAC {
  const filial = p.filial ?? 'CD_CAJAMAR';
  return {
    pedido: '260710-1', entrega: '123930639', filial, origem: origemDaFilial(filial),
    itemProduto: '4484433', produto: 'BASE PARA ELEVADOR',
    motivo: 'Diferente do comprado', submotivo: 'Divergência operacional CD',
    comentario: 'Cliente recebeu a base no tamanho incorreto.',
    transportadora: 'TERMACO', estado: 'São Paulo', canal: 'TELEVENDAS',
    valor: 1000, data: new Date(Date.UTC(2026, 4, 4)), dataPelaSaida: true,
    ...p,
  };
}

function ajuste(p: Partial<AjusteResponsavel> = {}): AjusteResponsavel {
  return {
    caso: '123930639', responsavel: 'FORNECEDOR',
    motivo: 'fornecedor enviou o item errado ao CD',
    em: '2026-08-18T20:00:00.000Z',
    ...p,
  };
}

describe('como o caso e identificado', () => {
  it('pela entrega, que e como a operacao se refere a ele', () => {
    expect(identificarCaso(div())).toBe('123930639');
  });

  it('sem entrega, cai no pedido: nem toda devolucao virou entrega', () => {
    expect(identificarCaso(div({ entrega: '' }))).toBe('260710-1');
  });

  it('espaco em volta nao cria um caso diferente', () => {
    expect(identificarCaso(div({ entrega: '  123930639 ' }))).toBe('123930639');
  });
});

describe('o ajuste vence a leitura do texto', () => {
  const d = div();

  it('sem ajuste, vale o que o comentario diz', () => {
    /* "Divergencia operacional CD" e o SAC dizendo que foi o CD. */
    expect(responsavelFinal(d, mapaDeAjustes([]))).toBe('CD');
  });

  it('com ajuste, vale o que a pessoa apurou', () => {
    const mapa = mapaDeAjustes([ajuste()]);
    expect(responsavelFinal(d, mapa)).toBe('FORNECEDOR');
    expect(ajusteDe(d, mapa)?.motivo).toContain('item errado');
  });

  it('ajuste de outra entrega nao contamina este caso', () => {
    const mapa = mapaDeAjustes([ajuste({ caso: '999999999' })]);
    expect(responsavelFinal(d, mapa)).toBe('CD');
    expect(ajusteDe(d, mapa)).toBeUndefined();
  });

  it('a entrega inteira e reclassificada, com os dois produtos', () => {
    /* Duas linhas da mesma expedicao: se uma nao foi do CD, a outra
       tambem nao foi - saiu da mesma separacao. */
    const mapa = mapaDeAjustes([ajuste()]);
    const base = div({ produto: 'BASE PARA ELEVADOR' });
    const coluna = div({ produto: 'COLUNA PARA ELEVADOR' });
    expect(responsavelFinal(base, mapa)).toBe('FORNECEDOR');
    expect(responsavelFinal(coluna, mapa)).toBe('FORNECEDOR');
  });
});

describe('gravar e desfazer', () => {
  it('reajustar o mesmo caso substitui, nao empilha', () => {
    const um = registrarAjuste([], ajuste());
    const dois = registrarAjuste(um, ajuste({ responsavel: 'CLIENTE', motivo: 'cliente pediu errado' }));
    expect(dois).toHaveLength(1);
    expect(dois[0].responsavel).toBe('CLIENTE');
  });

  it('ajustes de casos diferentes convivem', () => {
    const lista = registrarAjuste(registrarAjuste([], ajuste()), ajuste({ caso: '888' }));
    expect(lista).toHaveLength(2);
  });

  it('desfazer devolve o caso para a classificacao automatica', () => {
    const lista = removerAjuste([ajuste()], '123930639');
    expect(lista).toHaveLength(0);
    expect(responsavelFinal(div(), mapaDeAjustes(lista))).toBe('CD');
  });

  it('desfazer caso que nao tem ajuste nao quebra nem apaga os outros', () => {
    expect(removerAjuste([ajuste()], 'inexistente')).toHaveLength(1);
  });
});

describe('o painel conta com o ajuste aplicado', () => {
  const lista = [div(), div({ entrega: '777', pedido: '260711-1' })];

  it('a quebra por responsavel move o caso de gaveta', () => {
    const mapa = mapaDeAjustes([ajuste()]);
    const semAjuste = porResponsavel(lista);
    const comAjuste = porResponsavel(lista, (d) => responsavelFinal(d, mapa));

    expect(semAjuste.find((r) => r.responsavel === 'CD')!.quantidade).toBe(2);
    expect(comAjuste.find((r) => r.responsavel === 'CD')!.quantidade).toBe(1);
    expect(comAjuste.find((r) => r.responsavel === 'FORNECEDOR')!.quantidade).toBe(1);
  });

  it('o valor acompanha o caso para a nova gaveta', () => {
    const mapa = mapaDeAjustes([ajuste()]);
    const com = porResponsavel(lista, (d) => responsavelFinal(d, mapa));
    expect(com.find((r) => r.responsavel === 'FORNECEDOR')!.valor).toBe(1000);
    expect(com.find((r) => r.responsavel === 'CD')!.valor).toBe(1000);
  });

  it('conta quantos casos em tela foram mexidos a mao', () => {
    /* Ajuste de caso fora do recorte nao entra na conta: o numero
       precisa bater com o que a pessoa esta vendo. */
    const mapa = mapaDeAjustes([ajuste(), ajuste({ caso: 'fora-do-recorte' })]);
    expect(ajustesAplicados(lista, mapa)).toBe(1);
  });
});
