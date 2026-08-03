/* Confere a lista de compra por fornecedor no Dashboard Geral: os grupos,
   o recorte de descasados e a foto que abre ao passar o cursor. */
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
await new Promise((r) => servidor.listen(4181, r));

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pagina = await navegador.newPage({ viewport: { width: 1500, height: 1050 } });
const problemas = [];
pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
pagina.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) problemas.push(`console: ${m.text()}`); });

/* A rede deste ambiente bloqueia o catalogo de fotos; a resposta e
   substituida para o caminho da imagem ser o mesmo de sempre. */
const FOTO = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c62828"/></svg>';
await pagina.route('**/*', (rota) =>
  rota.request().url().startsWith('http://localhost:4181')
    ? rota.continue()
    : rota.fulfill({ status: 200, contentType: 'image/svg+xml', body: FOTO })
);

await pagina.goto('http://localhost:4181/?exemplo', { waitUntil: 'networkidle' });
await pagina.getByRole('button', { name: 'Dashboard Geral' }).click();
await pagina.waitForSelector('.eq-forn-cab');

/* So o cartao da lista de compra, senao as outras tabelas do painel
   entram na conta. */
const NO_CARTAO = () => {
  const cartao = document.querySelector('.eq-forn-cab').closest('.panel');
  return {
    fornecedores: [...cartao.querySelectorAll('.eq-forn-cab strong')].map((e) => e.textContent),
    toneladas: [...cartao.querySelectorAll('.eq-forn-ton td')].map((e) => e.textContent.trim()),
    linhas: cartao.querySelectorAll('tbody tr:not(.eq-forn-cab):not(.eq-forn-ton)').length,
    descasadas: cartao.querySelectorAll('tr.eq-forn-alerta').length,
    resumo: cartao.querySelector('.panel-sub')?.textContent ?? '',
  };
};
const antes = await pagina.evaluate(NO_CARTAO);
if (antes.fornecedores.length === 0) problemas.push('nenhum grupo de fornecedor');
if (antes.toneladas.length === 0) problemas.push('nenhum grupo de tonelada');
/* No recorte inicial so entram itens descasados. */
if (antes.linhas !== antes.descasadas) {
  problemas.push(`o filtro de descasados deixou passar item casado: ${antes.linhas} linhas, ${antes.descasadas} marcadas`);
}
console.log('grupos:', antes.fornecedores.slice(0, 4), '| toneladas:', antes.toneladas.slice(0, 3));
console.log('linhas de componente:', antes.linhas, '|', antes.resumo);

/* Foto ao passar o cursor no codigo do elevador. */
await pagina.locator('.eq-forn-item button').first().hover();
await pagina.waitForTimeout(400);
const foto = await pagina.locator('[role=tooltip] img').count();
if (foto === 0) problemas.push('a foto nao abriu ao passar o cursor no item');
await pagina.locator('.eq-forn-cab').first().scrollIntoViewIfNeeded();
await pagina.mouse.move(5, 5);
await pagina.waitForTimeout(200);
await pagina.screenshot({ path: join(SAIDA, 'fornecedores.png') });

/* Mostrar todos os itens tem que trazer linhas casadas junto. */
await pagina.getByRole('button', { name: 'Todos os itens' }).click();
await pagina.waitForTimeout(400);
const depois = await pagina.evaluate(NO_CARTAO);
if (depois.linhas <= antes.linhas) problemas.push('o recorte "todos" nao trouxe mais linhas');
console.log('linhas com todos os itens:', depois.linhas, '| foto no hover:', foto > 0);

/* A caixa do saldo do CD amarra os componentes do mesmo elevador. */
const caixa = await pagina.evaluate(() => {
  const cartao = document.querySelector('.eq-forn-cab').closest('.panel');
  const saldos = cartao.querySelectorAll('.eq-forn-saldo');
  const inicios = cartao.querySelectorAll('.eq-forn-saldo.inicio');
  const fins = cartao.querySelectorAll('.eq-forn-saldo.fim');
  const totais = [...cartao.querySelectorAll('.eq-forn-saldo-total')].map((e) => e.textContent);
  return { saldos: saldos.length, inicios: inicios.length, fins: fins.length, totais };
});
if (caixa.saldos === 0) problemas.push('a coluna do saldo perdeu a caixa do item pai');
if (caixa.inicios !== caixa.fins) problemas.push(`caixa aberta sem fechar: ${caixa.inicios} inicios, ${caixa.fins} fins`);
if (caixa.totais.length !== caixa.fins) problemas.push('faltou o total de base e coluna no fim da caixa');
console.log('caixas do saldo:', caixa.inicios, '| exemplo de total:', caixa.totais[0]);

/* Botao de compartilhar: monta a mensagem do e-mail. */
await pagina.getByRole('button', { name: 'Compartilhar' }).click();
await pagina.waitForSelector('.eq-compartilhar-texto', { timeout: 3000 });
const mensagem = await pagina.inputValue('.eq-compartilhar-texto');
for (const esperado of ['Itens descasados no CD', 'No CD hoje:', 'Total ']) {
  if (!mensagem.includes(esperado)) problemas.push(`a mensagem nao traz "${esperado}"`);
}
if (/[\u2013\u2014]/.test(mensagem)) problemas.push('a mensagem tem travessao');
await pagina.screenshot({ path: join(SAIDA, 'compartilhar.png') });
await pagina.keyboard.press('Escape');
await pagina.waitForTimeout(300);
if (await pagina.locator('.eq-compartilhar-texto').count()) problemas.push('o Esc nao fechou a janela de compartilhar');
console.log('mensagem do e-mail:', mensagem.length, 'caracteres');

await navegador.close();
servidor.close();
if (problemas.length > 0) {
  console.error('\nFALHOU:\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('\nOK: agrupado por fornecedor e tonelada, descasados marcados e foto no cursor.');
