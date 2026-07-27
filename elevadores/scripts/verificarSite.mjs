/* Serve a pasta publicada no mesmo caminho do GitHub Pages e confere
   que o app sobe, importa a planilha e mostra a tabela de chaves. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';

const RAIZ = resolve('..');
const PLAN = resolve(process.argv[2]);
const SAIDA = process.argv[3] || '.';
const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.json':'application/json', '.svg':'image/svg+xml' };

const srv = createServer(async (req, res) => {
  try {
    let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    caminho = caminho.replace(/^\/central-estoque/, '');
    if (caminho.endsWith('/')) caminho += 'index.html';
    const arq = join(RAIZ, caminho);
    const dados = await readFile(arq);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arq)] || 'application/octet-stream' });
    res.end(dados);
  } catch {
    res.writeHead(404); res.end('nao encontrado');
  }
});
await new Promise((r) => srv.listen(4200, r));

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await nav.newPage({ viewport: { width: 1440, height: 1000 } });
const falhas = [];
p.on('pageerror', (e) => falhas.push(`pageerror: ${e.message}`));
p.on('response', (r) => { if (r.status() >= 400) falhas.push(`${r.status()} ${r.url()}`); });

const URL_SITE = 'http://localhost:4200/central-estoque/equalizacao-elevadores/';
await p.goto(URL_SITE, { waitUntil: 'networkidle' });
console.log('app carregou:', (await p.locator('.sidebar').count()) ? 'sim' : 'NAO');
console.log('logo carregou:', await p.locator('.brand-logo-img').evaluate((i) => i.complete && i.naturalWidth > 0));

await p.locator('input[type=file]').first().setInputFiles(PLAN);
await p.getByRole('button', { name: /Processar planilha/i }).click();
try {
  await p.getByRole('heading', { name: /Conjuntos por chave/i }).first().waitFor({ timeout: 20000 });
} catch {
  await p.screenshot({ path: join(SAIDA, 'site-erro.png'), fullPage: true });
  console.log('NAO chegou na tabela. Texto visivel:', (await p.locator('body').innerText()).slice(0, 400));
  throw new Error('parou apos importar');
}
await p.waitForTimeout(800);
console.log('abre na tabela de chaves: sim');
const linhas = await p.locator('tbody tr').count();
console.log('linhas na tabela (com o total):', linhas);
await p.screenshot({ path: join(SAIDA, 'site-01-chaves.png'), fullPage: true });

await nav.close();
srv.close();
if (falhas.length) { console.log('\nFALHAS:\n' + falhas.join('\n')); process.exit(1); }
console.log('\nsite validado no caminho publicado');
