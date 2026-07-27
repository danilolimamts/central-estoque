/* ============================================================
   Utilitarios de parsing (secao 6 e 8 do brief).
   Conversao de data em tres formatos, leitura numerica tolerante
   e montagem de objetos a partir de uma aba, com a protecao contra
   colunas de cabecalho duplicadas (regressao 8.1).
   ============================================================ */

/* 8.3 Datas do Excel chegam em tres formatos: numero serial, objeto
   Date ou string dd/mm/aaaa. O serial usa base Date.UTC(1899, 11, 30). */
export function converterData(v: unknown): Date | null {
  if (v == null || v === '') return null;

  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v;
  }

  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    const base = Date.UTC(1899, 11, 30);
    const d = new Date(base + Math.round(v) * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/aaaa ou dd/mm/aa (aceita - e . como separador).
  const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(s);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let ano = Number(m[3]);
    if (ano < 100) ano += ano < 70 ? 2000 : 1900;
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
    return d;
  }

  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

/* Leitura numerica tolerante a formatacao pt-BR (1.234,56). */
export function paraNumero(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/[\u0300-\u036f]/g, '');
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (temVirgula) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

export function paraTexto(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

/* Normaliza um nome de cabecalho para casar variacoes de acento,
   espaco e maiusculas/minusculas. */
export function normalizarCabecalho(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface Tabela {
  colunas: string[];
  linhas: Record<string, unknown>[];
}

/* 8.1 Monta objetos a partir de uma matriz (array de arrays) da aba.
   Le o cabecalho na linha indicada e para no primeiro intervalo de
   duas colunas vazias consecutivas, descartando tabelas dinamicas que
   o usuario mantem ao lado. Em caso de nome repetido, mantem o primeiro
   (evita que a segunda coluna "Marca" sobrescreva a real). */
export function montarObjetos(aoa: unknown[][], indiceCabecalho: number): Tabela {
  const cabecalho = aoa[indiceCabecalho] ?? [];
  const colunas: { idx: number; nome: string }[] = [];
  const vistos = new Set<string>();
  let vazias = 0;

  for (let i = 0; i < cabecalho.length; i++) {
    const bruto = cabecalho[i];
    const nome = bruto == null ? '' : String(bruto).trim();
    if (nome === '') {
      vazias++;
      if (vazias >= 2) break; // fim do intervalo util da tabela
      continue;
    }
    vazias = 0;
    const chave = normalizarCabecalho(nome);
    if (vistos.has(chave)) continue; // mantem o primeiro
    vistos.add(chave);
    colunas.push({ idx: i, nome });
  }

  const linhas: Record<string, unknown>[] = [];
  for (let r = indiceCabecalho + 1; r < aoa.length; r++) {
    const linha = aoa[r];
    if (!linha) continue;
    const obj: Record<string, unknown> = {};
    let algum = false;
    for (const { idx, nome } of colunas) {
      const valor = linha[idx] ?? null;
      obj[nome] = valor;
      if (valor !== null && valor !== '') algum = true;
    }
    if (algum) linhas.push(obj);
  }

  return { colunas: colunas.map((c) => c.nome), linhas };
}

/* Acesso tolerante a uma coluna do objeto por qualquer um dos aliases,
   comparando pelos cabecalhos normalizados. */
export function criarSeletor(obj: Record<string, unknown>) {
  const mapa = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    mapa.set(normalizarCabecalho(k), v);
  }
  return (...aliases: string[]): unknown => {
    for (const a of aliases) {
      const chave = normalizarCabecalho(a);
      if (mapa.has(chave)) return mapa.get(chave);
    }
    return null;
  };
}
