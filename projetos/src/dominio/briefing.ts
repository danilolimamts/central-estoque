import { formatarData } from './regras';
import type { Anexo, Marco, Pagina, Pessoa, Projeto, Tarefa } from './tipos';
import { rotuloStatus, rotuloStatusTarefa } from './tipos';
import { documentoVazio } from './documento';
import type { DadosDoDocumento } from './documento';

/* A ponte com o chat: o app nao escreve o texto das 15 secoes (nao ha
   servidor nem chave de IA neste site estatico), entao ele monta um
   briefing com tudo o que o projeto ja sabe. A pessoa cola esse texto
   no chat, recebe o conteudo pronto em JSON e cola de volta. */

function lista(titulo: string, itens: string[]): string {
  if (!itens.length) return '';
  return `\n${titulo}\n${itens.map((i) => `- ${i}`).join('\n')}\n`;
}

function textoDaPagina(pagina: Pagina): string {
  return pagina.blocos.map((b) => (b.tipo === 'fluxo'
    ? `[fluxograma]\n${b.conteudo}`
    : b.conteudo
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<li>/gi, '- ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim())).join('\n\n');
}

export function montarBriefing(
  projeto: Projeto,
  pessoas: Pessoa[],
  marcos: Marco[],
  tarefas: Tarefa[],
  anexos: Anexo[],
  paginas: Pagina[],
  numero: number,
  objetivo: string,
): string {
  const responsavel = pessoas.find((p) => p.id === projeto.responsavel_id)?.nome ?? 'não informado';

  const partes = [
    'Preciso do conteúdo de uma Proposta de Melhoria Sistêmica do Bseller (Loja do Mecânico, Controle de Estoque, CD Cajamar), no padrão de 15 seções.',
    '',
    `OBJETIVO DA MELHORIA (o que eu quero):\n${objetivo || '(descreva aqui o objetivo da melhoria)'}`,
    '',
    'CONTEXTO DO PROJETO NO MÓDULO:',
    `- Documento número: ${numero}`,
    `- Projeto: ${projeto.nome}${projeto.codigo ? ` (${projeto.codigo})` : ''}`,
    `- Área: ${projeto.area ?? 'não informada'}`,
    `- Responsável: ${responsavel}`,
    `- Situação: ${rotuloStatus[projeto.status]} · avanço ${projeto.percentual}%`,
    `- Prazo previsto: ${formatarData(projeto.inicio_previsto)} a ${formatarData(projeto.fim_previsto)}`,
    projeto.descricao ? `- Descrição: ${projeto.descricao}` : '',
    lista('MARCOS:', marcos.map((m) => `${m.nome} (previsto ${formatarData(m.data_prevista)}${m.concluido ? ', concluído' : ''})`)),
    lista('TAREFAS:', tarefas.map((t) => `${t.titulo} [${rotuloStatusTarefa[t.status]}]`)),
    lista('ANEXOS:', anexos.map((a) => `${a.nome_arquivo} [${a.momento}]${a.legenda ? `: ${a.legenda}` : ''}`)),
  ].filter(Boolean);

  if (paginas.length) {
    partes.push('\nPÁGINAS DE DOCUMENTAÇÃO DO PROJETO:');
    for (const pagina of paginas) {
      partes.push(`\n### ${pagina.titulo}\n${textoDaPagina(pagina)}`);
    }
  }

  partes.push(
    '',
    'REGRAS DE ESCRITA: português do Brasil, sem travessão, sem jargão de TI para usuário final. Termos do negócio (WMS, EAN, OM, SKU, QRY) podem ficar.',
    '',
    'Responda SOMENTE com o JSON abaixo preenchido, sem comentários e sem texto em volta:',
    '',
    JSON.stringify({
      subtitulo: 'uma linha técnica que complementa o título',
      categoria: 'Inventário | Recebimento | Expedição | Cadastro | outro',
      objetivo: 'parágrafo do objetivo',
      dor: 'como funciona hoje e o que trava (AS IS)',
      to_be: 'como passa a funcionar (TO BE)',
      problema_central: 'o problema em uma frase',
      ganhos: [{ a: 'Dimensão', b: 'Ganho' }],
      exemplo_pratico: 'um caso do dia a dia, com números',
      regras_negocio: ['regra 1'],
      pontos_aberto: ['ponto 1'],
      fluxo: [{ a: 'Etapa', b: 'Como é hoje', c: 'Como fica' }],
      impactos: [{ a: 'Dimensão', b: 'Impacto' }],
      riscos: [{ a: 'Item', b: 'Descrição' }],
      esforco_justificativa: 'por que este esforço',
      prioridade_justificativa: 'por que esta prioridade',
      criterios_aceite: ['comportamento obrigatório 1'],
      cenarios_validacao: ['cenário 1'],
      kpis: [{ a: 'Indicador', b: 'Meta TO BE' }],
      rollout: [{ a: 'Fase 1 | Nome', b: 'Atividades' }],
      roi_bullets: ['ganho de retorno 1'],
      roi_fechamento: 'frase de fechamento do ROI',
      resumo_executivo: 'parágrafo longo de resumo',
    }, null, 2),
  );

  return partes.join('\n');
}

/* O que volta do chat e texto colado por uma pessoa: pode vir com cerca
   de markdown em volta e com campos a mais ou a menos. So os campos
   conhecidos entram, e nada quebra se faltar algum. */
export function lerConteudoColado(bruto: string, base: DadosDoDocumento): DadosDoDocumento {
  const semCerca = bruto.replace(/```(?:json)?/gi, '').trim();
  const inicio = semCerca.indexOf('{');
  const fim = semCerca.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) throw new Error('Não encontrei um JSON no texto colado.');

  const lido = JSON.parse(semCerca.slice(inicio, fim + 1)) as Partial<DadosDoDocumento>;
  const vazio = documentoVazio(base.numero);
  const resultado: DadosDoDocumento = { ...base };

  for (const chave of Object.keys(vazio) as (keyof DadosDoDocumento)[]) {
    const valor = lido[chave];
    if (valor === undefined || valor === null) continue;
    /* Numero, imagens e fluxogramas nao vem do chat: sao decididos no
       formulario e no material do proprio projeto. */
    if (chave === 'numero' || chave === 'imagens' || chave === 'fluxogramas') continue;
    (resultado as unknown as Record<string, unknown>)[chave] = valor;
  }

  return resultado;
}
