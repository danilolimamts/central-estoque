/* Confere a gaveta do "Nao identificado" na tabela de divergencias por
   fornecedor: clicar na linha precisa abrir os produtos que nao acharam
   fornecedor, com codigo e descricao, e a soma dos casos ali dentro tem
   que fechar com o numero da linha. Uma lista que nao fecha e pior que
   nenhuma lista: manda cadastrar a coisa errada. */
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
await new Promise((r) => servidor.listen(4198, r));

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const problemas = [];
const pagina = await navegador.newPage({ viewport: { width: 1500, height: 1000 } });
pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));

await pagina.goto('http://localhost:4198/?exemplo', { waitUntil: 'networkidle' });
await pagina.waitForTimeout(900);

const sac = pagina.locator('.panel', { hasText: 'Inversões e faltas' }).first();
await sac.scrollIntoViewIfNeeded();
await pagina.waitForTimeout(400);

const linha = sac.locator('tr.eq-sac-sem-cadastro', { hasText: 'Não identificado' }).first();
if ((await linha.count()) === 0) {
  problemas.push('a linha do "Não identificado" nao aparece na tabela por fornecedor');
} else {
  const casosDaLinha = Number((await linha.locator('td').nth(1).textContent())?.trim());

  /* Fechada por padrao: a gaveta e detalhe de uma linha so. */
  if ((await sac.locator('.eq-sac-itens').count()) > 0) {
    problemas.push('a lista de produtos ja comeca aberta');
  }

  await linha.locator('button.eq-sac-abrir').click();
  await pagina.waitForTimeout(300);

  const itens = await sac.locator('.eq-sac-itens tbody tr').evaluateAll((linhas) =>
    linhas.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()))
  );
  if (itens.length === 0) problemas.push('a gaveta abriu vazia');

  /* Toda linha precisa de descricao: e o que o usuario pediu para ver. */
  for (const [codigo, descricao] of itens) {
    if (!descricao) problemas.push(`o produto ${codigo} abriu sem descricao`);
  }

  const soma = itens.reduce((s, [, , casos]) => s + Number(casos), 0);
  if (soma !== casosDaLinha) {
    problemas.push(`a gaveta soma ${soma} casos e a linha diz ${casosDaLinha}`);
  }
  console.log('casos na linha:', casosDaLinha, '| produtos listados:', itens.length);
  console.log('primeiro produto:', JSON.stringify(itens[0]));

  await sac.scrollIntoViewIfNeeded();
  await pagina.screenshot({ path: join(SAIDA, 'sac-nao-identificado.png') });

  /* E fecha de novo no mesmo clique. */
  await linha.locator('button.eq-sac-abrir').click();
  await pagina.waitForTimeout(300);
  if ((await sac.locator('.eq-sac-itens').count()) > 0) {
    problemas.push('o segundo clique nao fechou a gaveta');
  }
}

await navegador.close();
servidor.close();
if (problemas.length > 0) {
  console.error('\nFALHOU:\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('\nOK: a gaveta abre com codigo e descricao, fecha a conta e fecha no clique.');
