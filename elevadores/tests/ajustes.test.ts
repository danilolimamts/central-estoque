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
  reclassificadosEmTela,
  casosConsiderados,
  casosDesconsiderados,
  foiDesconsiderado,
  migrarAjustes,
  forasDaPlanilha,
  origemDaExclusao,
  FORA,
} from '../src/domain/ajustes';
import type { AjusteCaso } from '../src/domain/ajustes';
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
    valor: 1000, data: new Date(Date.UTC(2026, 4, 4)), dataPelaSaida: true, considerar: true,
    ...p,
  };
}

function ajuste(p: Partial<AjusteCaso> = {}): AjusteCaso {
  return {
    caso: '123930639', decisao: 'FORNECEDOR',
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
    const dois = registrarAjuste(um, ajuste({ decisao: 'CLIENTE', motivo: 'cliente pediu errado' }));
    expect(dois).toHaveLength(1);
    expect(dois[0].decisao).toBe('CLIENTE');
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
    expect(reclassificadosEmTela(lista, mapa)).toBe(1);
  });
});

describe('desconsiderar: o caso sai do painel inteiro', () => {
  const lista = [div(), div({ entrega: '777', pedido: '260711-1', valor: 500 })];
  const mapa = mapaDeAjustes([ajuste({ decisao: FORA, motivo: 'não foi culpa do CD' })]);

  it('some da lista que o painel conta', () => {
    const contados = casosConsiderados(lista, mapa);
    expect(contados).toHaveLength(1);
    expect(contados[0].entrega).toBe('777');
  });

  it('nao entra em nenhuma gaveta de responsavel', () => {
    /* Desconsiderar e diferente de trocar de dono: o caso nao pode
       reaparecer no fornecedor nem em "a apurar". */
    const quebra = porResponsavel(
      casosConsiderados(lista, mapa),
      (d) => responsavelFinal(d, mapa)
    );
    expect(quebra.reduce((s, r) => s + r.quantidade, 0)).toBe(1);
  });

  it('fica listado a parte, para a decisao poder ser conferida', () => {
    const fora = casosDesconsiderados(lista, mapa);
    expect(fora).toHaveLength(1);
    expect(fora[0].entrega).toBe('123930639');
    expect(ajusteDe(fora[0], mapa)?.motivo).toBe('não foi culpa do CD');
  });

  it('nao conta como reclassificado: sao decisoes diferentes', () => {
    /* Somar os dois esconderia a diferenca entre "mudou de dono" e
       "saiu do painel". */
    expect(reclassificadosEmTela(lista, mapa)).toBe(0);
    expect(foiDesconsiderado(lista[0], mapa)).toBe(true);
    expect(foiDesconsiderado(lista[1], mapa)).toBe(false);
  });

  it('desfazer devolve o caso para a conta', () => {
    const semAjuste = mapaDeAjustes(removerAjuste([ajuste({ decisao: FORA })], '123930639'));
    expect(casosConsiderados(lista, semAjuste)).toHaveLength(2);
    expect(casosDesconsiderados(lista, semAjuste)).toHaveLength(0);
  });
});

describe('ajuste gravado no formato antigo continua valendo', () => {
  it('o campo responsavel vira decisao', () => {
    /* A primeira versao so sabia trocar o responsavel. Perder a
       decisao ja tomada por causa de uma troca de campo seria
       apagar trabalho de quem apurou. */
    const migrados = migrarAjustes([
      { caso: '123930639', responsavel: 'FORNECEDOR', motivo: 'veio errado', em: '2026-08-18T20:00:00.000Z' },
    ]);
    expect(migrados).toHaveLength(1);
    expect(migrados[0].decisao).toBe('FORNECEDOR');
    expect(responsavelFinal(div(), mapaDeAjustes(migrados))).toBe('FORNECEDOR');
  });

  it('lixo gravado nao vira ajuste nem quebra a leitura', () => {
    expect(migrarAjustes(null)).toEqual([]);
    expect(migrarAjustes([{ caso: '' }, { motivo: 'sem caso' }, 7])).toEqual([]);
  });
});

describe('coluna "Considerar ?" da planilha', () => {
  it('so um Nao explicito tira o caso: vazio conta como Sim', () => {
    /* A coluna e preenchida a mao e vai ter lacuna. Sumir com
       devolucao por celula em branco seria apagar o indicador em
       silencio, sem ninguem perceber. */
    const lista = [
      div({ entrega: 'A', considerar: true }),
      div({ entrega: 'B', considerar: false }),
      div({ entrega: 'C', considerar: true }),
    ];
    const fora = forasDaPlanilha(lista);
    expect([...fora]).toEqual(['B']);
    expect(casosConsiderados(lista, mapaDeAjustes([]), fora).map((d) => d.entrega))
      .toEqual(['A', 'C']);
  });

  it('um Nao tira a entrega inteira, com os dois produtos', () => {
    /* A coluna marca um despacho; despacho com dois produtos gera
       duas linhas. Tirar so uma deixaria o total sem fechar com a
       planilha, sem ninguem saber por que. */
    const lista = [
      div({ entrega: '999', produto: 'BASE PARA ELEVADOR', considerar: false }),
      div({ entrega: '999', produto: 'COLUNA PARA ELEVADOR', considerar: true }),
      div({ entrega: '111', considerar: true }),
    ];
    const fora = forasDaPlanilha(lista);
    expect(casosConsiderados(lista, mapaDeAjustes([]), fora)).toHaveLength(1);
    expect(casosDesconsiderados(lista, mapaDeAjustes([]), fora)).toHaveLength(2);
  });

  it('sem entrega, a marcacao vale pelo pedido', () => {
    const lista = [div({ entrega: '', pedido: 'PED-1', considerar: false })];
    expect([...forasDaPlanilha(lista)]).toEqual(['PED-1']);
  });

  it('a planilha e o ajuste do painel somam, nao competem', () => {
    const lista = [
      div({ entrega: 'A', considerar: false }),
      div({ entrega: 'B', considerar: true }),
      div({ entrega: 'C', considerar: true }),
    ];
    const mapa = mapaDeAjustes([ajuste({ caso: 'B', decisao: FORA })]);
    const fora = forasDaPlanilha(lista);
    expect(casosConsiderados(lista, mapa, fora).map((d) => d.entrega)).toEqual(['C']);
  });

  it('a tela sabe dizer de onde veio a exclusao', () => {
    /* As duas se corrigem em lugares diferentes: uma na planilha,
       outra no proprio painel. */
    const lista = [div({ entrega: 'A', considerar: false }), div({ entrega: 'B' })];
    const mapa = mapaDeAjustes([ajuste({ caso: 'B', decisao: FORA })]);
    const fora = forasDaPlanilha(lista);
    expect(origemDaExclusao(lista[0], mapa, fora)).toBe('PLANILHA');
    expect(origemDaExclusao(lista[1], mapa, fora)).toBe('AJUSTE');
    expect(origemDaExclusao(div({ entrega: 'Z' }), mapa, fora)).toBeNull();
  });

  it('a planilha manda quando as duas discordam', () => {
    /* Marcado como Nao na planilha e reclassificado no painel: a
       planilha e o registro compartilhado, entao ela vence e a tela
       diz para corrigir la. */
    const lista = [div({ entrega: 'A', considerar: false })];
    const mapa = mapaDeAjustes([ajuste({ caso: 'A', decisao: 'CD' })]);
    const fora = forasDaPlanilha(lista);
    expect(origemDaExclusao(lista[0], mapa, fora)).toBe('PLANILHA');
    expect(casosConsiderados(lista, mapa, fora)).toHaveLength(0);
  });
});
