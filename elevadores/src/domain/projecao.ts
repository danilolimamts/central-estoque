/* ============================================================
   Projecao de termino: no ritmo atual, quando o plano acaba.

   O BurnDown mostra o ideal contra o real, mas nao responde a pergunta
   que decide a reuniao. Aqui o ritmo das ultimas semanas e projetado
   sobre o que falta e comparado com o prazo combinado.

   A conta e deliberadamente simples: media movel de entregas por
   semana. Nao ha por que estimar melhor do que o dado permite - o que
   se quer e a ordem de grandeza do desvio, nao uma data exata.
   ============================================================ */
import type { Acao } from './tipos';
import { situacaoDe } from './projeto';

const SEMANA = 7 * 86400000;

/* Janela do ritmo. Oito semanas absorve o pico de uma entrega grande
   sem deixar o numero preso a um passado que ja nao vale. */
export const SEMANAS_DA_JANELA = 8;

export type SituacaoProjecao = 'no_prazo' | 'atrasado' | 'parado' | 'concluido' | 'sem_prazo';

export interface Projecao {
  situacao: SituacaoProjecao;
  /* Entregas por semana na janela, arredondado para uma casa. */
  ritmo: number;
  abertas: number;
  concluidasNaJanela: number;
  /* Nulo quando nao da para projetar (ritmo zero ou nada em aberto). */
  dataProjetada: Date | null;
  /* Ultimo prazo entre as acoes em aberto: o fim combinado do plano. */
  prazoPlano: Date | null;
  /* Positivo = termina depois do combinado. */
  desvioDias: number | null;
  semanasRestantes: number | null;
}

function soData(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/* Data em que a acao entrou na conta de entregue. Quem foi concluida
   sem data de conclusao nao entra no ritmo: nao da para saber quando
   aconteceu, e chutar a data infla ou esvazia a janela. */
function dataDaEntrega(a: Acao): Date | null {
  return a.concluida ? a.dataConclusao : null;
}

export function projetarTermino(
  acoes: Acao[],
  hoje: Date,
  semanasDaJanela = SEMANAS_DA_JANELA
): Projecao {
  const total = acoes.length;
  const abertas = acoes.filter((a) => situacaoDe(a) !== 'concluida').length;

  const prazos = acoes
    .filter((a) => situacaoDe(a) !== 'concluida')
    .map((a) => a.prazoValido)
    .filter((d): d is Date => d instanceof Date);
  const prazoPlano = prazos.length > 0 ? new Date(Math.max(...prazos.map((d) => d.getTime()))) : null;

  const inicioJanela = new Date(hoje.getTime() - semanasDaJanela * SEMANA);
  const concluidasNaJanela = acoes.filter((a) => {
    const d = dataDaEntrega(a);
    return d != null && d > inicioJanela && d <= hoje;
  }).length;
  const ritmo = Math.round((concluidasNaJanela / semanasDaJanela) * 10) / 10;

  const base: Omit<Projecao, 'situacao'> = {
    ritmo,
    abertas,
    concluidasNaJanela,
    dataProjetada: null,
    prazoPlano,
    desvioDias: null,
    semanasRestantes: null,
  };

  if (total === 0 || abertas === 0) {
    return { ...base, situacao: 'concluido' };
  }
  if (ritmo <= 0) {
    /* Nada entregue na janela: projetar seria dividir por zero e
       prometer uma data que o ritmo nao sustenta. */
    return { ...base, situacao: 'parado' };
  }

  const semanasRestantes = Math.ceil((abertas / ritmo) * 10) / 10;
  const dataProjetada = soData(new Date(hoje.getTime() + semanasRestantes * SEMANA));

  if (!prazoPlano) {
    return { ...base, situacao: 'sem_prazo', dataProjetada, semanasRestantes };
  }

  const desvioDias = Math.round((dataProjetada.getTime() - soData(prazoPlano).getTime()) / 86400000);
  return {
    ...base,
    situacao: desvioDias > 0 ? 'atrasado' : 'no_prazo',
    dataProjetada,
    semanasRestantes,
    desvioDias,
  };
}

function dataBR(d: Date | null): string {
  return d ? d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
}

/* Frase pronta para o cartao, o boletim e o corpo do e-mail. */
export function explicarProjecao(p: Projecao): string {
  switch (p.situacao) {
    case 'concluido':
      return 'Todas as ações do plano estão concluídas.';
    case 'parado':
      return `Nenhuma ação concluída nas últimas ${SEMANAS_DA_JANELA} semanas: sem ritmo para projetar o término das ${p.abertas} em aberto.`;
    case 'sem_prazo':
      return `No ritmo de ${p.ritmo} ação(ões) por semana, as ${p.abertas} em aberto terminam por volta de ${dataBR(p.dataProjetada)}. O plano não tem prazo definido para comparar.`;
    case 'no_prazo': {
      const folga = Math.abs(p.desvioDias ?? 0);
      return `No ritmo de ${p.ritmo} ação(ões) por semana, o plano termina por volta de ${dataBR(p.dataProjetada)}, ${folga} dia(s) antes do prazo de ${dataBR(p.prazoPlano)}.`;
    }
    case 'atrasado':
      return `No ritmo de ${p.ritmo} ação(ões) por semana, o plano termina por volta de ${dataBR(p.dataProjetada)} — ${p.desvioDias} dia(s) depois do prazo de ${dataBR(p.prazoPlano)}.`;
  }
}

/* Quanto o ritmo precisaria subir para bater o prazo combinado. E a
   pergunta seguinte a "estamos atrasados": o que fazer a respeito. */
export function ritmoNecessario(p: Projecao, hoje: Date): number | null {
  if (p.situacao !== 'atrasado' || !p.prazoPlano) return null;
  const semanas = (soData(p.prazoPlano).getTime() - soData(hoje).getTime()) / SEMANA;
  if (semanas <= 0) return null;
  return Math.ceil((p.abertas / semanas) * 10) / 10;
}
