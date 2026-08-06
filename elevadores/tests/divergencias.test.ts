/* ============================================================
   Testes das divergencias do SAC.

   A classificacao de inversao de base e deduzida de texto livre, entao
   e o que mais precisa de teste: e a unica regra do painel que nao vem
   pronta de uma coluna da planilha.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  ehCulpaDoCD,
  causaDe,
  porCausa,
  responsavelDe,
  porResponsavel,
  ehProdutoDeElevador,
  tipoDoProduto,
  inversoesDeBase,
  origemDaFilial,
  totalizar,
  porMes,
  porTransportadora,
  doAno,
  anosDisponiveis,
  variacaoMensal,
} from '../src/domain/divergencias';
import type { DivergenciaSAC } from '../src/domain/divergencias';
import { lerDivergencias, separarProduto } from '../src/parsers/lerDivergencias';

function div(p: Partial<DivergenciaSAC> = {}): DivergenciaSAC {
  const filial = p.filial ?? 'CD_CAJAMAR';
  return {
    pedido: '1', entrega: 'E1', filial, origem: origemDaFilial(filial), itemProduto: '4484433',
    produto: 'BASE PARA ELEVADOR', motivo: 'Diferente do comprado',
    submotivo: 'Divergência operacional CD', comentario: 'Cliente recebeu a base no tamanho incorreto.',
    transportadora: 'TERMACO', estado: 'São Paulo', canal: 'TELEVENDAS',
    valor: 1000, data: new Date(Date.UTC(2026, 4, 4)),
    ...p,
  };
}

describe('origem: CD e um indicador, o resto e loja', () => {
  it('reconhece os CDs pelo prefixo', () => {
    expect(origemDaFilial('CD_CAJAMAR')).toBe('CD');
    expect(origemDaFilial('CD_RECIFE')).toBe('CD');
  });

  it('toda filial que nao e CD conta como loja', () => {
    expect(origemDaFilial('LOJA_OSASCO_1')).toBe('LOJA');
    expect(origemDaFilial('LOJA_RP_2')).toBe('LOJA');
    expect(origemDaFilial('')).toBe('LOJA');
  });
});

describe('classificacao de inversao de base', () => {
  it('arrependimento nunca conta, mesmo falando de base trocada', () => {
    expect(
      ehCulpaDoCD(div({ motivo: 'Arrependimento', comentario: 'base invertida' }))
    ).toBe(false);
  });

  it('"Comprou Errado" e erro do cliente e cai junto com o arrependimento', () => {
    expect(
      ehCulpaDoCD(div({ motivo: 'Arrependimento', submotivo: 'Comprou Errado - Modelo' }))
    ).toBe(false);
  });

  it('pega a divergencia operacional do CD', () => {
    expect(ehCulpaDoCD(div())).toBe(true);
  });

  it('defeito apos uso nao e culpa do CD, mesmo falando da base', () => {
    /* O produto falhou depois de entregue: e problema da marca, nao de
       quem separou. */
    expect(
      ehCulpaDoCD(
        div({ motivo: 'Defeito', submotivo: 'Defeito após uso', comentario: 'a furação da base está errada' })
      )
    ).toBe(false);
  });

  it('avaria e da transportadora, nao do CD', () => {
    expect(
      ehCulpaDoCD(div({ motivo: 'Avaria', submotivo: 'Produto avariado na Transportadora', comentario: 'base trocada' }))
    ).toBe(false);
  });

  it('inversao de etiqueta e erro de separacao', () => {
    expect(
      ehCulpaDoCD(div({ motivo: 'Diferente do comprado', submotivo: 'Inversão de etiqueta', comentario: '-' }))
    ).toBe(true);
  });

  it('base que nao chegou conta como peca faltando', () => {
    expect(
      ehCulpaDoCD(
        div({ produto: 'ELEVADOR AUTO ELETRO HIDRAULICO 2.6 TON', motivo: 'Falta volume/item', submotivo: 'Faltou volume', comentario: 'Cliente recebeu o elevador sem a base.' })
      )
    ).toBe(true);
    expect(
      ehCulpaDoCD(
        div({ produto: 'ELEVADOR AUTO ELETRO HIDRAULICO 2.6 TON', motivo: 'Falta volume/item', submotivo: 'Faltou peça/acessório', comentario: 'faltou a base do elevador' })
      )
    ).toBe(true);
  });

  it('acessorio nao entra, mesmo citando elevador no nome', () => {
    /* "BORRACHA PARA SAPATA U PARA ELEVADOR" cita elevador, mas e
       borracha: nao tem base para inverter. */
    expect(
      ehCulpaDoCD(
        div({ produto: 'BORRACHA PARA SAPATA U PARA ELEVADOR 4000KG', comentario: 'base incorreta' })
      )
    ).toBe(false);
    expect(
      ehCulpaDoCD(div({ produto: 'RAMPA PARA ALINHAMENTO ELETRICA 5000KG', comentario: 'base errada' }))
    ).toBe(false);
    expect(
      ehCulpaDoCD(div({ produto: 'JOGO DE SAPATAS U COM BORRACHA PARA ELEVADOR', comentario: 'base trocada' }))
    ).toBe(false);
  });

  it('avaria e defeito de uso ficam de fora', () => {
    expect(
      ehCulpaDoCD(div({ motivo: 'Avaria', submotivo: 'Produto avariado na Transportadora', comentario: 'Caixa do motor quebrada' }))
    ).toBe(false);
    expect(
      ehCulpaDoCD(div({ motivo: 'Defeito', submotivo: 'Defeito após uso', comentario: 'o braço do elevador não levanta' }))
    ).toBe(false);
  });

  it('acento e caixa nao mudam a classificacao', () => {
    expect(ehCulpaDoCD(div({ comentario: 'BASE INVERTIDA', submotivo: '' }))).toBe(true);
    expect(ehCulpaDoCD(div({ comentario: 'inversão de base', submotivo: '' }))).toBe(true);
  });
});

describe('totais separando CD de loja', () => {
  const lista = [
    div({ valor: 1000 }),
    div({ valor: 500, filial: 'CD_RECIFE' }),
    div({ valor: 300, filial: 'LOJA_OSASCO_1' }),
  ];

  it('CD e lojas nunca sao somados no mesmo numero', () => {
    const t = totalizar(lista);
    expect(t.cd.quantidade).toBe(2);
    expect(t.cd.valor).toBe(1500);
    expect(t.lojas.quantidade).toBe(1);
    expect(t.lojas.valor).toBe(300);
  });

  it('o total confere com a soma dos dois cortes', () => {
    const t = totalizar(lista);
    expect(t.total.quantidade).toBe(t.cd.quantidade + t.lojas.quantidade);
    expect(t.total.valor).toBe(t.cd.valor + t.lojas.valor);
  });

  it('lista vazia nao quebra', () => {
    const t = totalizar([]);
    expect(t.total).toEqual({ quantidade: 0, valor: 0 });
  });
});

describe('corte por mes, pela Data Emissao Pedido', () => {
  const lista = [
    div({ data: new Date(Date.UTC(2026, 0, 15)), valor: 100 }),
    div({ data: new Date(Date.UTC(2026, 0, 20)), valor: 200, filial: 'LOJA_RP_2' }),
    div({ data: new Date(Date.UTC(2026, 5, 1)), valor: 300 }),
    div({ data: new Date(Date.UTC(2025, 5, 1)), valor: 999 }),
  ];

  it('devolve os doze meses, inclusive os vazios', () => {
    const meses = porMes(lista, 2026);
    expect(meses).toHaveLength(12);
    expect(meses[0].rotulo).toBe('jan');
    expect(meses[11].rotulo).toBe('dez');
  });

  it('separa CD e loja dentro do mes', () => {
    const jan = porMes(lista, 2026)[0];
    expect(jan.cd.quantidade).toBe(1);
    expect(jan.lojas.quantidade).toBe(1);
    expect(jan.total.valor).toBe(300);
  });

  it('nao mistura anos', () => {
    expect(doAno(lista, 2026)).toHaveLength(3);
    expect(doAno(lista, 2025)).toHaveLength(1);
    expect(porMes(lista, 2026)[5].total.quantidade).toBe(1);
  });

  it('lista os anos com dado, do mais novo para o mais velho', () => {
    expect(anosDisponiveis(lista)).toEqual([2026, 2025]);
  });

  it('linha sem data nao entra em nenhum mes', () => {
    expect(doAno([...lista, div({ data: null })], 2026)).toHaveLength(3);
  });
});

describe('variacao mes a mes', () => {
  it('mede a diferenca contra o mes anterior', () => {
    const meses = porMes(
      [
        div({ data: new Date(Date.UTC(2026, 0, 5)) }),
        div({ data: new Date(Date.UTC(2026, 0, 6)) }),
        div({ data: new Date(Date.UTC(2026, 1, 5)) }),
        div({ data: new Date(Date.UTC(2026, 1, 6)) }),
        div({ data: new Date(Date.UTC(2026, 1, 7)) }),
      ],
      2026
    );
    expect(variacaoMensal(meses, 1)).toBeCloseTo(50, 5); // 2 -> 3
  });

  it('janeiro nao tem mes anterior', () => {
    expect(variacaoMensal(porMes([], 2026), 0)).toBeNull();
  });

  it('sair de zero nao vira porcentagem infinita', () => {
    const meses = porMes([div({ data: new Date(Date.UTC(2026, 1, 5)) })], 2026);
    expect(variacaoMensal(meses, 1)).toBeNull();
  });
});

describe('indice por transportadora', () => {
  const lista = [
    div({ transportadora: 'TERMACO', valor: 100 }),
    div({ transportadora: 'TERMACO', valor: 200 }),
    div({ transportadora: 'MANDALA', valor: 50 }),
    div({ transportadora: 'RETIRA', valor: 900 }),
    div({ transportadora: 'Não localizado', valor: 900 }),
  ];

  it('ordena pelo volume de ocorrencias', () => {
    const r = porTransportadora(lista);
    expect(r[0].transportadora).toBe('TERMACO');
    expect(r[0].quantidade).toBe(2);
    expect(r[0].valor).toBe(300);
  });

  it('RETIRA e cadastro em branco nao sao transportadora e ficam fora', () => {
    const nomes = porTransportadora(lista).map((r) => r.transportadora);
    expect(nomes).not.toContain('RETIRA');
    expect(nomes).not.toContain('Não localizado');
  });

  it('a participacao soma 100% entre as transportadoras de verdade', () => {
    const soma = porTransportadora(lista).reduce((s, r) => s + r.pct, 0);
    expect(soma).toBeCloseTo(100, 5);
  });

  it('lista vazia devolve ranking vazio', () => {
    expect(porTransportadora([])).toEqual([]);
  });
});

describe('leitura da aba', () => {
  const cabecalho = [
    'Pedido', 'Filial Envio', 'Produto', 'Motivo', 'Submotivo', 'Comentário',
    'Transportadora', 'Estado', 'Valor Devolução', 'Data Emissão Pedido', 'Canal_Agrupado',
  ];

  it('separa o codigo do item da descricao do produto', () => {
    expect(separarProduto('4484433 - BASE PARA ELEVADOR 4000KG')).toEqual({
      item: '4484433', descricao: 'BASE PARA ELEVADOR 4000KG',
    });
    expect(separarProduto('SEM CODIGO')).toEqual({ item: '', descricao: 'SEM CODIGO' });
  });

  it('le a linha e traz o valor positivo, como custo da divergencia', () => {
    const lidas = lerDivergencias([
      cabecalho,
      ['260710-1', 'CD_CAJAMAR', '4484433 - BASE 4T', 'Diferente do comprado',
       'Divergência operacional CD', 'base no tamanho incorreto', 'TERMACO', 'SP',
       -15866.58, new Date(Date.UTC(2026, 4, 4)), 'TELEVENDAS'],
    ]);
    expect(lidas).toHaveLength(1);
    expect(lidas[0].valor).toBeCloseTo(15866.58, 2);
    expect(lidas[0].origem).toBe('CD');
    expect(lidas[0].itemProduto).toBe('4484433');
    expect(lidas[0].data?.toISOString().slice(0, 10)).toBe('2026-05-04');
    expect(inversoesDeBase(lidas)).toHaveLength(1);
  });

  it('linha em branco da tabela nao vira registro', () => {
    expect(lerDivergencias([cabecalho, [null, null, null, null, null, null, null, null, null, null, null]])).toHaveLength(0);
  });

  it('aba ausente devolve lista vazia, sem quebrar a importacao', () => {
    expect(lerDivergencias([])).toEqual([]);
  });
});

describe('tipo do produto: o que entra no painel', () => {
  it('classifica pelo inicio da descricao, que e onde vem o tipo', () => {
    expect(tipoDoProduto('ELEVADOR AUTOMOTIVO MECANICO 2500KG')).toBe('ELEVADOR');
    expect(tipoDoProduto('BASE PARA ELEVADOR AUTOMOTIVO 4000KG')).toBe('BASE');
    expect(tipoDoProduto('COLUNAS_ELEV HIDRAULICO 4T')).toBe('COLUNA');
  });

  it('acessorio que cita elevador no meio do nome nao vira elevador', () => {
    expect(tipoDoProduto('BORRACHA PARA SAPATA U PARA ELEVADOR 4000KG')).toBe('OUTRO');
    expect(tipoDoProduto('JOGO DE SAPATAS U COM BORRACHA PARA ELEVADOR')).toBe('OUTRO');
    expect(tipoDoProduto('RAMPA PARA ALINHAMENTO ELETRICA 5000KG')).toBe('OUTRO');
    expect(tipoDoProduto('RAMPA PNEUM P/ALINHAMENTO VERMELHA 4T')).toBe('OUTRO');
  });

  it('acento e caixa nao mudam o tipo', () => {
    expect(tipoDoProduto('elevador automotivo')).toBe('ELEVADOR');
    expect(tipoDoProduto('  BASE para elevador ')).toBe('BASE');
  });

  it('descricao vazia cai em OUTRO e fica de fora', () => {
    expect(tipoDoProduto('')).toBe('OUTRO');
    expect(ehProdutoDeElevador(div({ produto: '' }))).toBe(false);
  });
});

describe('causa do erro do CD', () => {
  it('item trocado e inversao', () => {
    expect(causaDe(div({ comentario: 'base no tamanho incorreto' }))).toBe('INVERSAO');
    expect(causaDe(div({ submotivo: 'Inversão de etiqueta', comentario: '-' }))).toBe('INVERSAO');
  });

  it('item que nao foi junto e peca faltando', () => {
    expect(
      causaDe(div({ produto: 'ELEVADOR AUTO', motivo: 'Falta volume/item', submotivo: 'Faltou volume', comentario: 'sem a base' }))
    ).toBe('FALTA');
  });

  it('caso de terceiro nao tem causa do CD', () => {
    expect(causaDe(div({ motivo: 'Defeito', submotivo: 'Defeito após uso' }))).toBeNull();
    expect(causaDe(div({ motivo: 'Arrependimento', submotivo: 'Desistiu da compra' }))).toBeNull();
  });

  it('a quebra por causa cobre os dois tipos e soma o total', () => {
    const lista = [
      div({ valor: 100 }),
      div({ valor: 200 }),
      div({ produto: 'ELEVADOR AUTO', motivo: 'Falta volume/item', submotivo: 'Faltou volume', comentario: 'sem a base', valor: 50 }),
    ];
    const c = porCausa(lista);
    expect(c.map((x) => x.causa)).toEqual(['INVERSAO', 'FALTA']);
    expect(c[0].quantidade).toBe(2);
    expect(c[0].valor).toBe(300);
    expect(c[1].quantidade).toBe(1);
    expect(c[1].valor).toBe(50);
    expect(c[0].quantidade + c[1].quantidade).toBe(lista.length);
  });
});

describe('de quem foi a divergencia', () => {
  it('"Divergencia operacional CD" e o SAC dizendo que apurou e foi o CD', () => {
    expect(responsavelDe(div({ submotivo: 'Divergência operacional CD' }))).toBe('CD');
  });

  it('o apurado do SAC vence palavra solta no comentario', () => {
    /* O comentario cita fabricante, mas o submotivo diz que a apuracao
       fechou como operacional. O apurado manda. */
    expect(
      responsavelDe(div({ submotivo: 'Divergência operacional CD', comentario: 'cliente falou com o fabricante' }))
    ).toBe('CD');
  });

  it('produto que saiu errado de fabrica e do fornecedor', () => {
    expect(
      responsavelDe(div({ submotivo: 'Divergência do fabricante', comentario: 'recebeu com lubrificação a graxa' }))
    ).toBe('FORNECEDOR');
    expect(responsavelDe(div({ submotivo: '', comentario: 'peça veio de fábrica trocada' }))).toBe('FORNECEDOR');
    expect(responsavelDe(div({ submotivo: 'Divergência de anuncio', comentario: 'anúncio errado' }))).toBe('FORNECEDOR');
  });

  it('pedido montado errado do lado do cliente e do cliente', () => {
    expect(responsavelDe(div({ submotivo: 'Comprou Errado - Modelo', comentario: 'x' }))).toBe('CLIENTE');
    expect(responsavelDe(div({ submotivo: '', comentario: 'entregue no endereço errado' }))).toBe('CLIENTE');
    expect(responsavelDe(div({ submotivo: '', comentario: 'cliente desistiu' }))).toBe('CLIENTE');
  });

  it('comentario sem apuracao vai para "a apurar", nao sobra para o CD', () => {
    /* Culpar por omissao infla o indicador e queima a confianca de
       quem e cobrado por ele. */
    expect(responsavelDe(div({ submotivo: 'Faltou volume', comentario: '-' }))).toBe('APURAR');
    expect(responsavelDe(div({ submotivo: 'Faltou volume', comentario: '' }))).toBe('APURAR');
    expect(responsavelDe(div({ submotivo: 'Faltou volume', comentario: '  --  ' }))).toBe('APURAR');
  });

  it('comentario que descreve o erro sem apontar terceiro fica no CD', () => {
    expect(
      responsavelDe(div({ submotivo: 'Faltou volume', comentario: 'Cliente recebeu o elevador sem a base.' }))
    ).toBe('CD');
  });

  it('acento e caixa nao mudam o responsavel', () => {
    expect(responsavelDe(div({ submotivo: '', comentario: 'DIVERGÊNCIA DO FABRICANTE' }))).toBe('FORNECEDOR');
  });

  it('a quebra traz os quatro, inclusive zerados, e fecha 100%', () => {
    const lista = [
      div({ submotivo: 'Divergência operacional CD', valor: 100 }),
      div({ submotivo: 'Divergência operacional CD', valor: 200 }),
      div({ submotivo: 'Divergência do fabricante', comentario: 'veio de fábrica', valor: 50 }),
      div({ submotivo: 'Faltou volume', comentario: '-', valor: 30 }),
    ];
    const r = porResponsavel(lista);
    expect(r.map((x) => x.responsavel)).toEqual(['CD', 'FORNECEDOR', 'CLIENTE', 'APURAR']);
    expect(r[0].quantidade).toBe(2);
    expect(r[0].valor).toBe(300);
    expect(r[1].quantidade).toBe(1);
    expect(r[2].quantidade).toBe(0); // zerado aparece mesmo assim
    expect(r[3].quantidade).toBe(1);
    expect(r.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 5);
    expect(r.reduce((s, x) => s + x.quantidade, 0)).toBe(lista.length);
  });

  it('lista vazia nao divide por zero', () => {
    expect(porResponsavel([]).every((r) => r.quantidade === 0 && r.pct === 0)).toBe(true);
  });
});
