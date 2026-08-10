/* ============================================================
   Valoracao do campo "in interface" (secao 7.4 do brief).
   Regra: dentro do kit quem carrega o valor e a COLUNA. O S deve
   estar na coluna e a base deve ficar em N. A auditoria e por
   elevador (item pai), gerando a instrucao pronta para o Bseller.
   ============================================================ */
import type { Componente, Valoracao, DiagnosticoValoracao } from './tipos';
import { tipoComponente } from './equalizacao';
import { VALORACAO_S, VALORACAO_N } from '../config/regras';

function temS(c: Componente): boolean {
  return String(c.inInterface ?? '').trim().toUpperCase() === VALORACAO_S;
}

export function valorarElevador(itemPai: string, componentes: Componente[]): Valoracao {
  const bases = componentes.filter((c) => tipoComponente(c) === 'BASE');
  const colunas = componentes.filter((c) => tipoComponente(c) === 'COLUNA');

  const baseComS = bases.some(temS);
  const colunaComS = colunas.some(temS);

  let diagnostico: DiagnosticoValoracao;
  if (baseComS && colunaComS) diagnostico = 'DUPLICADO';
  else if (colunaComS && !baseComS) diagnostico = 'OK';
  else if (baseComS && !colunaComS) diagnostico = 'CORRIGIR';
  else diagnostico = 'SEM S';

  const correcoes: string[] = [];
  if (diagnostico === 'CORRIGIR') {
    // O S esta na base (errado) e falta na coluna. Instrucao para o Bseller.
    for (const b of bases.filter(temS)) {
      correcoes.push(`BASE ${b.itemComponente}: ${VALORACAO_S} -> ${VALORACAO_N}`);
    }
    for (const col of colunas) {
      correcoes.push(`COLUNA ${col.itemComponente}: ${VALORACAO_N} -> ${VALORACAO_S}`);
    }
  } else if (diagnostico === 'DUPLICADO') {
    // Sobra S na base: remover da base, manter na coluna.
    for (const b of bases.filter(temS)) {
      correcoes.push(`BASE ${b.itemComponente}: ${VALORACAO_S} -> ${VALORACAO_N}`);
    }
  }

  const ref = componentes[0];
  return {
    itemVolMultiplo: itemPai,
    nomeItemVolMultiplo: ref?.nomeItemVolMultiplo ?? '',
    marca: ref?.marca ?? '',
    fabricante: ref?.fabricante ?? '',
    diagnostico,
    itensBase: bases.map((b) => b.itemComponente),
    itensColuna: colunas.map((c) => c.itemComponente),
    correcoes,
  };
}

export function auditarValoracao(componentes: Componente[]): Valoracao[] {
  const grupos = new Map<string, Componente[]>();
  for (const c of componentes) {
    const pai = String(c.itemVolMultiplo ?? '').trim();
    if (!pai) continue;
    const lista = grupos.get(pai);
    if (lista) lista.push(c);
    else grupos.set(pai, [c]);
  }
  const out: Valoracao[] = [];
  for (const [pai, lista] of grupos) {
    out.push(valorarElevador(pai, lista));
  }
  return out;
}

export interface ResumoValoracao {
  total: number;
  ok: number;
  corrigir: number;
  duplicado: number;
  semS: number;
  /* Modelos que ainda nao valoram na coluna, de qualquer jeito: o S
     esta na base, esta nos dois lados ou nao esta em lugar nenhum. E o
     numero que mede o tamanho do trabalho que falta. */
  faltaAjuste: number;
  /* Recorte de dentro do que falta: modelos com o S preso na base.
     Sao os que exigem tirar de um lado e por no outro - diferente de
     quem so nao tem S, que e um cadastro incompleto. */
  comSNaBase: number;
  /* Quanto do catalogo ja esta valorado na coluna, em porcentagem. */
  pctAjustado: number;
  pctFalta: number;
  /* Concentracao de problemas por marca (secao 9). */
  porMarca: { marca: string; corrigir: number }[];
}

export function resumirValoracao(valoracoes: Valoracao[]): ResumoValoracao {
  let ok = 0;
  let corrigir = 0;
  let duplicado = 0;
  let semS = 0;
  const porMarca = new Map<string, number>();
  for (const v of valoracoes) {
    if (v.diagnostico === 'OK') ok++;
    else if (v.diagnostico === 'CORRIGIR') {
      corrigir++;
      porMarca.set(v.marca, (porMarca.get(v.marca) ?? 0) + 1);
    } else if (v.diagnostico === 'DUPLICADO') duplicado++;
    else semS++;
  }
  const total = valoracoes.length;
  const faltaAjuste = total - ok;
  return {
    total,
    ok,
    corrigir,
    duplicado,
    semS,
    faltaAjuste,
    comSNaBase: corrigir + duplicado,
    /* Sem modelo nenhum nao ha porcentagem: 0 de 0 nao e 0% nem 100%. */
    pctAjustado: total > 0 ? (ok / total) * 100 : 0,
    pctFalta: total > 0 ? (faltaAjuste / total) * 100 : 0,
    porMarca: [...porMarca.entries()]
      .map(([marca, c]) => ({ marca, corrigir: c }))
      .sort((a, b) => b.corrigir - a.corrigir),
  };
}
