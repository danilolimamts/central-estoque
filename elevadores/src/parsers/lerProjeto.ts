/* ============================================================
   Leitura da aba Projeto -> Acao[] (secao 6 do brief).
   Cabecalho na linha 1. Devolve as acoes cruas (sem derivados de
   prazo); a derivacao com a data de hoje mora no dominio (projeto.ts),
   para os indicadores respeitarem os filtros da tela.
   ============================================================ */
import type { Acao } from '../domain/tipos';
import { montarObjetos, criarSeletor, paraNumero, paraTexto, converterData } from './utilData';

/* Cabecalho na linha 1 da planilha (indice 0, base zero). */
export const LINHA_CABECALHO_PROJETO = 0;

/* Valores neutros para os campos derivados; serao preenchidos por
   derivarAcao (dominio) quando a data de hoje estiver disponivel. */
const DERIVADOS_NEUTROS = {
  concluida: false,
  prazoValido: null as Date | null,
  atrasada: false,
  reagendada: false,
  concluidaSemData: false,
};

export function lerProjeto(aoa: unknown[][]): Acao[] {
  const { linhas } = montarObjetos(aoa, LINHA_CABECALHO_PROJETO);
  const acoes: Acao[] = [];

  for (const linha of linhas) {
    const s = criarSeletor(linha);
    const numPlanAction = paraTexto(s('N° PLAN ACTION', 'No PLAN ACTION', 'N PLAN ACTION'));
    const proposta = paraTexto(s('PROPOSTA'));
    // Descarta linhas totalmente vazias de identificacao.
    if (!numPlanAction && !proposta) continue;

    acoes.push({
      numPlanAction,
      proposta,
      oQueFazer: paraTexto(s('O QUE FAZER?', 'O QUE FAZER')),
      porque: paraTexto(s('POR QUÊ?', 'POR QUE?', 'POR QUE')),
      comoSolucionar: paraTexto(s('COMO SOLUCIONAR?', 'COMO SOLUCIONAR')),
      responsavel: paraTexto(s('QUEM? (RESPONSAVEL)', 'QUEM? (RESPONSÁVEL)', 'QUEM RESPONSAVEL', 'RESPONSAVEL')),
      inicio: converterData(s('ÍNICIO', 'INICIO', 'INÍCIO')),
      fim: converterData(s('FIM')),
      reagendamento: converterData(s('REAGENDAMENTO')),
      situacao: paraTexto(s('SITUAÇÃO', 'SITUACAO')),
      dataConclusao: converterData(s('DATA CONCLUSÃO', 'DATA CONCLUSAO')),
      duracao: paraTexto(s('DURAÇÃO', 'DURACAO')),
      status: paraTexto(s('STATUS')),
      obs: paraTexto(s('OBS')),
      esforco: paraNumero(s('ESFORÇO', 'ESFORCO')),
      reduzErro: paraTexto(s('REDUZ ERRO ?', 'REDUZ ERRO')),
      melhoraProdutividade: paraTexto(s('MELHORA PRODUTIVIDADE ?', 'MELHORA PRODUTIVIDADE')),
      melhoraCliente: paraTexto(s('MELHORA P/ CLIENTE ?', 'MELHORA P/ CLIENTE', 'MELHORA CLIENTE')),
      reduzCusto: paraTexto(s('REDUZ CUSTO ?', 'REDUZ CUSTO')),
      aumentaSeguranca: paraTexto(s('AUMENTA SEGURANÇA ?', 'AUMENTA SEGURANCA')),
      impacto: paraNumero(s('IMPACTO')),
      ...DERIVADOS_NEUTROS,
    });
  }

  return acoes;
}
