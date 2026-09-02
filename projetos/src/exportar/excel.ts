import * as XLSX from 'xlsx-js-style';
import { formatarData, rotuloSaude, saude } from '@/dominio/regras';
import type { Atualizacao, Marco, Pessoa, Projeto, Tarefa } from '@/dominio/tipos';
import { rotuloPrioridade, rotuloStatus, rotuloStatusTarefa } from '@/dominio/tipos';

const CABECALHO = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Calibri', sz: 11 },
  fill: { fgColor: { rgb: '6D28D9' } },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
};

function aba(dados: (string | number)[][], larguras: number[]) {
  const planilha = XLSX.utils.aoa_to_sheet(dados);
  planilha['!cols'] = larguras.map((wch) => ({ wch }));
  planilha['!freeze'] = { xSplit: 0, ySplit: 1 };
  for (let c = 0; c < dados[0].length; c += 1) {
    const celula = planilha[XLSX.utils.encode_cell({ r: 0, c })];
    if (celula) celula.s = CABECALHO;
  }
  return planilha;
}

function baixar(livro: XLSX.WorkBook, nome: string) {
  XLSX.writeFile(livro, nome);
}

const carimbo = () => new Date().toISOString().slice(0, 10);

export function exportarCarteira(projetos: Projeto[], pessoas: Pessoa[]) {
  const nome = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '';
  const linhas: (string | number)[][] = [[
    'Código', 'Projeto', 'Área', 'Responsável', 'Situação', 'Prioridade',
    'Início previsto', 'Fim previsto', 'Início real', 'Fim real', 'Avanço (%)', 'Saúde',
  ]];
  for (const p of projetos) {
    linhas.push([
      p.codigo ?? '', p.nome, p.area ?? '', nome(p.responsavel_id),
      rotuloStatus[p.status], rotuloPrioridade[p.prioridade],
      formatarData(p.inicio_previsto), formatarData(p.fim_previsto),
      formatarData(p.inicio_real), formatarData(p.fim_real),
      p.percentual, rotuloSaude[saude(p)],
    ]);
  }
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, aba(linhas, [12, 38, 18, 22, 14, 12, 14, 14, 14, 14, 11, 12]), 'Projetos');
  baixar(livro, `projetos-${carimbo()}.xlsx`);
}

export function exportarProjeto(
  projeto: Projeto, pessoas: Pessoa[], marcos: Marco[], tarefas: Tarefa[], atualizacoes: Atualizacao[],
) {
  const nome = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '';
  const livro = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(livro, aba([
    ['Campo', 'Valor'],
    ['Projeto', projeto.nome],
    ['Código', projeto.codigo ?? ''],
    ['Área', projeto.area ?? ''],
    ['Responsável', nome(projeto.responsavel_id)],
    ['Situação', rotuloStatus[projeto.status]],
    ['Prioridade', rotuloPrioridade[projeto.prioridade]],
    ['Início previsto', formatarData(projeto.inicio_previsto)],
    ['Fim previsto', formatarData(projeto.fim_previsto)],
    ['Avanço (%)', projeto.percentual],
    ['Saúde', rotuloSaude[saude(projeto)]],
    ['Descrição', projeto.descricao ?? ''],
  ], [20, 60]), 'Resumo');

  XLSX.utils.book_append_sheet(livro, aba([
    ['Marco', 'Data prevista', 'Data real', 'Concluído', 'Descrição'],
    ...marcos.map((m) => [
      m.nome, formatarData(m.data_prevista), formatarData(m.data_real),
      m.concluido ? 'Sim' : 'Não', m.descricao ?? '',
    ]),
  ], [34, 15, 15, 12, 50]), 'Marcos');

  XLSX.utils.book_append_sheet(livro, aba([
    ['Tarefa', 'Marco', 'Responsável', 'Situação', 'Início', 'Prazo', 'Concluída em'],
    ...tarefas.map((t) => [
      t.titulo, marcos.find((m) => m.id === t.marco_id)?.nome ?? '', nome(t.responsavel_id),
      rotuloStatusTarefa[t.status], formatarData(t.inicio), formatarData(t.prazo), formatarData(t.concluida_em),
    ]),
  ], [40, 26, 22, 14, 13, 13, 14]), 'Tarefas');

  XLSX.utils.book_append_sheet(livro, aba([
    ['Data', 'Situação reportada', 'Avanço (%)', 'Acompanhamento', 'Riscos', 'Próximos passos'],
    ...atualizacoes.map((a) => [
      formatarData(a.data), a.status_reportado ? rotuloStatus[a.status_reportado] : '',
      a.percentual ?? '', a.texto, a.riscos ?? '', a.proximos_passos ?? '',
    ]),
  ], [13, 18, 11, 60, 40, 40]), 'Acompanhamento');

  const arquivo = (projeto.codigo ?? projeto.nome).replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase();
  baixar(livro, `projeto-${arquivo}-${carimbo()}.xlsx`);
}
