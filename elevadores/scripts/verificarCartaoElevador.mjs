/* Confere o cartao da tela de Elevadores: a foto nao pode passar da
   moldura e invadir o nome do item, e o selo da quantidade precisa
   aparecer. Sobe o build, abre com dados de exemplo e mede as caixas. */
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
await new Promise((r) => servidor.listen(4179, r));

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 1000 } });

const problemas = [];
pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
/* O catalogo de fotos e bloqueado pela rede deste ambiente. O app ja trata
   isso com o aviso no lugar da imagem, entao nao conta como problema. */
const RUIDO = ['404', 'ERR_TUNNEL_CONNECTION_FAILED', 'lojadomecanico'];
pagina.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !RUIDO.some((r) => t.includes(r))) problemas.push(`console: ${t}`);
});

await pagina.goto('http://localhost:4179/?exemplo', { waitUntil: 'networkidle' });
await pagina.getByRole('button', { name: 'Elevadores' }).click();
await pagina.waitForSelector('.eq-elev-card');

/* Foto retangular bem mais alta que a moldura: o pior caso do recorte. */
const alta = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="900"><rect width="200" height="900" fill="#c62828"/></svg>'
).toString('base64');
await pagina.evaluate((src) => {
  for (const box of document.querySelectorAll('.eq-elev-foto')) {
    box.querySelector('.eq-foto-erro')?.remove();
    const img = document.createElement('img');
    img.src = src;
    box.prepend(img);
  }
}, alta);
await pagina.waitForTimeout(400);

const medidas = await pagina.evaluate(() => {
  const cartao = document.querySelector('.eq-elev-card');
  const caixa = cartao.querySelector('.eq-elev-foto').getBoundingClientRect();
  const img = cartao.querySelector('.eq-elev-foto img').getBoundingClientRect();
  const nome = cartao.querySelector('.eq-elev-nome').getBoundingClientRect();
  return {
    fundoFoto: caixa.bottom, fundoImagem: img.bottom, topoNome: nome.top,
    selo: cartao.querySelector('.eq-elev-qtd')?.textContent ?? '',
    nome: cartao.querySelector('.eq-elev-nome').textContent,
    pecas: cartao.querySelector('.eq-elev-pecas').textContent,
    cartoes: document.querySelectorAll('.eq-elev-card').length,
  };
});

if (medidas.fundoImagem > medidas.fundoFoto + 0.5) {
  problemas.push(`imagem passa da moldura: ${medidas.fundoImagem} > ${medidas.fundoFoto}`);
}
if (medidas.topoNome < medidas.fundoFoto - 0.5) {
  problemas.push(`o nome comeca antes do fim da foto: ${medidas.topoNome} < ${medidas.fundoFoto}`);
}
if (!/\d/.test(medidas.selo)) problemas.push('selo de quantidade sem numero');

await pagina.screenshot({ path: join(SAIDA, 'elevadores-cartao.png'), fullPage: false });
console.log(medidas);

await navegador.close();
servidor.close();
if (problemas.length > 0) {
  console.error('\nFALHOU:\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('\nOK: foto recortada na moldura, nome abaixo dela e quantidade no selo.');
