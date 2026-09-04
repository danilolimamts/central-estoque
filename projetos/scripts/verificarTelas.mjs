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
    projeto_pai_id: null, rotulo_filhos: null, area: 'Estoque', responsavel_id: 'p1', status: 'em_andamento', prioridade: 'alta',
    inicio_previsto: iso(-40), fim_previsto: iso(20), inicio_real: iso(-38), fim_real: null,
    percentual: 45, criado_por: null, criado_em: '', atualizado_em: '',
  },
  {
    id: 'j2', codigo: 'PRJ-002', nome: 'Automação da conferência cega', descricao: null,
    projeto_pai_id: null, rotulo_filhos: null, area: 'Recebimento', responsavel_id: 'p2', status: 'em_risco', prioridade: 'critica',
    inicio_previsto: iso(-70), fim_previsto: iso(-8), inicio_real: iso(-70), fim_real: null,
    percentual: 60, criado_por: null, criado_em: '', atualizado_em: '',
  },
  {
    id: 'j3', codigo: 'PRJ-003', nome: 'Padronização de paletes', descricao: null,
    projeto_pai_id: null, rotulo_filhos: null, area: 'Expedição', responsavel_id: 'p1', status: 'concluido', prioridade: 'media',
    inicio_previsto: iso(-120), fim_previsto: iso(-25), inicio_real: iso(-118), fim_real: iso(-25),
    percentual: 100, criado_por: null, criado_em: '', atualizado_em: '',
  },
];

projetos.push(
  {
    id: 'g1', codigo: 'PRJ-100', nome: 'Melhoria Sistêmica Bseller', descricao: 'Guarda-chuva das melhorias sistêmicas.',
    projeto_pai_id: null, rotulo_filhos: 'Melhorias', area: 'Sistema', responsavel_id: 'p1', status: 'em_andamento', prioridade: 'alta',
    inicio_previsto: iso(-30), fim_previsto: iso(60), inicio_real: null, fim_real: null,
    percentual: 0, criado_por: null, criado_em: '', atualizado_em: '',
  },
  {
    id: 'g1a', codigo: null, nome: 'Entrada massiva', descricao: null,
    projeto_pai_id: 'g1', rotulo_filhos: null, area: 'Sistema', responsavel_id: 'p1', status: 'em_andamento', prioridade: 'alta',
    inicio_previsto: iso(-10), fim_previsto: iso(20), inicio_real: null, fim_real: null,
    percentual: 30, criado_por: null, criado_em: '', atualizado_em: '',
  },
  {
    id: 'g1b', codigo: null, nome: 'Trava sistêmica para paletes', descricao: null,
    projeto_pai_id: 'g1', rotulo_filhos: null, area: 'Sistema', responsavel_id: 'p2', status: 'nao_iniciado', prioridade: 'media',
    inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null,
    percentual: 0, criado_por: null, criado_em: '', atualizado_em: '',
  },
);

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

const anexos = [
  {
    id: 'x1', projeto_id: 'j1', marco_id: null, atualizacao_id: null,
    caminho: 'j1/antes.jpg', nome_arquivo: 'antes.jpg', tipo_mime: 'image/jpeg',
    tamanho_bytes: 240000, momento: 'antes', legenda: 'Corredor C antes da revisão',
    par: 'Corredor C', enviado_por: 'Danilo Lima', criado_em: iso(-10),
  },
  {
    id: 'x2', projeto_id: 'j1', marco_id: null, atualizacao_id: null,
    caminho: 'j1/depois.jpg', nome_arquivo: 'depois.jpg', tipo_mime: 'image/jpeg',
    tamanho_bytes: 220000, momento: 'depois', legenda: 'Corredor C reetiquetado',
    par: 'Corredor C', enviado_por: 'Danilo Lima', criado_em: iso(-1),
  },
  {
    id: 'x3', projeto_id: 'j1', marco_id: null, atualizacao_id: 'a1',
    caminho: 'j1/evidencia.jpg', nome_arquivo: 'evidencia.jpg', tipo_mime: 'image/jpeg',
    tamanho_bytes: 180000, momento: 'evidencia', legenda: null, par: null,
    enviado_por: 'Danilo Lima', criado_em: iso(-3),
  },
  {
    id: 'x4', projeto_id: 'j1', marco_id: null, atualizacao_id: null,
    caminho: 'j1/plano.pdf', nome_arquivo: 'plano-de-endereços.pdf', tipo_mime: 'application/pdf',
    tamanho_bytes: 1240000, momento: 'documento', legenda: null, par: null,
    enviado_por: 'Equipe Recebimento', criado_em: iso(-30),
  },
];

const paginas = [
  {
    id: 'g1', projeto_id: 'j1', titulo: 'Comportamento da tela de endereço', ordem: 0, status: 'aprovada',
    atualizado_por: 'Danilo Lima', criado_em: iso(-8), atualizado_em: iso(-2),
    blocos: [
      {
        id: 'b1', tipo: 'texto',
        conteudo: '<h2>Busca de endereço</h2><p>Ao digitar o código, a tela deve destacar o corredor em <strong>laranja</strong> e mostrar a capacidade restante.</p><img src="https://exemplo/print.png" alt="print da tela">',
      },
      {
        id: 'b2', tipo: 'fluxo',
        conteudo: JSON.stringify({
          nos: [
            { id: 'n1', texto: 'Digita o código', x: 40, y: 40, largura: 180, altura: 64, forma: 'caixa', cor: '#7C3AED' },
            { id: 'n2', texto: 'Endereço existe?', x: 320, y: 30, largura: 170, altura: 96, forma: 'decisao', cor: '#2F6FE0' },
          ],
          ligacoes: [{ id: 'l1', de: 'n1', para: 'n2', rotulo: 'Sim' }],
        }),
      },
    ],
  },
];

/* Sem documentos gerados: o que o teste confere aqui e o estado vazio
   da secao, que e o primeiro que qualquer pessoa vai ver. */
const documentos = [];

const porTabela = { pessoas, projetos, marcos, tarefas, atualizacoes, anexos, paginas, documentos };

/* Imagem de 1x1 no lugar do arquivo real: o teste confere o layout da
   galeria, nao o conteudo da foto. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const navegador = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const pagina = await navegador.newPage({ viewport: { width: Number(process.env.LARGURA ?? 1360), height: 1000 } });

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

await pagina.route('**/storage/v1/object/public/**', async (rota) => {
  await rota.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
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

// Guarda-chuva: quadro de melhorias por situação.
await pagina.getByRole('button', { name: 'Voltar', exact: false }).first().click();
await pagina.waitForTimeout(400);
await pagina.getByText('Melhoria Sistêmica Bseller').first().click();
await pagina.waitForTimeout(800);
await pagina.screenshot({ path: 'verificacao-melhorias.png', fullPage: true });
const textoDoGrupo = (await pagina.textContent('body')) ?? '';
if (!textoDoGrupo.includes('Entrada massiva') || !textoDoGrupo.includes('concluídas')) {
  console.error('FALHOU: a lista de melhorias não montou.');
  process.exitCode = 1;
}
/* O projeto nao pode oferecer marcos, tarefas, paginas nem anexos:
   isso pertence a cada melhoria de dentro. */
for (const secao of ['Marcos', 'Nova tarefa', 'Nova página', 'Arraste arquivos aqui', 'Criar documento']) {
  if (textoDoGrupo.includes(secao)) {
    console.error(`FALHOU: o projeto ainda mostra "${secao}".`);
    process.exitCode = 1;
  }
}
/* A lista abre por padrao, com as colunas de acompanhamento. */
for (const coluna of ['Responsável', 'Prioridade', 'Prazo', 'Saúde', 'Avanço']) {
  if (!textoDoGrupo.includes(coluna)) {
    console.error(`FALHOU: a lista de melhorias não tem a coluna "${coluna}".`);
    process.exitCode = 1;
  }
}
await pagina.screenshot({ path: 'verificacao-melhorias.png', fullPage: true });

await pagina.getByRole('button', { name: 'Projetos', exact: true }).click();
await pagina.getByText('Reendereçamento do mezanino').first().click();
await pagina.waitForTimeout(700);

const texto = (await pagina.textContent('body')) ?? '';
if (!texto.includes('Marcos') || !texto.includes('Migração dos itens')) {
  console.error('FALHOU: o detalhe do projeto não carregou marcos.');
  process.exitCode = 1;
} else if (!texto.includes('Endereço existe?')) {
  console.error('FALHOU: o fluxo desenhado não apareceu na página.');
  process.exitCode = 1;
} else if (!texto.includes('Aprovada')) {
  console.error('FALHOU: a página não mostra a situação.');
  process.exitCode = 1;
} else if (!texto.includes('Comportamento da tela de endereço') || !texto.includes('Busca de endereço')) {
  console.error('FALHOU: a seção de páginas não carregou o conteúdo.');
  process.exitCode = 1;
} else if (!texto.includes('Documentos') || !texto.includes('Criar documento')) {
  console.error('FALHOU: a seção de documentos não apareceu.');
  process.exitCode = 1;
} else if (!texto.includes('Antes e depois') || !texto.includes('plano-de-endereços.pdf')) {
  console.error('FALHOU: a seção de anexos não montou a comparação ou a lista de documentos.');
  process.exitCode = 1;
} else if (erros.length) {
  console.error('FALHOU: erros de JavaScript', erros);
  process.exitCode = 1;
} else {
  console.log('OK: painel, carteira, cronograma, pessoas e detalhe renderizados sem erros.');
}

await navegador.close();
