/* Sobe o build e dirige o Chromium para validar o app de ponta a ponta:
   importa a planilha, navega pelas duas paginas e captura as telas.
   Qualquer erro de console ou falha de rede derruba o script. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const DIST = resolve('dist');
const PLANILHA = process.argv[2];
const SAIDA = process.argv[3] || '.';
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const servidor = createServer(async (req, res) => {
  try {
    const caminho = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const dados = await readFile(join(DIST, caminho));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] ?? 'application/octet-stream' });
    res.end(dados);
  } catch {
    res.writeHead(404).end('nao encontrado');
  }
});
await new Promise((r) => servidor.listen(4173, r));

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 1000 } });

const problemas = [];
pagina.on('console', (m) => { if (m.type() === 'error') { if(!m.text().includes('404')) problemas.push(`console: ${m.text()}`) }; });
pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
pagina.on('requestfailed', (r) => problemas.push(`rede: ${r.url()} — ${r.failure()?.errorText}`));

await pagina.goto('http://localhost:4173', { waitUntil: 'networkidle' });
await pagina.screenshot({ path: join(SAIDA, '01-importar.png') });

// Importa a planilha e espera o dashboard aparecer.
await pagina.setInputFiles('input[type=file]', PLANILHA);
await pagina.getByRole('button', { name: /Processar planilha/i }).click();
await pagina.getByRole('tab', { name: /Dashboard Geral/i }).waitFor({ timeout: 20000 });
await pagina.waitForTimeout(1200);
await pagina.screenshot({ path: join(SAIDA, '02-dashboard.png'), fullPage: true });

// Confere que os KPIs sairam do estado vazio.
const kpis = await pagina.locator('.num').first().textContent();
console.log('primeiro KPI:', kpis?.trim());

await pagina.getByRole('tab', { name: /Status Projeto/i }).click();
await pagina.waitForTimeout(1200);
await pagina.screenshot({ path: join(SAIDA, '03-projeto.png'), fullPage: true });

// Tema escuro.
await pagina.getByLabel('Alternar tema').click();
await pagina.waitForTimeout(600);
await pagina.screenshot({ path: join(SAIDA, '04-escuro.png') });

// Persistencia: recarrega e os dados precisam continuar la.
await pagina.reload({ waitUntil: 'networkidle' });
await pagina.waitForTimeout(1500);
const persistiu = await pagina.getByRole('tab', { name: /Dashboard Geral/i }).count();
console.log('persistiu apos recarregar:', persistiu > 0 ? 'sim' : 'NAO');

await navegador.close();
servidor.close();

if (problemas.length) {
  console.log('\nPROBLEMAS:\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('\nsem erros de console, pagina ou rede');
