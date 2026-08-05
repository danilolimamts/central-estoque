/* Confere o menu lateral recolhido: no trilho de icones nenhum rotulo
   pode aparecer cortado, nao pode sobrar barra de rolagem horizontal e
   o botao de recolher precisa continuar clicavel para expandir de
   volta - inclusive em tela estreita, onde antes o menu zerava a
   largura e nao havia como traze-lo de volta. */
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
await new Promise((r) => servidor.listen(4180, r));

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const problemas = [];

/* Mede o menu no estado atual: largura, se rola de lado e se algum
   texto ficou maior que a caixa que o contem (o corte no meio da
   palavra que deixava o menu feio). */
async function medir(pagina) {
  return pagina.evaluate(() => {
    const menu = document.querySelector('.sidebar');
    const nav = document.querySelector('.sidebar-nav');
    const cortados = [];
    for (const alvo of document.querySelectorAll('.nav-item, .nav-section-label, .theme-toggle')) {
      const visivel = getComputedStyle(alvo).display !== 'none';
      if (visivel && alvo.scrollWidth > alvo.clientWidth + 1) {
        cortados.push(`${alvo.className}: ${alvo.scrollWidth} > ${alvo.clientWidth}`);
      }
    }
    return {
      largura: Math.round(menu.getBoundingClientRect().width),
      rolaDeLado: nav.scrollWidth > nav.clientWidth + 1,
      cortados,
      rotulosVisiveis: [...document.querySelectorAll('.nav-item span')]
        .filter((s) => getComputedStyle(s).display !== 'none').length,
    };
  });
}

async function abrir(largura, altura) {
  const pagina = await navegador.newPage({ viewport: { width: largura, height: altura } });
  pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
  await pagina.goto('http://localhost:4180/?exemplo', { waitUntil: 'networkidle' });
  await pagina.waitForSelector('.sidebar-nav');
  return pagina;
}

/* ---- Tela larga: expandido -> recolhido -> expandido ---- */
const larga = await abrir(1440, 900);
const expandido = await medir(larga);
/* Quantas telas o menu tem hoje. Se mudar, e para o teste avisar: o
   numero errado aqui costuma ser item perdido, nao teste desatualizado. */
const TELAS = 4;
if (expandido.rotulosVisiveis !== TELAS) {
  problemas.push(`menu aberto deveria mostrar ${TELAS} rotulos, mostrou ${expandido.rotulosVisiveis}`);
}

await larga.locator('.sidebar-toggle').click();
await larga.waitForTimeout(300);
const trilho = await medir(larga);
if (trilho.largura >= expandido.largura) {
  problemas.push(`recolher nao estreitou o menu: ${trilho.largura} >= ${expandido.largura}`);
}
if (trilho.rotulosVisiveis !== 0) {
  problemas.push(`o trilho ainda mostra ${trilho.rotulosVisiveis} rotulo(s) cortado(s)`);
}
if (trilho.cortados.length > 0) {
  problemas.push(`texto cortado no trilho: ${trilho.cortados.join(' | ')}`);
}
if (trilho.rolaDeLado) problemas.push('o trilho ficou com barra de rolagem horizontal');
await larga.screenshot({ path: join(SAIDA, 'menu-recolhido.png'), fullPage: false });

/* O botao tem que continuar alcancavel para desfazer o recolhimento. */
await larga.locator('.sidebar-toggle').click();
await larga.waitForTimeout(300);
const devolta = await medir(larga);
if (devolta.largura !== expandido.largura) {
  problemas.push(`nao voltou ao tamanho aberto: ${devolta.largura} != ${expandido.largura}`);
}
console.log('tela larga:', { expandido, trilho, devolta });

/* ---- Tela estreita: o menu nao pode sumir ---- */
const estreita = await abrir(600, 900);
const estreitoAberto = await medir(estreita);
if (estreitoAberto.largura < 40) {
  problemas.push(`em tela estreita o menu quase sumiu: ${estreitoAberto.largura}px`);
}
const clicavel = await estreita.locator('.sidebar-toggle').isVisible();
if (!clicavel) problemas.push('em tela estreita o botao de recolher nao esta visivel');

await estreita.locator('.sidebar-toggle').click();
await estreita.waitForTimeout(300);
const estreitoTrilho = await medir(estreita);
if (estreitoTrilho.largura < 40) {
  problemas.push(`em tela estreita o trilho sumiu: ${estreitoTrilho.largura}px`);
}
if (estreitoTrilho.cortados.length > 0) {
  problemas.push(`texto cortado no trilho estreito: ${estreitoTrilho.cortados.join(' | ')}`);
}
await estreita.locator('.sidebar-toggle').click();
await estreita.waitForTimeout(300);
if ((await medir(estreita)).largura < 40) problemas.push('em tela estreita nao deu para expandir de volta');
await estreita.screenshot({ path: join(SAIDA, 'menu-estreito.png'), fullPage: false });
console.log('tela estreita:', { estreitoAberto, estreitoTrilho });

await navegador.close();
servidor.close();
if (problemas.length > 0) {
  console.error('\nFALHOU:\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('\nOK: trilho de icones sem texto cortado, sem rolagem lateral e sempre possivel expandir de volta.');
