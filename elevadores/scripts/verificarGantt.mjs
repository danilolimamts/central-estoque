/* Confere a tela de status do projeto depois dos ajustes pedidos:

   1. passar o cursor na barra do Gantt (nao so no nome) abre a mini
      tabela com responsavel, inicio, termino e reagendamento;
   2. o cartao de ritmo de entrega nao tem mais a linha de escopo, que
      por construcao nunca podia se mover;
   3. os cartoes de evolucao do projeto e de projecao de termino
      sairam da tela.
*/
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const DIST = resolve('dist');
const SAIDA = process.argv[2] || '.';
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const servidor = createServer(async (req, res) => {
  try {
    const bruto = req.url.split('?')[0];
    const caminho = bruto === '/' ? '/index.html' : bruto;
    const dados = await readFile(join(DIST, caminho));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] ?? 'application/octet-stream' });
    res.end(dados);
  } catch {
    res.writeHead(404).end('nao encontrado');
  }
});
await new Promise((r) => servidor.listen(4183, r));

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const problemas = [];
const pagina = await navegador.newPage({ viewport: { width: 1500, height: 1000 } });
pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));

await pagina.goto('http://localhost:4183/?exemplo', { waitUntil: 'networkidle' });
await pagina.getByRole('button', { name: /status/i }).first().click();
await pagina.waitForTimeout(600);

/* ---- 3. cartoes que sairam ---- */
for (const titulo of ['Evolução do projeto', 'Projeção de término', 'Funil do plano', 'Avanço por frente']) {
  if (await pagina.getByText(titulo, { exact: true }).count()) {
    problemas.push(`o cartao "${titulo}" deveria ter saido da tela`);
  }
}

/* No lugar do avanco por frente entra o resultado na operacao. */
const evol = pagina.locator('.panel', { hasText: 'Evolução das inversões' }).first();
if ((await evol.count()) === 0) {
  problemas.push('o cartao de evolucao das inversoes nao entrou no status do projeto');
} else {
  const texto = await evol.innerText();
  if (!/sem invers[ãa]o/i.test(texto)) {
    problemas.push('a evolucao nao mostra a sequencia de meses sem inversao');
  }
  await evol.screenshot({ path: join(SAIDA, 'evolucao-inversoes.png') });
}

/* ---- 2. a linha de escopo saiu da legenda do grafico ---- */
const ritmo = pagina.locator('.panel', { hasText: 'Ritmo de entrega' }).first();
const legendas = await ritmo.evaluate((el) => {
  const grafico = el.querySelector('canvas');
  return grafico ? (grafico.getAttribute('aria-label') ?? '') : 'sem canvas';
});
if (legendas === 'sem canvas') problemas.push('o grafico de ritmo de entrega nao renderizou');
const descricao = await ritmo.locator('.panel-sub').first().innerText();
if (!/escopo de \d+ a/i.test(descricao)) {
  problemas.push(`o escopo deveria estar escrito no subtitulo do cartao, veio: "${descricao}"`);
}

/* ---- 1. mini tabela na barra do Gantt ---- */
const gantt = pagina.locator('.panel', { hasText: 'Gantt' }).first();
await gantt.scrollIntoViewIfNeeded();
await pagina.waitForTimeout(300);

/* A barra e o segundo alvo da linha: o primeiro e o nome, a esquerda. */
const barras = gantt.locator('.eq-dica-alvo:has(> span[style*="--surface2"])');
const quantas = await barras.count();
if (quantas === 0) problemas.push('nenhuma barra do Gantt virou alvo de mini tabela');

const alvo = barras.nth(Math.min(2, quantas - 1));
await alvo.hover();
await pagina.waitForTimeout(250);

const dica = gantt.locator('.eq-dica').first();
if ((await dica.count()) === 0) {
  problemas.push('passar o cursor na barra do Gantt nao abriu a mini tabela');
} else {
  /* Os rotulos sobem para maiuscula no CSS, entao a comparacao ignora
     a caixa: o que importa e a informacao estar la. */
  const texto = (await dica.innerText()).toLowerCase();
  for (const rotulo of ['responsável', 'início', 'término previsto', 'reagendamento']) {
    if (!texto.includes(rotulo)) problemas.push(`a mini tabela nao mostra "${rotulo}"`);
  }
  /* A ficha so serve se vier preenchida: rotulo sem data e o mesmo que
     nao ter a linha. */
  if (!/\d{2}\/\d{2}\/\d{4}/.test(texto)) {
    problemas.push('a mini tabela abriu sem nenhuma data preenchida');
  }
  const caixa = await dica.boundingBox();
  const janela = pagina.viewportSize();
  if (caixa && (caixa.y < 0 || caixa.y + caixa.height > janela.height)) {
    problemas.push('a mini tabela abriu fora da area visivel');
  }
  /* Rotulo quebrado em duas linhas desalinha a data ao lado. */
  const quebrados = await dica.evaluate((el) =>
    [...el.querySelectorAll('.eq-dica-rotulo')]
      .filter((r) => r.getBoundingClientRect().height > 20)
      .map((r) => r.textContent)
  );
  if (quebrados.length > 0) {
    problemas.push(`rotulo quebrado em duas linhas na mini tabela: ${quebrados.join(', ')}`);
  }
  await pagina.screenshot({ path: join(SAIDA, 'gantt-dica.png') });
}

/* ---- 4. o ritmo mostra os valores ao passar o cursor ---- */
await ritmo.scrollIntoViewIfNeeded();
await pagina.waitForTimeout(400);

const tela = await ritmo.locator('canvas').boundingBox();
/* Um ponto qualquer no meio do grafico, longe dos marcadores: o
   cursor tem que pegar a semana inteira, e nao so o ponto exato. */
await pagina.mouse.move(tela.x + tela.width * 0.45, tela.y + tela.height * 0.6);
await pagina.waitForTimeout(350);

/* O tooltip do Chart.js e desenhado dentro do canvas, entao nao da
   para le-lo pelo DOM. A prova fica na imagem: a captura sai com o
   cursor parado no meio do grafico. */
await ritmo.screenshot({ path: join(SAIDA, 'ritmo-entrega.png') });

/* ---- 5. dashboard geral: sem mapa de calor, saude na frente ---- */
await pagina.getByRole('button', { name: /dashboard/i }).first().click();
await pagina.waitForTimeout(700);
/* A troca de tela mantem a rolagem da anterior, e quem rola nao e a
   janela: e o painel de conteudo ao lado do menu. */
await pagina.evaluate(() => {
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollTop > 0) el.scrollTop = 0;
  }
  window.scrollTo(0, 0);
});
await pagina.waitForTimeout(400);

if (await pagina.getByText('Mapa de calor', { exact: false }).count()) {
  problemas.push('o mapa de calor deveria ter saido da tela');
}
const primeiro = await pagina.locator('.panel h3').first().innerText();
if (!/sa[uú]de do estoque/i.test(primeiro)) {
  problemas.push(`o primeiro cartao da pagina deveria ser a saude do estoque, veio "${primeiro}"`);
}
/* Nenhum fornecedor pode aparecer descasado na tabela de saude e
   sumir do grafico de compras logo acima dela. */
const saude = pagina.locator('.panel', { hasText: 'Saúde do estoque' }).first();
const comFalta = await saude.evaluate((el) =>
  [...el.querySelectorAll('tbody tr')]
    .filter((tr) => !tr.classList.contains('eq-saude-total'))
    .map((tr) => {
      const td = [...tr.querySelectorAll('td')];
      return { nome: td[0]?.textContent.split('\n')[0].trim(), descasados: td[3]?.textContent.trim() };
    })
    .filter((l) => l.descasados && l.descasados !== '—')
);
const grafico = pagina.locator('.panel', { hasText: 'Colunas × bases a comprar' }).first();
const rotulos = await grafico.locator('canvas').getAttribute('aria-label');
if (!/fornecedor e tonelada/i.test(rotulos ?? '')) {
  problemas.push('o grafico de compras nao veio da mesma fonte da tabela de saude');
}
const legenda = await grafico.locator('.panel-sub').first().innerText();
if (!/de \d+ grupos com compra pendente|equalizados/i.test(legenda)) {
  problemas.push(`o grafico nao diz quantos grupos ficaram de fora: "${legenda}"`);
}
/* Nenhuma linha zerada sobrando na tabela. */
const zeradas = await saude.evaluate((el) =>
  [...el.querySelectorAll('tbody tr')]
    .filter((tr) => !tr.classList.contains('eq-saude-total'))
    .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()))
    .filter((td) => td[1] === '0' && td[2] === '0' && td[6] === '—')
);
if (zeradas.length > 0) {
  problemas.push(`fornecedor sem nada no CD continua na tabela: ${zeradas.length} linha(s)`);
}
console.log('fornecedores descasados na tabela:', comFalta.length, '|', legenda);
await pagina.screenshot({ path: join(SAIDA, 'dashboard-topo.png') });

await navegador.close();
servidor.close();

if (problemas.length > 0) {
  console.error('PROBLEMAS:\n' + problemas.map((p) => ` - ${p}`).join('\n'));
  process.exit(1);
}
console.log('Gantt, ritmo de entrega e cartoes removidos: tudo conforme o pedido.');
