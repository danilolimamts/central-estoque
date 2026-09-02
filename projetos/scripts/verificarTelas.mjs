/* Fumaca das telas internas com a API simulada.
   O Supabase nao esta acessivel em toda maquina (rede da empresa,
   ambiente de CI), e mesmo acessivel o banco de producao nao serve para
   teste. Aqui as respostas do PostgREST sao interceptadas e devolvidas
   com dados fixos, o que exercita painel, carteira, cronograma e
   detalhe de projeto de verdade.
   Uso: node scripts/verificarTelas.mjs [url] */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:8099/';
const hoje = new Date();
const iso = (deslocamentoEmDias) => {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + deslocamentoEmDias);
  return d.toISOString().slice(0, 10);
};

const pessoas = [
  { id: 'p1', user_id: null, nome: 'Danilo Lima', email: 'danilo@exemplo.com', area: 'Estoque', papel: 'admin', ativo: true },
  { id: 'p2', user_id: null, nome: 'Equipe Recebimento', email: 'recebimento@exemplo.com', area: 'Recebimento', papel: 'editor', ativo: true },
];

const projetos = [
  {
    id: 'j1', codigo: 'PRJ-001', nome: 'Reendereçamento do mezanino', descricao: 'Revisão de endereços e capacidade.',
    area: 'Estoque', responsavel_id: 'p1', status: 'em_andamento', prioridade: 'alta',
    inicio_previsto: iso(-40), fim_previsto: iso(20), inicio_real: iso(-38), fim_real: null,
    percentual: 45, criado_por: null, criado_em: '', atualizado_em: '',
  },
  {
    id: 'j2', codigo: 'PRJ-002', nome: 'Automação da conferência cega', descricao: null,
    area: 'Recebimento', responsavel_id: 'p2', status: 'em_risco', prioridade: 'critica',
    inicio_previsto: iso(-70), fim_previsto: iso(-8), inicio_real: iso(-70), fim_real: null,
    percentual: 60, criado_por: null, criado_em: '', atualizado_em: '',
  },
  {
    id: 'j3', codigo: 'PRJ-003', nome: 'Padronização de paletes', descricao: null,
    area: 'Expedição', responsavel_id: 'p1', status: 'concluido', prioridade: 'media',
    inicio_previsto: iso(-120), fim_previsto: iso(-25), inicio_real: iso(-118), fim_real: iso(-25),
    percentual: 100, criado_por: null, criado_em: '', atualizado_em: '',
  },
];

const marcos = [
  { id: 'm1', projeto_id: 'j1', nome: 'Levantamento de endereços', descricao: null, data_prevista: iso(-20), data_real: iso(-19), concluido: true, ordem: 0 },
  { id: 'm2', projeto_id: 'j1', nome: 'Migração dos itens', descricao: null, data_prevista: iso(10), data_real: null, concluido: false, ordem: 1 },
  { id: 'm3', projeto_id: 'j2', nome: 'Piloto em uma doca', descricao: null, data_prevista: iso(-15), data_real: null, concluido: false, ordem: 0 },
];

const tarefas = [
  { id: 't1', projeto_id: 'j1', marco_id: 'm1', titulo: 'Exportar base de endereços', descricao: null, responsavel_id: 'p1', status: 'concluida', inicio: iso(-30), prazo: iso(-22), concluida_em: iso(-23), ordem: 0 },
  { id: 't2', projeto_id: 'j1', marco_id: 'm2', titulo: 'Reetiquetar corredor C', descricao: null, responsavel_id: 'p2', status: 'em_andamento', inicio: iso(-5), prazo: iso(8), concluida_em: null, ordem: 1 },
];

const atualizacoes = [
  {
    id: 'a1', projeto_id: 'j1', data: iso(-3), texto: 'Corredores A e B concluídos; C começa na semana que vem.',
    status_reportado: 'em_andamento', percentual: 45, riscos: 'Falta de etiquetas pode travar o corredor C.',
    proximos_passos: 'Abrir pedido de etiquetas.', autor_id: null, autor_nome: 'Danilo Lima', criado_em: '',
  },
];

const porTabela = { pessoas, projetos, marcos, tarefas, atualizacoes };

const navegador = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const pagina = await navegador.newPage({ viewport: { width: 1360, height: 1000 } });

const erros = [];
/* Falha ao baixar recurso externo (a fonte do Google, por exemplo) nao
   e defeito do modulo: em maquina sem saida para a internet isso e
   esperado, e o app tem pilha de fontes alternativa. */
const ruido = (t) => /Failed to load resource|net::|ERR_/i.test(t);
pagina.on('console', (m) => { if (m.type() === 'error' && !ruido(m.text())) erros.push(m.text()); });
pagina.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

await pagina.route('**/rest/v1/**', async (rota) => {
  const caminho = new URL(rota.request().url()).pathname.split('/').pop() ?? '';
  const linhas = porTabela[caminho] ?? [];
  const filtro = new URL(rota.request().url()).searchParams.get('projeto_id');
  const corpo = filtro
    ? linhas.filter((l) => l.projeto_id === filtro.replace('eq.', ''))
    : linhas;
  await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
});

await pagina.goto(url, { waitUntil: 'networkidle' });
await pagina.waitForTimeout(1200);

const telas = [
  ['painel', 'Painel'],
  ['projetos', 'Projetos'],
  ['cronograma', 'Cronograma'],
  ['pessoas', 'Pessoas'],
];

for (const [arquivo, aba] of telas) {
  await pagina.getByRole('button', { name: aba, exact: true }).click();
  await pagina.waitForTimeout(500);
  await pagina.screenshot({ path: `verificacao-${arquivo}.png`, fullPage: true });
}

// Detalhe: abre pela linha da carteira.
await pagina.getByRole('button', { name: 'Projetos', exact: true }).click();
await pagina.getByText('Reendereçamento do mezanino').first().click();
await pagina.waitForTimeout(700);
await pagina.screenshot({ path: 'verificacao-detalhe.png', fullPage: true });

const texto = (await pagina.textContent('body')) ?? '';
if (!texto.includes('Marcos') || !texto.includes('Migração dos itens')) {
  console.error('FALHOU: o detalhe do projeto não carregou marcos.');
  process.exitCode = 1;
} else if (erros.length) {
  console.error('FALHOU: erros de JavaScript', erros);
  process.exitCode = 1;
} else {
  console.log('OK: painel, carteira, cronograma, pessoas e detalhe renderizados sem erros.');
}

await navegador.close();
