/* Gera uma planilha de demonstracao no formato real da aba Multiplos e
   Projeto, incluindo as armadilhas conhecidas (coluna Marca duplicada da
   tabela dinamica, componentes BOMBA/COMANDO/MOTOR, datas em formatos
   diferentes e acoes concluidas sem data). Usada para validar o app no
   navegador sem expor a planilha real do negocio. */
import * as XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const CAB = [
  'Item Vol.Multiplo', 'Nome Item Vol.Multiplo', 'Item Componente', 'Nome Item Componente',
  'Quantidade', 'in interface', 'Peso', 'Linha do Produto', 'Marca', 'Componente BASE/COLUNA',
  'Filtrar ?', 'CD', 'REVERSA', 'DS', 'OUTROS', 'Chave', 'Tonelada FIXA', 'Fabricante',
  null, null, 'Marca', 'Contagem',
];

const CONJUNTOS = [
  { marca: 'ENGECASS', fab: 'ENGECASS',          ton: '4 t',   base: 72, col: 174, rev: 10 },
  { marca: 'KREBS',    fab: 'KREBS',             ton: '2 t',   base: 52, col: 29,  rev: 4 },
  { marca: 'FORTG',    fab: 'JM MAQUINAS',       ton: '4 t',   base: 20, col: 28,  rev: 12 },
  { marca: 'FORTG',    fab: 'MAQUINAS RIBEIRO',  ton: '4 t',   base: 6,  col: 16,  rev: 5 },
  { marca: 'AUTOP',    fab: 'AUTOP',             ton: '3,2 t', base: 8,  col: 8,   rev: 0 },
  { marca: 'JARAGUA',  fab: 'JARAGUA',           ton: '2 t',   base: 5,  col: 5,   rev: 0 },
  { marca: 'RAVE',     fab: 'RAVE',              ton: '3 t',   base: 4,  col: 4,   rev: 0 },
  { marca: 'MASTER',   fab: 'MASTER',            ton: '4 t',   base: 4,  col: 12,  rev: 3 },
  { marca: 'SACE',     fab: 'SACE',              ton: '5 t',   base: 2,  col: 3,   rev: 0 },
  { marca: 'TECNO',    fab: 'TECNO',             ton: '2 t',   base: 2,  col: 1,   rev: 2 },
  { marca: 'BRAVO',    fab: 'BRAVO',             ton: '2 t',   base: 0,  col: 0,   rev: 0 },
  { marca: 'VULCANO',  fab: 'VULCANO',           ton: '4 t',   base: 0,  col: 0,   rev: 0 },
];

const linhas = [];
let idPai = 960000;
let idComp = 970000;

for (const c of CONJUNTOS) {
  const chave = `${c.marca} ${c.fab} ${c.ton}`;
  const peso = parseFloat(c.ton) * 1000;
  // Cada conjunto vira alguns elevadores (itens pai), distribuindo o saldo.
  const nElev = c.base > 0 ? 3 : 1;
  for (let i = 0; i < nElev; i++) {
    const pai = String(idPai++);
    const nomePai = `ELEVADOR ${c.marca} ${c.ton} MOD ${i + 1}`;
    const fatia = (v) => (i === 0 ? v - Math.floor(v / nElev) * (nElev - 1) : Math.floor(v / nElev));
    // Um em cada tres elevadores tem o S invertido (S na base), para a auditoria.
    const invertido = i === 1;
    const semS = i === 2 && c.marca === 'KREBS';

    const comuns = { qtd: 1, linha: 'ELEVADORES', marca: c.marca, filtrar: 'SIM',
      chave, ton: c.ton, fab: c.fab, peso };

    linhas.push([pai, nomePai, String(idComp++), `BASE ${c.marca} ${c.ton}`, 1,
      semS ? 'N' : invertido ? 'S' : 'N', peso, comuns.linha, c.marca, 'BASE', 'SIM',
      fatia(c.base), fatia(c.rev), 0, 0, chave, c.ton, c.fab, null, null, 'PIVOT_ERRADO', 1]);

    linhas.push([pai, nomePai, String(idComp++), `COLUNA ${c.marca} ${c.ton}`, 2,
      semS ? 'N' : invertido ? 'N' : 'S', peso, comuns.linha, c.marca, 'COLUNA', 'SIM',
      fatia(c.col), 0, 0, 0, chave, c.ton, c.fab, null, null, 'PIVOT_ERRADO', 1]);

    // Componentes que NAO podem entrar no kit.
    if (i === 0) {
      linhas.push([pai, nomePai, String(idComp++), `BOMBA ${c.marca}`, 1, '', 12, comuns.linha,
        c.marca, 'BOMBA', 'SIM', 99, 0, 0, 0, chave, c.ton, c.fab, null, null, 'PIVOT_ERRADO', 1]);
      linhas.push([pai, nomePai, String(idComp++), `COMANDO ${c.marca}`, 1, '', 5, comuns.linha,
        c.marca, 'COMANDO', 'SIM', 40, 0, 0, 0, chave, c.ton, c.fab, null, null, 'PIVOT_ERRADO', 1]);
    }
  }
}

const CAB_PROJ = [
  'N° PLAN ACTION', 'PROPOSTA', 'O QUE FAZER?', 'POR QUÊ?', 'COMO SOLUCIONAR?',
  'QUEM? (RESPONSAVEL)', 'ÍNICIO', 'FIM', 'REAGENDAMENTO', 'SITUAÇÃO', 'DATA CONCLUSÃO',
  'DURAÇÃO', 'STATUS', 'OBS', 'ESFORÇO', 'REDUZ ERRO ?', 'MELHORA PRODUTIVIDADE ?',
  'MELHORA P/ CLIENTE ?', 'REDUZ CUSTO ?', 'AUMENTA SEGURANÇA ?', 'IMPACTO',
];

const PROPOSTAS = [
  ['Padronizar endereçamento', 5, 5, 'Ana Souza'],
  ['Kit único por SKU',        3, 4, 'Bruno Lima'],
  ['Contagem cíclica',         7, 5, 'Carla Dias'],
  ['Alerta de reversa',        5, 4, 'Diego Alves'],
  ['Etiqueta de tonelada',     8, 5, 'Ana Souza'],
  ['Foto no picking',          5, 2, 'Eva Rocha'],
  ['Relatório semanal',        3, 3, 'Bruno Lima'],
  ['Treinamento da equipe',    7, 2, 'Felipe Nunes'],
  ['Melhoria Bseller',        15, 4, 'Gabi Torres'],
];

const D = (m, d) => new Date(Date.UTC(2026, m - 1, d));
const linhasProj = [];
let n = 1;
PROPOSTAS.forEach((p, idx) => {
  const [prop, esf, imp, resp] = p;
  const nAcoes = idx < 5 ? 4 : 3;
  for (let i = 0; i < nAcoes; i++) {
    const concluida = (idx * 3 + i) % 5 < 3;
    const reagendada = (idx + i) % 3 === 0;
    // A terceira acao concluida de algumas propostas fica sem data (armadilha 8.7).
    const semData = concluida && idx % 4 === 0 && i === 1;
    const inicio = D(5, 26 + ((idx + i) % 3));
    const fim = D(6, 5 + ((idx * 2 + i) % 20));
    // Mistura de formatos: metade Date, metade string dd/mm/aaaa.
    const fmt = (d) => (idx % 2 === 0 ? d : d.toLocaleDateString('pt-BR'));
    linhasProj.push([
      String(n++), prop, `${prop} — etapa ${i + 1}`, 'Reduz divergência de inventário',
      'Ajuste de processo e sistema', resp, fmt(inicio), fmt(fim),
      reagendada ? fmt(D(7, 15 + (i % 10))) : null,
      concluida ? 'Concluída' : reagendada ? 'Em andamento' : 'Pendente',
      concluida && !semData ? fmt(D(6, 20 + (i % 8))) : null,
      `${10 + i}d`, concluida ? 'CONCLUIDO' : 'ANDAMENTO', semData ? 'sem data de conclusão' : '',
      esf, 'SIM', 'SIM', idx % 2 ? 'SIM' : 'NAO', 'SIM', idx % 4 ? 'NAO' : 'SIM', imp,
    ]);
  }
});

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ['Equalização de Elevadores — CD Cajamar', null], [null, null], CAB, ...linhas,
  ]),
  'Multiplos'
);
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CAB_PROJ, ...linhasProj]), 'Projeto');
// Aba pesada que o parser deve ignorar.
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([['Item', 'Saldo'], ...Array.from({ length: 500 }, (_, i) => [i, i * 2])]),
  'EstoqueAtual'
);

const saida = process.argv[2] || 'demo.xlsx';
writeFileSync(saida, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log(`gerado: ${saida} — ${linhas.length} linhas Multiplos, ${linhasProj.length} acoes`);
