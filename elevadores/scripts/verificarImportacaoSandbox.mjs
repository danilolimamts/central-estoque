/* Testa a importacao da planilha dentro de um iframe restrito, que e como
   a pagina publicada roda. Cobre o caso do armazenamento local bloqueado:
   mesmo sem conseguir gravar, a planilha precisa ser lida e exibida. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const PAGINA = resolve(process.argv[2]);
const PLANILHA = resolve(process.argv[3]);
const SAIDA = process.argv[4] || '.';

const html = await readFile(PAGINA, 'utf8');

/* Serve a pagina dentro de um iframe com sandbox, imitando o ambiente
   restrito onde o artefato e exibido. */
const servidor = createServer(async (req, res) => {
  if (req.url === '/interna') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body>${html}</body></html>`);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><body style="margin:0">
    <iframe src="/interna" style="width:100vw;height:100vh;border:0"
      sandbox="allow-scripts allow-downloads allow-forms allow-modals"></iframe>
  </body></html>`);
});
await new Promise((r) => servidor.listen(4180, r));

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 1000 } });

const problemas = [];
pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
pagina.on('console', (m) => {
  const t = m.text();
  // Erros de armazenamento sao esperados no sandbox: o app precisa
  // sobreviver a eles, e isso e justamente o que este teste verifica.
  if (m.type() === 'error' && !t.includes('404') && !/storage|IndexedDB|localStorage|Access/i.test(t)) {
    problemas.push(`console: ${t}`);
  }
});

await pagina.goto('http://localhost:4180', { waitUntil: 'networkidle' });
await pagina.waitForTimeout(1500);

// O iframe tem sandbox sem allow-same-origin: o armazenamento fica bloqueado.
const quadro = pagina.frameLocator('iframe');

// A tela de importacao precisa ser a primeira coisa visivel.
const tituloImport = await quadro.getByText(/Importar a planilha/i).count();
console.log('abre na tela de importacao:', tituloImport > 0 ? 'sim' : 'NAO');
await pagina.screenshot({ path: join(SAIDA, 'sb-01-importar.png') });

// Importa a planilha de verdade.
await quadro.locator('input[type=file]').first().setInputFiles(PLANILHA);
await quadro.getByRole('button', { name: /Processar planilha/i }).click();

let ok = false;
try {
  await quadro.getByRole('heading', { name: /Dashboard Geral/i }).waitFor({ timeout: 20000 });
  ok = true;
} catch {
  ok = false;
}
console.log('importacao funcionou no sandbox:', ok ? 'sim' : 'NAO');

if (ok) {
  await pagina.waitForTimeout(1500);
  await pagina.screenshot({ path: join(SAIDA, 'sb-02-dashboard.png') });
  const kpi = await quadro.locator('.num').first().textContent();
  console.log('primeiro numero na tela:', kpi?.trim());

  // Percorre as demais telas do menu lateral.
  for (const [rotulo, arquivo] of [['Status do Projeto', 'sb-03-projeto.png'], ['Elevadores', 'sb-04-elevadores.png']]) {
    await quadro.locator('.nav-item', { hasText: rotulo }).first().click();
    await pagina.waitForTimeout(1200);
    await pagina.screenshot({ path: join(SAIDA, arquivo) });
  }
} else {
  await pagina.screenshot({ path: join(SAIDA, 'sb-02-falhou.png'), fullPage: true });
  const alerta = await quadro.locator('[role=alert]').count();
  if (alerta) console.log('mensagem de erro exibida:', await quadro.locator('[role=alert]').first().textContent());
}

await navegador.close();
servidor.close();

if (!ok) problemas.push('a importacao nao concluiu dentro do sandbox');
if (problemas.length) {
  console.log('\nPROBLEMAS:\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('\nimportacao validada no ambiente restrito');
