/* ============================================================
   Dados de demonstracao. Servem para conhecer as telas sem ter a
   planilha em maos e para revisar o layout. Reproduzem o formato
   real, incluindo componentes fora do kit (BOMBA, COMANDO) e o
   campo "in interface" invertido em parte dos elevadores.

   Nao sao os numeros do CD: a planilha real entra pela tela de
   importacao.
   ============================================================ */
import type { Componente, Acao } from '../domain/tipos';

interface Molde {
  marca: string;
  fabricante: string;
  ton: string;
  base: number;
  col: number;
  reversa: number;
}

const MOLDES: Molde[] = [
  { marca: 'ENGECASS', fabricante: 'ENGECASS', ton: '4 t', base: 72, col: 174, reversa: 10 },
  { marca: 'KREBS', fabricante: 'KREBS', ton: '2 t', base: 52, col: 29, reversa: 4 },
  { marca: 'FORTG', fabricante: 'JM MAQUINAS', ton: '4 t', base: 20, col: 28, reversa: 12 },
  { marca: 'FORTG', fabricante: 'MAQUINAS RIBEIRO', ton: '4 t', base: 6, col: 16, reversa: 5 },
  { marca: 'AUTOP', fabricante: 'AUTOP', ton: '3,2 t', base: 8, col: 8, reversa: 0 },
  { marca: 'JARAGUA', fabricante: 'JARAGUA', ton: '2 t', base: 5, col: 5, reversa: 0 },
  { marca: 'RAVE', fabricante: 'RAVE', ton: '3 t', base: 4, col: 4, reversa: 0 },
  { marca: 'MASTER', fabricante: 'MASTER', ton: '4 t', base: 4, col: 12, reversa: 3 },
  { marca: 'SACE', fabricante: 'SACE', ton: '5 t', base: 2, col: 3, reversa: 0 },
  { marca: 'TECNO', fabricante: 'TECNO', ton: '2 t', base: 2, col: 1, reversa: 2 },
  { marca: 'BRAVO', fabricante: 'BRAVO', ton: '2 t', base: 0, col: 0, reversa: 0 },
  { marca: 'VULCANO', fabricante: 'VULCANO', ton: '4 t', base: 0, col: 0, reversa: 0 },
];

function base(p: Partial<Componente>): Componente {
  return {
    itemVolMultiplo: '', nomeItemVolMultiplo: '', itemComponente: '', nomeItemComponente: '',
    quantidade: 1, inInterface: '', peso: 0, linhaProduto: 'ELEVADORES', marca: '',
    componenteBaseColuna: '', filtrar: 'SIM', cd: 0, reversa: 0, ds: 0, outros: 0,
    chave: '', toneladaFixa: '', fabricante: '', ...p,
  };
}

export function componentesDemo(): Componente[] {
  const saida: Componente[] = [];
  let idPai = 960000;
  let idComp = 970000;

  for (const m of MOLDES) {
    const chave = `${m.marca} ${m.fabricante} ${m.ton}`;
    const peso = parseFloat(m.ton.replace(',', '.')) * 1000;
    const nElev = m.base > 0 ? 3 : 1;
    const fatia = (v: number, i: number) =>
      i === 0 ? v - Math.floor(v / nElev) * (nElev - 1) : Math.floor(v / nElev);

    for (let i = 0; i < nElev; i++) {
      const pai = String(idPai++);
      const nomePai = `ELEVADOR ${m.marca} ${m.ton} MOD ${i + 1}`;
      // Um em cada tres elevadores fica com o S na base (a corrigir) e um
      // dos conjuntos fica sem nenhum S, para a auditoria ter o que mostrar.
      const invertido = i === 1;
      const semS = i === 2 && m.marca === 'KREBS';
      const comum = { itemVolMultiplo: pai, nomeItemVolMultiplo: nomePai, marca: m.marca,
        chave, toneladaFixa: m.ton, fabricante: m.fabricante, peso };

      saida.push(base({ ...comum, itemComponente: String(idComp++),
        nomeItemComponente: `BASE ${m.marca} ${m.ton}`, componenteBaseColuna: 'BASE',
        inInterface: semS ? 'N' : invertido ? 'S' : 'N',
        cd: fatia(m.base, i), reversa: fatia(m.reversa, i) }));

      saida.push(base({ ...comum, itemComponente: String(idComp++),
        nomeItemComponente: `COLUNA ${m.marca} ${m.ton}`, componenteBaseColuna: 'COLUNA',
        quantidade: 2, inInterface: semS ? 'N' : invertido ? 'N' : 'S', cd: fatia(m.col, i) }));

      // Componentes que nao entram no kit.
      if (i === 0) {
        saida.push(base({ ...comum, itemComponente: String(idComp++),
          nomeItemComponente: `BOMBA ${m.marca}`, componenteBaseColuna: 'BOMBA', cd: 99 }));
        saida.push(base({ ...comum, itemComponente: String(idComp++),
          nomeItemComponente: `COMANDO ${m.marca}`, componenteBaseColuna: 'COMANDO', cd: 40 }));
      }
    }
  }
  return saida;
}

const PROPOSTAS: [string, number, number, string][] = [
  ['Padronizar endereçamento', 5, 5, 'Ana Souza'],
  ['Kit único por SKU', 3, 4, 'Bruno Lima'],
  ['Contagem cíclica', 7, 5, 'Carla Dias'],
  ['Alerta de reversa', 5, 4, 'Diego Alves'],
  ['Etiqueta de tonelada', 8, 5, 'Ana Souza'],
  ['Foto no picking', 5, 2, 'Eva Rocha'],
  ['Relatório semanal', 3, 3, 'Bruno Lima'],
  ['Treinamento da equipe', 7, 2, 'Felipe Nunes'],
  ['Melhoria Bseller', 15, 4, 'Gabi Torres'],
];

const D = (mes: number, dia: number) => new Date(Date.UTC(2026, mes - 1, dia));

export function acoesDemo(): Acao[] {
  const saida: Acao[] = [];
  let n = 1;
  PROPOSTAS.forEach(([proposta, esforco, impacto, responsavel], idx) => {
    const nAcoes = idx < 5 ? 4 : 3;
    for (let i = 0; i < nAcoes; i++) {
      const concluida = (idx * 3 + i) % 5 < 3;
      const reagendada = (idx + i) % 3 === 0;
      // Algumas concluidas ficam sem data de conclusao, que e o caso que
      // distorce o BurnDown e dispara alerta proprio.
      const semData = concluida && idx % 4 === 0 && i === 1;
      saida.push({
        numPlanAction: String(n++),
        proposta,
        oQueFazer: `${proposta} — etapa ${i + 1}`,
        porque: 'Reduz divergência de inventário',
        comoSolucionar: 'Ajuste de processo e sistema',
        responsavel,
        inicio: D(5, 26 + ((idx + i) % 3)),
        fim: D(6, 5 + ((idx * 2 + i) % 20)),
        reagendamento: reagendada ? D(7, 15 + (i % 10)) : null,
        situacao: concluida ? 'Concluída' : reagendada ? 'Em andamento' : 'Pendente',
        dataConclusao: concluida && !semData ? D(6, 20 + (i % 8)) : null,
        duracao: `${10 + i}d`,
        status: concluida ? 'CONCLUIDO' : 'ANDAMENTO',
        obs: semData ? 'sem data de conclusão' : '',
        esforco,
        reduzErro: 'SIM',
        melhoraProdutividade: 'SIM',
        melhoraCliente: idx % 2 ? 'SIM' : 'NAO',
        reduzCusto: 'SIM',
        aumentaSeguranca: idx % 4 ? 'NAO' : 'SIM',
        impacto,
        concluida: false, prazoValido: null, atrasada: false,
        reagendada: false, concluidaSemData: false,
      });
    }
  });
  return saida;
}
