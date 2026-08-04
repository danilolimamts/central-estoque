/* Confere o cartao da tela de Elevadores: a ordem tem que ser foto, nome
   e quantidade, sem nenhum texto por cima da imagem. Sobe o build, abre
   com dados de exemplo e mede as caixas. */
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
const RUIDO = ['404'];
pagina.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !RUIDO.some((r) => t.includes(r))) problemas.push(`console: ${t}`);
});

/* Foto retangular bem mais alta que a moldura: o pior caso do recorte.
   O catalogo publico e bloqueado pela rede deste ambiente, entao a resposta
   e substituida aqui para o app seguir o mesmo caminho de sempre. */
const ALTA =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="900"><rect width="200" height="900" fill="#c62828"/></svg>';
await pagina.route('**/*', (rota) => {
  const url = rota.request().url();
  if (url.startsWith('http://localhost:4179')) return rota.continue();
  return rota.fulfill({ status: 200, contentType: 'image/svg+xml', body: ALTA });
});

await pagina.goto('http://localhost:4179/?exemplo', { waitUntil: 'networkidle' });
await pagina.getByRole('button', { name: 'Elevadores' }).click();
await pagina.waitForSelector('.eq-elev-card');
await pagina.waitForTimeout(500);

const medidas = await pagina.evaluate(() => {
  const cartao = document.querySelector('.eq-elev-card');
  const caixa = cartao.querySelector('.eq-elev-foto').getBoundingClientRect();
  const img = cartao.querySelector('.eq-elev-foto img').getBoundingClientRect();
  const nome = cartao.querySelector('.eq-elev-nome').getBoundingClientRect();
  const qtd = cartao.querySelector('.eq-elev-qtd').getBoundingClientRect();
  return {
    fundoFoto: caixa.bottom, fundoImagem: img.bottom,
    topoNome: nome.top, fundoNome: nome.bottom, topoQtd: qtd.top,
    quantidadeDentroDaFoto: cartao.querySelector('.eq-elev-foto .eq-elev-qtd') !== null,
    selo: cartao.querySelector('.eq-elev-qtd').textContent,
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
/* Ordem pedida: imagem, nome e quantidade, cada um na sua faixa. */
if (medidas.quantidadeDentroDaFoto) problemas.push('a quantidade ainda esta dentro da moldura da foto');
if (medidas.topoQtd < medidas.fundoFoto - 0.5) {
  problemas.push(`a quantidade sobrepoe a foto: ${medidas.topoQtd} < ${medidas.fundoFoto}`);
}
if (medidas.topoQtd < medidas.fundoNome - 0.5) {
  problemas.push(`a quantidade nao ficou abaixo do nome: ${medidas.topoQtd} < ${medidas.fundoNome}`);
}
if (!/\d/.test(medidas.selo)) problemas.push('quantidade sem numero');
if (!/Elevador/i.test(medidas.selo)) problemas.push(`quantidade sem a palavra Elevador: "${medidas.selo}"`);

await pagina.screenshot({ path: join(SAIDA, 'elevadores-cartao.png'), fullPage: false });
console.log(medidas);

/* Clicar na foto abre a ampliacao, e o Esc fecha. */
await pagina.locator('.eq-elev-lupa').first().click();
await pagina.waitForSelector('.eq-lupa-fundo', { timeout: 3000 });
const grande = await pagina.evaluate(() => {
  const img = document.querySelector('.eq-lupa img').getBoundingClientRect();
  const moldura = document.querySelector('.eq-elev-foto').getBoundingClientRect();
  return { alturaAmpliada: Math.round(img.height), alturaNoCartao: Math.round(moldura.height) };
});
/* A imagem ampliada tem que passar bem da moldura do cartao, senao o
   clique nao resolveu o problema de enxergar a foto. */
if (grande.alturaAmpliada < grande.alturaNoCartao * 2) {
  problemas.push(`a foto ampliada nao ficou maior: ${JSON.stringify(grande)}`);
}
await pagina.screenshot({ path: join(SAIDA, 'elevadores-lupa.png') });
await pagina.keyboard.press('Escape');
await pagina.waitForTimeout(300);
if (await pagina.locator('.eq-lupa-fundo').count()) problemas.push('o Esc nao fechou a foto ampliada');
console.log('ampliacao:', grande);

await navegador.close();
servidor.close();
if (problemas.length > 0) {
  console.error('\nFALHOU:\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('\nOK: foto recortada na moldura, nome abaixo dela, quantidade abaixo do nome e clique que amplia.');
