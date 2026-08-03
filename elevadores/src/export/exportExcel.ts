/* ============================================================
   Exportacoes em Excel (secao 12 do brief), geradas no proprio
   navegador com SheetJS. Nenhuma chamada de rede.
   ============================================================ */
import * as XLSX from 'xlsx-js-style';
import type { Componente, Conjunto, Valoracao, Acao } from '../domain/tipos';

function baixar(wb: XLSX.WorkBook, nome: string): void {
  XLSX.writeFile(wb, nome);
}

function carimbo(): string {
  return new Date().toISOString().slice(0, 10);
}

function acaoSugerida(c: Conjunto): string {
  if (c.status === 'CASADO') return 'Equalizado';
  if (c.status === 'SEM ESTOQUE') return 'Sem estoque';
  const partes: string[] = [];
  if (c.comprarColuna > 0) partes.push(`Comprar ${c.comprarColuna} coluna(s)`);
  if (c.comprarBase > 0) partes.push(`Comprar ${c.comprarBase} base(s)`);
  return partes.join(' + ') || 'Validar reversa';
}

/* 1. Base completa: as 18 colunas originais da aba Multiplos, na mesma
   ordem, mais as colunas de analise no final. */
export function baixarBaseCompleta(
  componentes: Componente[],
  conjuntos: Conjunto[],
  valoracoes: Valoracao[]
): void {
  const porChave = new Map(conjuntos.map((c) => [c.chave, c]));
  const porPai = new Map(valoracoes.map((v) => [v.itemVolMultiplo, v]));

  const linhas = componentes.map((c) => {
    const cj = porChave.get(c.chave);
    const val = porPai.get(c.itemVolMultiplo);
    return {
      'Item Vol.Multiplo': c.itemVolMultiplo,
      'Nome Item Vol.Multiplo': c.nomeItemVolMultiplo,
      'Item Componente': c.itemComponente,
      'Nome Item Componente': c.nomeItemComponente,
      Quantidade: c.quantidade,
      'in interface': c.inInterface,
      Peso: c.peso,
      'Linha do Produto': c.linhaProduto,
      Marca: c.marca,
      'Componente BASE/COLUNA': c.componenteBaseColuna,
      'Filtrar ?': c.filtrar,
      CD: c.cd,
      REVERSA: c.reversa,
      DS: c.ds,
      OUTROS: c.outros,
      Chave: c.chave,
      'Tonelada FIXA': c.toneladaFixa,
      Fabricante: c.fabricante,
      // Colunas de analise.
      Ratio: cj?.ratio ?? '',
      'Base CD (conjunto)': cj?.baseCD ?? '',
      'Coluna CD (conjunto)': cj?.colCD ?? '',
      'Colunas necessarias': cj?.colunasNecessarias ?? '',
      Kits: cj?.kits ?? '',
      Deficit: cj?.deficit ?? '',
      Status: cj?.status ?? '',
      'Comprar base': cj?.comprarBase ?? '',
      'Comprar coluna': cj?.comprarColuna ?? '',
      'Acao sugerida': cj ? acaoSugerida(cj) : '',
      'Valoracao (diagnostico)': val?.diagnostico ?? '',
      'Valoracao (correcao)': val?.correcoes.join(' | ') ?? '',
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Base completa');
  baixar(wb, `Base completa equalizacao ${carimbo()}.xlsx`);
}

/* 2. Plano de acao da equalizacao. */
export function baixarPlanoEqualizacao(conjuntos: Conjunto[]): void {
  const linhas = conjuntos.map((c) => ({
    Conjunto: c.chave,
    Marca: c.marca,
    Fabricante: c.fabricante,
    Tonelada: c.toneladaFixa,
    Ratio: `1:${c.ratio}`,
    'Base CD': c.baseCD,
    'Coluna CD': c.colCD,
    'Colunas necessarias': c.colunasNecessarias,
    Kits: c.kits,
    Deficit: c.deficit,
    Reversa: c.reversa,
    DS: c.ds,
    Outros: c.outros,
    Status: c.status,
    'Comprar base': c.comprarBase,
    'Comprar coluna': c.comprarColuna,
    'Acao sugerida': acaoSugerida(c),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Plano equalizacao');
  baixar(wb, `Plano de acao equalizacao ${carimbo()}.xlsx`);
}

/* 3. Correcoes de valoracao para o Bseller. */
export function baixarCorrecoesValoracao(valoracoes: Valoracao[]): void {
  const linhas: Record<string, string>[] = [];
  for (const v of valoracoes) {
    for (const c of v.correcoes) {
      const [alvo, movimento] = c.split(':');
      linhas.push({
        'Item pai': v.itemVolMultiplo,
        Descricao: v.nomeItemVolMultiplo,
        Marca: v.marca,
        Fabricante: v.fabricante,
        Diagnostico: v.diagnostico,
        Alvo: (alvo ?? '').trim(),
        Correcao: (movimento ?? '').trim(),
        Instrucao: c,
      });
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Correcoes Bseller');
  baixar(wb, `Correcoes de valoracao ${carimbo()}.xlsx`);
}

/* 4. Plano de acao do projeto (PMO). */
export function baixarPlanoProjeto(acoes: Acao[]): void {
  const data = (d: Date | null) => (d ? d.toLocaleDateString('pt-BR') : '');
  const linhas = acoes.map((a) => ({
    'N PLAN ACTION': a.numPlanAction,
    Proposta: a.proposta,
    'O que fazer': a.oQueFazer,
    Responsavel: a.responsavel,
    Inicio: data(a.inicio),
    Fim: data(a.fim),
    Reagendamento: data(a.reagendamento),
    'Prazo valido': data(a.prazoValido),
    Situacao: a.situacao,
    Status: a.status,
    'Data conclusao': data(a.dataConclusao),
    Atrasada: a.atrasada ? 'SIM' : 'NAO',
    Reagendada: a.reagendada ? 'SIM' : 'NAO',
    'Concluida sem data': a.concluidaSemData ? 'SIM' : 'NAO',
    Esforco: a.esforco,
    Impacto: a.impacto,
    Obs: a.obs,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Plano do projeto');
  baixar(wb, `Plano de acao projeto ${carimbo()}.xlsx`);
}
