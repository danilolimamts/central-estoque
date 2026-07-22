/* ============================================================
   Testes dos parsers e das regressoes da secao 8 do brief.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  converterData,
  paraNumero,
  montarObjetos,
  criarSeletor,
  normalizarCabecalho,
} from '../src/parsers/utilData';
import { lerMultiplos } from '../src/parsers/lerMultiplos';
import { lerArquivo } from '../src/parsers/planilha';
import { agruparConjuntos, tipoComponente } from '../src/domain/equalizacao';
import { gerarBufferXlsx, LINHAS_MULTIPLOS } from './helpers/planilhaSintetica';

describe('8.3 conversao de data em tres formatos', () => {
  const alvo = new Date(Date.UTC(2026, 4, 26)); // 26/05/2026

  it('serial do Excel usa base Date.UTC(1899,11,30)', () => {
    const serial = (alvo.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
    const d = converterData(serial);
    expect(d?.getTime()).toBe(alvo.getTime());
  });

  it('objeto Date passa direto', () => {
    expect(converterData(alvo)?.getTime()).toBe(alvo.getTime());
  });

  it('string dd/mm/aaaa', () => {
    expect(converterData('26/05/2026')?.getTime()).toBe(alvo.getTime());
  });

  it('string dd/mm/aa expande o ano', () => {
    expect(converterData('26/05/26')?.getTime()).toBe(alvo.getTime());
  });

  it('vazio vira null', () => {
    expect(converterData('')).toBeNull();
    expect(converterData(null)).toBeNull();
    expect(converterData('nao e data')).toBeNull();
  });
});

describe('leitura numerica tolerante a pt-BR', () => {
  it('interpreta 1.234,56 como 1234.56', () => {
    expect(paraNumero('1.234,56')).toBeCloseTo(1234.56);
  });
  it('numero passa direto e vazio vira zero', () => {
    expect(paraNumero(42)).toBe(42);
    expect(paraNumero('')).toBe(0);
    expect(paraNumero(null)).toBe(0);
  });
});

describe('8.1 coluna Marca duplicada', () => {
  it('para no intervalo de duas colunas vazias e mantem a primeira Marca', () => {
    const cab = ['A', 'Marca', null, null, 'Marca', 'Contagem'];
    const aoa = [cab, ['x', 'CERTO', null, null, 'ERRADO', 1]];
    const { colunas, linhas } = montarObjetos(aoa, 0);
    // A pivot 'Marca' e 'Contagem' ficam de fora.
    expect(colunas).toEqual(['A', 'Marca']);
    const s = criarSeletor(linhas[0]);
    expect(s('Marca')).toBe('CERTO');
  });

  it('nome repetido sem intervalo tambem mantem o primeiro', () => {
    const aoa = [['Marca', 'Marca'], ['CERTO', 'ERRADO']];
    const { linhas } = montarObjetos(aoa, 0);
    expect(criarSeletor(linhas[0])('Marca')).toBe('CERTO');
  });
});

describe('lerMultiplos (aba Multiplos -> Componente[])', () => {
  it('mapeia os componentes ignorando a Marca da tabela dinamica', () => {
    // Reconstroi a AOA como a aba real: 2 linhas de titulo + cabecalho + dados.
    const cab = [
      'Item Vol.Multiplo', 'Nome Item Vol.Multiplo', 'Item Componente', 'Nome Item Componente',
      'Quantidade', 'in interface', 'Peso', 'Linha do Produto', 'Marca', 'Componente BASE/COLUNA',
      'Filtrar ?', 'CD', 'REVERSA', 'DS', 'OUTROS', 'Chave', 'Tonelada FIXA', 'Fabricante',
      null, null, 'Marca', 'Contagem',
    ];
    const aoa: unknown[][] = [
      ['titulo', null], [null, null], cab,
      ...LINHAS_MULTIPLOS.map((l) => [
        l.pai, l.nomePai, l.comp, l.nomeComp, l.qtd, l.inInterface, l.peso, l.linha,
        l.marca, l.tipo, l.filtrar, l.cd, l.reversa, l.ds, l.outros, l.chave, l.ton,
        l.fabricante, null, null, l.marcaPivot, 1,
      ]),
    ];
    const comps = lerMultiplos(aoa);
    expect(comps).toHaveLength(5);
    // Nenhum componente pode carregar a marca ERRADA da tabela dinamica.
    expect(comps.every((c) => c.marca === 'FORTG' || c.marca === 'KREBS')).toBe(true);
    expect(comps.find((c) => c.itemComponente === 'C1')?.inInterface).toBe('S');
  });
});

describe('8.2 filtro estrito de BASE e COLUNA', () => {
  it('BOMBA, COMANDO e MOTOR contam como OUTRO', () => {
    expect(tipoComponente({ componenteBaseColuna: 'BOMBA' } as never)).toBe('OUTRO');
    expect(tipoComponente({ componenteBaseColuna: 'COMANDO' } as never)).toBe('OUTRO');
    expect(tipoComponente({ componenteBaseColuna: 'MOTOR' } as never)).toBe('OUTRO');
    expect(tipoComponente({ componenteBaseColuna: ' base ' } as never)).toBe('BASE');
    expect(tipoComponente({ componenteBaseColuna: 'Coluna' } as never)).toBe('COLUNA');
  });
});

describe('normalizarCabecalho', () => {
  it('ignora acento, caixa e pontuacao', () => {
    expect(normalizarCabecalho('SITUAÇÃO')).toBe(normalizarCabecalho('Situacao'));
    expect(normalizarCabecalho('Componente BASE/COLUNA')).toBe('componente base coluna');
  });
});

describe('lerArquivo (pipeline completo com xlsx real em memoria)', () => {
  it('le apenas Multiplos e Projeto e agrupa por Chave', () => {
    const buf = gerarBufferXlsx();
    const { componentes, acoes } = lerArquivo(buf);

    expect(componentes).toHaveLength(5);
    expect(componentes.every((c) => c.marca !== 'ERRADO')).toBe(true);
    expect(acoes).toHaveLength(4);

    const conjuntos = agruparConjuntos(componentes);
    expect(conjuntos).toHaveLength(2);

    const fortg = conjuntos.find((c) => c.chave === 'FORTG JM 4 t')!;
    // A BOMBA (cd 99) nao pode entrar no colCD.
    expect(fortg.baseCD).toBe(5);
    expect(fortg.colCD).toBe(8);
    expect(fortg.ratio).toBe(2);
    expect(fortg.deficit).toBe(2); // 5*2 - 8
    expect(fortg.comprarColuna).toBe(2);
    expect(fortg.status).toBe('DESCASADO');

    const krebs = conjuntos.find((c) => c.chave === 'KREBS 2 t')!;
    expect(krebs.ratio).toBe(1);
    expect(krebs.status).toBe('CASADO');
  });
});
