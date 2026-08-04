/* Confere o boletim do Status do Projeto de ponta a ponta: abre o app
   com dados de exemplo, clica em Gerar boletim, espera a captura e
   salva o PNG exatamente como ele sai para o e-mail.

   O que importa aqui e que a imagem seja o painel de verdade: precisa
   ter os graficos, a faixa da marca e nao pode conter os filtros, a
   tabela detalhada nem o proprio modal. */
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
/* Os graficos sao canvas: sem esta pausa a captura pega a tela antes
   de o Chart.js terminar de desenhar. */
await pagina.waitForTimeout(1200);

await pagina.getByRole('button', { name: 'Gerar boletim' }).click();
await pagina.waitForSelector('.eq-previa-pagina canvas', { timeout: 20000 });
await pagina.waitForTimeout(800);

const medidas = await pagina.evaluate(() => {
  const canvas = document.querySelector('.eq-previa-pagina canvas');
  const modal = document.querySelector('.eq-modal-pagina').getBoundingClientRect();
  const acoes = [...document.querySelectorAll('.eq-modal-pagina .eq-modal-acoes .btn')];
  const ctx = canvas.getContext('2d');
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  /* Amostra as cores: um boletim de verdade tem o navy da marca, e nao
     pode ser uma chapa de fundo cinza. */
  let pintados = 0;
  let navy = 0;
  for (let i = 0; i < d.length; i += 4 * 53) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    if (r !== 241 || g !== 242 || b !== 246) pintados++;
    if (b > 90 && b - r > 60 && r < 90) navy++;
  }
  return {
    largura: canvas.width,
    altura: canvas.height,
    pintados,
    navy,
    modalCabe: modal.bottom <= window.innerHeight + 1 && modal.top >= -1,
    botoes: acoes.map((b) => b.textContent.trim()),
    png: canvas.toDataURL('image/png'),
  };
});

if (medidas.altura < medidas.largura) {
  problemas.push(`o boletim deveria ser mais alto que largo: ${medidas.largura}x${medidas.altura}`);
}
if (medidas.pintados < 500) problemas.push(`a imagem saiu quase vazia: ${medidas.pintados} amostras`);
if (medidas.navy < 50) problemas.push(`sem o navy da marca na imagem: ${medidas.navy} amostras`);
if (!medidas.modalCabe) problemas.push('o modal passou da altura da janela');
for (const esperado of ['Copiar boletim', 'Baixar imagem', 'Copiar texto', 'Abrir no e-mail']) {
  if (!medidas.botoes.includes(esperado)) problemas.push(`botao ausente: ${esperado}`);
}

await writeFile(join(SAIDA, 'boletim-status.png'), Buffer.from(medidas.png.split(',')[1], 'base64'));
await pagina.screenshot({ path: join(SAIDA, 'boletim-modal.png') });
console.log({ ...medidas, png: `${medidas.png.length} bytes de data URL` });

/* A pagina viva nao pode ter sido mexida pela captura. */
const intacta = await pagina.evaluate(() => ({
  filtros: document.querySelectorAll('.fora-do-boletim').length,
  cartoes: document.querySelectorAll('.panel').length,
  faixaVazou: document.querySelectorAll('.eq-boletim-topo').length,
}));
if (intacta.faixaVazou > 0) problemas.push('a faixa do boletim vazou para a pagina viva');
if (intacta.filtros === 0) problemas.push('os blocos marcados sumiram da pagina viva');
console.log('pagina apos a captura:', intacta);

await pagina.keyboard.press('Escape');
await pagina.waitForTimeout(300);
if (await pagina.locator('.eq-modal-pagina').count()) problemas.push('o Esc nao fechou a previa');

await navegador.close();
servidor.close();
if (problemas.length > 0) {
  console.error('\nFALHOU:\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('\nOK: boletim capturado do painel, com a marca, e a pagina viva intacta.');
