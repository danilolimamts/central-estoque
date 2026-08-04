/* Confere o status em uma pagina de ponta a ponta: abre o app com
   dados de exemplo, clica no botao, espera a previa desenhar e salva
   o PNG exatamente como ele sai para o e-mail. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
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
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 1000 } });

const problemas = [];
pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
pagina.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) problemas.push(`console: ${m.text()}`);
});

await pagina.goto('http://localhost:4181/?exemplo', { waitUntil: 'networkidle' });
await pagina.getByRole('button', { name: 'Status do Projeto' }).click();
await pagina.waitForSelector('.eq-linha-rosca');

await pagina.getByRole('button', { name: 'Status em uma página' }).click();
await pagina.waitForSelector('.eq-previa-pagina canvas', { timeout: 8000 });
await pagina.waitForTimeout(600);

const medidas = await pagina.evaluate(() => {
  const canvas = document.querySelector('.eq-previa-pagina canvas');
  const modal = document.querySelector('.eq-modal-pagina').getBoundingClientRect();
  const acoes = [...document.querySelectorAll('.eq-modal-pagina .eq-modal-acoes .btn')];
  return {
    largura: canvas.width,
    altura: canvas.height,
    /* Pixels desenhados: um canvas em branco denuncia desenho quebrado. */
    tinta: (() => {
      const ctx = canvas.getContext('2d');
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let pintados = 0;
      for (let i = 0; i < d.length; i += 4 * 97) {
        if (d[i] !== 255 || d[i + 1] !== 255 || d[i + 2] !== 255) pintados++;
      }
      return pintados;
    })(),
    modalCabe: modal.bottom <= window.innerHeight + 1 && modal.top >= -1,
    botoes: acoes.map((b) => b.textContent.trim()),
    png: canvas.toDataURL('image/png'),
  };
});

if (medidas.largura !== 1800) problemas.push(`largura inesperada do canvas: ${medidas.largura}`);
if (medidas.altura < 800) problemas.push(`pagina curta demais: ${medidas.altura}`);
if (medidas.tinta < 200) problemas.push(`a pagina saiu quase em branco: ${medidas.tinta} amostras pintadas`);
if (!medidas.modalCabe) problemas.push('o modal passou da altura da janela');
for (const esperado of ['Copiar imagem', 'Baixar imagem', 'Copiar texto', 'Abrir no e-mail']) {
  if (!medidas.botoes.includes(esperado)) problemas.push(`botao ausente: ${esperado}`);
}

await writeFile(join(SAIDA, 'status-one-page.png'), Buffer.from(medidas.png.split(',')[1], 'base64'));
await pagina.screenshot({ path: join(SAIDA, 'status-modal.png') });
console.log({ ...medidas, png: `${medidas.png.length} bytes de data URL` });

await pagina.keyboard.press('Escape');
await pagina.waitForTimeout(300);
if (await pagina.locator('.eq-modal-pagina').count()) problemas.push('o Esc nao fechou a previa');

await navegador.close();
servidor.close();
if (problemas.length > 0) {
  console.error('\nFALHOU:\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('\nOK: pagina desenhada, modal dentro da janela e as quatro acoes de envio no lugar.');
