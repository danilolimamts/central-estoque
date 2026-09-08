import * as XLSX from 'xlsx-js-style';
import { formatarData, rotuloSaude, saude } from '@/dominio/regras';
import { filhosDe, percentualEfetivo } from '@/dominio/arvore';
import { urlDoAnexo } from '@/estado/dados';
import type { Anexo, Atualizacao, Marco, Pessoa, Projeto, Tarefa } from '@/dominio/tipos';
import { rotuloMomento, rotuloPrioridade, rotuloStatusTarefa } from '@/dominio/tipos';
import { rotuloDaSituacao } from '@/dominio/situacoes';

const CABECALHO = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Calibri', sz: 11 },
  fill: { fgColor: { rgb: '6D28D9' } },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
};

/* Aba so com cabecalho parece planilha quebrada para quem abre. A linha
   de aviso custa nada e diz que a secao existe e esta vazia. */
function comAviso(dados: (string | number)[][], aviso: string) {
  if (dados.length > 1) return dados;
  return [...dados, [aviso, ...Array(Math.max(0, dados[0].length - 1)).fill('')]];
}

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
    'Código', 'Projeto', 'Chamado', 'Jira', 'Área', 'Responsável', 'Situação', 'Prioridade',
    'Início previsto', 'Fim previsto', 'Início real', 'Fim real', 'Avanço (%)', 'Saúde',
  ]];
  for (const p of projetos) {
    linhas.push([
      p.codigo ?? '', p.nome, p.chamado ?? '', p.ticket_jira ?? '', p.area ?? '', nome(p.responsavel_id),
      rotuloDaSituacao(p.status), rotuloPrioridade[p.prioridade],
      formatarData(p.inicio_previsto), formatarData(p.fim_previsto),
      formatarData(p.inicio_real), formatarData(p.fim_real),
      percentualEfetivo(projetos, p), rotuloSaude[saude(p, projetos)],
    ]);
  }
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, aba(linhas, [12, 38, 12, 12, 18, 22, 14, 12, 14, 14, 14, 14, 11, 12]), 'Projetos');
  baixar(livro, `projetos-${carimbo()}.xlsx`);
}

export function exportarProjeto(
  projeto: Projeto, pessoas: Pessoa[], marcos: Marco[], tarefas: Tarefa[],
  atualizacoes: Atualizacao[], anexos: Anexo[] = [],
  /* A carteira inteira: e dela que saem as atividades deste projeto. */
  carteira: Projeto[] = [],
) {
  const nome = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '';
  const livro = XLSX.utils.book_new();
  const atividades = filhosDe(carteira, projeto.id);

  XLSX.utils.book_append_sheet(livro, aba([
    ['Campo', 'Valor'],
    ['Projeto', projeto.nome],
    ['Código', projeto.codigo ?? ''],
    ['Chamado no BSeller', projeto.chamado ?? ''],
    ['Ticket do Jira', projeto.ticket_jira ?? ''],
    ['Área', projeto.area ?? ''],
    ['Responsável', nome(projeto.responsavel_id)],
    ['Situação', rotuloDaSituacao(projeto.status)],
    ['Prioridade', rotuloPrioridade[projeto.prioridade]],
    ['Início previsto', formatarData(projeto.inicio_previsto)],
    ['Fim previsto', formatarData(projeto.fim_previsto)],
    ['Avanço (%)', percentualEfetivo(carteira.length ? carteira : [projeto], projeto)],
    ['Atividades', atividades.length],
    ['Saúde', rotuloSaude[saude(projeto)]],
    ['Descrição', projeto.descricao ?? ''],
  ], [20, 60]), 'Resumo');

  /* O trabalho de um projeto guarda-chuva vive nas atividades dele:
     sem esta aba, exportar o projeto devolvia uma planilha com quatro
     secoes vazias e parecia relatorio em branco. */
  if (atividades.length) {
    XLSX.utils.book_append_sheet(livro, aba([
      ['Atividade', 'Chamado', 'Jira', 'Responsável', 'Situação', 'Prioridade',
        'Início', 'Fim', 'Avanço (%)', 'Saúde', 'Descrição'],
      ...atividades.map((a) => [
        a.nome, a.chamado ?? '', a.ticket_jira ?? '', nome(a.responsavel_id),
        rotuloDaSituacao(a.status), rotuloPrioridade[a.prioridade],
        formatarData(a.inicio_previsto ?? a.inicio_real),
        formatarData(a.fim_previsto ?? a.fim_real),
        percentualEfetivo(carteira, a), rotuloSaude[saude(a, carteira)], a.descricao ?? '',
      ]),
    ], [40, 12, 12, 22, 16, 12, 13, 13, 11, 12, 50]), 'Atividades');
  }

  XLSX.utils.book_append_sheet(livro, aba(comAviso([
    ['Marco', 'Data prevista', 'Data real', 'Concluído', 'Descrição'],
    ...marcos.map((m) => [
      m.nome, formatarData(m.data_prevista), formatarData(m.data_real),
      m.concluido ? 'Sim' : 'Não', m.descricao ?? '',
    ]),
  ], 'Nenhum marco cadastrado neste projeto.'), [34, 15, 15, 12, 50]), 'Marcos');

  XLSX.utils.book_append_sheet(livro, aba(comAviso([
    ['Tarefa', 'Marco', 'Responsável', 'Situação', 'Início', 'Prazo', 'Concluída em'],
    ...tarefas.map((t) => [
      t.titulo, marcos.find((m) => m.id === t.marco_id)?.nome ?? '', nome(t.responsavel_id),
      rotuloStatusTarefa[t.status], formatarData(t.inicio), formatarData(t.prazo), formatarData(t.concluida_em),
    ]),
  ], 'Nenhuma tarefa cadastrada neste projeto.'), [40, 26, 22, 14, 13, 13, 14]), 'Tarefas');

  XLSX.utils.book_append_sheet(livro, aba(comAviso([
    ['Data', 'Situação reportada', 'Avanço (%)', 'Acompanhamento', 'Riscos', 'Próximos passos'],
    ...atualizacoes.map((a) => [
      formatarData(a.data), a.status_reportado ? rotuloDaSituacao(a.status_reportado) : '',
      a.percentual ?? '', a.texto, a.riscos ?? '', a.proximos_passos ?? '',
    ]),
  ], 'Nenhum acompanhamento lançado neste projeto.'), [13, 18, 11, 60, 40, 40]), 'Acompanhamento');

  if (anexos.length) {
    /* O arquivo em si nao entra na planilha: vai o link publico, que
       abre a foto ou o documento direto do navegador. */
    XLSX.utils.book_append_sheet(livro, aba([
      ['Arquivo', 'Momento', 'Cena', 'Legenda', 'Enviado por', 'Data', 'Link'],
      ...anexos.map((a) => [
        a.nome_arquivo, rotuloMomento[a.momento], a.par ?? '', a.legenda ?? '',
        a.enviado_por ?? '', formatarData(a.criado_em), urlDoAnexo(a.caminho),
      ]),
    ], [34, 13, 20, 40, 22, 13, 70]), 'Anexos');
  }

  const arquivo = (projeto.codigo ?? projeto.nome).replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase();
  baixar(livro, `projeto-${arquivo}-${carimbo()}.xlsx`);
}
