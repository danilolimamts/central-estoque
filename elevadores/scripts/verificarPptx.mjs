/* Clica no botao de PowerPoint no app real e confere o arquivo baixado. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const html = await readFile(resolve(process.argv[2]), 'utf8');
const PLAN = resolve(process.argv[3]);
const SAIDA = process.argv[4];

const srv = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body>${html}</body></html>`);
});
await new Promise((r) => srv.listen(4190, r));

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

await p.goto('http://localhost:4190', { waitUntil: 'networkidle' });
await p.locator('input[type=file]').first().setInputFiles(PLAN);
await p.getByRole('button', { name: /Processar planilha/i }).click();
await p.getByRole('heading', { name: /Dashboard Geral/i }).waitFor({ timeout: 20000 });

await p.locator('.nav-item', { hasText: 'Status do Projeto' }).first().click();
await p.waitForTimeout(1000);
await p.screenshot({ path: join(SAIDA, 'pptx-01-tela.png') });

for (const recorte of ['executivo', 'completo', 'atrasos', 'responsavel']) {
  await p.locator('select').filter({ hasText: /Apresentação/ }).selectOption(recorte);
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 30000 }),
    p.getByRole('button', { name: /Baixar PowerPoint/i }).click(),
  ]);
  const destino = join(SAIDA, dl.suggestedFilename());
  await dl.saveAs(destino);
  const { size } = await stat(destino);
  console.log(`${recorte}: ${dl.suggestedFilename()} (${(size / 1024).toFixed(0)} KB)`);
}

await nav.close();
srv.close();
if (erros.length) { console.log('ERROS:', erros.join('; ')); process.exit(1); }
console.log('download validado no navegador');
