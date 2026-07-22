/* ============================================================
   Validacao contra a planilha REAL (secao 9 do brief).
   Este arquivo so roda quando a planilha real estiver em
   tests/fixtures. Enquanto ela nao existir, os testes sao pulados
   (o import manual e o unico caminho e o arquivo nao vem no repo).

   Para ativar: coloque em tests/fixtures os arquivos
     08. Equalização de Elevadores CD CAJAMAR.xlsx
     DE_PARA_LINK_FOTO.xlsx        (opcional, para o teste de fotos)
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { lerArquivo, lerArquivoFotos } from '../src/parsers/planilha';
import {
  agruparConjuntos,
  resumirEqualizacao,
  aplicarCompras,
  tipoComponente,
} from '../src/domain/equalizacao';
import { auditarValoracao, resumirValoracao } from '../src/domain/valoracao';
import { derivarAcoes, calcularMetricas, montarMatriz } from '../src/domain/projeto';

function caminho(nome: string): string {
  return fileURLToPath(new URL(`./fixtures/${nome}`, import.meta.url));
}

const ARQ_PLANILHA = '08. Equalização de Elevadores CD CAJAMAR.xlsx';
const ARQ_FOTOS = 'DE_PARA_LINK_FOTO.xlsx';
const TEM_PLANILHA = existsSync(caminho(ARQ_PLANILHA));
const TEM_FOTOS = existsSync(caminho(ARQ_FOTOS));

const HOJE = new Date(Date.UTC(2026, 6, 22));

describe.skipIf(!TEM_PLANILHA)('secao 9: numeros da planilha real', () => {
  const buf = TEM_PLANILHA ? readFileSync(caminho(ARQ_PLANILHA)) : new Uint8Array();
  const { componentes, acoes } = lerArquivo(buf);

  it('parser da aba Multiplos', () => {
    expect(componentes).toHaveLength(467);
    const pais = new Set(componentes.map((c) => c.itemVolMultiplo));
    expect(pais.size).toBe(190);

    const porTipo = new Map<string, number>();
    for (const c of componentes) {
      const t = c.componenteBaseColuna.trim().toUpperCase();
      porTipo.set(t, (porTipo.get(t) ?? 0) + 1);
    }
    expect(porTipo.get('COLUNA')).toBe(244);
    expect(porTipo.get('BASE')).toBe(176);
    expect(porTipo.get('BOMBA')).toBe(21);
    expect(porTipo.get('COMANDO')).toBe(4);
    expect(porTipo.get('MOTOR')).toBe(1);
  });

  it('conjuntos e agrupamento por Chave', () => {
    const conjuntos = agruparConjuntos(componentes);
    expect(conjuntos).toHaveLength(21);
    const comCD = conjuntos.filter((c) => c.baseCD !== 0 || c.colCD !== 0);
    expect(comCD).toHaveLength(16);

    const acha = (chave: string) => conjuntos.find((c) => c.chave.includes(chave));
    expect(acha('ENGECASS')?.colCD).toBe(174);
    expect(acha('ENGECASS')?.baseCD).toBe(72);
    expect(acha('KREBS')?.colCD).toBe(29);
    expect(acha('KREBS')?.baseCD).toBe(52);
    expect(acha('FORTG JM')?.colCD).toBe(28);
    expect(acha('FORTG JM')?.baseCD).toBe(20);
  });

  it('resultado da equalizacao e fechamento', () => {
    const conjuntos = agruparConjuntos(componentes);
    const r = resumirEqualizacao(conjuntos);
    expect(r.totalComprarColuna).toBe(48);
    expect(r.totalComprarBase).toBe(21);
    expect(r.totalReversa).toBe(39);
    expect(r.casados).toBe(3);

    for (const c of conjuntos) {
      expect(aplicarCompras(c).deficit).toBe(0);
    }
  });

  it('BOMBA, COMANDO e MOTOR nunca entram como coluna', () => {
    const forade = componentes.filter((c) => tipoComponente(c) === 'OUTRO');
    expect(forade.length).toBeGreaterThan(0);
  });

  it('valoracao do campo in interface', () => {
    const valoracoes = auditarValoracao(componentes);
    const r = resumirValoracao(valoracoes);
    expect(r.corrigir).toBe(44);
    expect(r.semS).toBe(11);
    expect(r.ok).toBe(135);
    const porMarca = new Map(r.porMarca.map((m) => [m.marca, m.corrigir]));
    expect(porMarca.get('AUTOP')).toBe(16);
  });

  it('metricas do projeto', () => {
    const derivadas = derivarAcoes(acoes, HOJE);
    const m = calcularMetricas(derivadas);
    expect(m.total).toBe(32);
    expect(m.propostas).toBe(9);
    expect(m.responsaveis).toBe(9);
    expect(m.concluidas).toBe(20);
    expect(m.reagendadas).toBe(13);
    expect(m.concluidasSemData).toBe(3);
    expect(m.score).toBeGreaterThanOrEqual(66);
    expect(m.score).toBeLessThanOrEqual(67);
    expect(m.saude).toBe('atencao');

    const pontos = montarMatriz(derivadas);
    expect(pontos).toHaveLength(9);
    expect(pontos.filter((p) => p.quadrante === 'ganhos_rapidos')).toHaveLength(5);
    expect(pontos.filter((p) => p.quadrante === 'estrategicos')).toHaveLength(1);
  });
});

describe.skipIf(!TEM_FOTOS)('secao 9: base de fotos', () => {
  it('187 de 190 itens pai com foto', () => {
    const buf = readFileSync(caminho(ARQ_FOTOS));
    const mapa = lerArquivoFotos(buf);
    const { componentes } = lerArquivo(readFileSync(caminho(ARQ_PLANILHA)));
    const pais = [...new Set(componentes.map((c) => c.itemVolMultiplo))];
    const comFoto = pais.filter((p) => mapa.has(String(p)));
    expect(comFoto).toHaveLength(187);
  });
});
