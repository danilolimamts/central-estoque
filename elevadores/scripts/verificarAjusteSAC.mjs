/* Confere a reclassificacao manual do responsavel no cartao do SAC:
   clicar no selo abre o editor, salvar muda a gaveta do caso, o numero
   de "erro da operacao" cai junto, o ajuste aparece marcado e sobrevive
   ao recarregar a pagina. */
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
await new Promise((r) => servidor.listen(4197, r));

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const problemas = [];
const pagina = await navegador.newPage({ viewport: { width: 1500, height: 1000 } });
pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));

await pagina.goto('http://localhost:4197/?exemplo', { waitUntil: 'networkidle' });
await pagina.waitForTimeout(900);

const sac = pagina.locator('.panel', { hasText: 'Inversões e faltas' }).first();
await sac.scrollIntoViewIfNeeded();
await pagina.waitForTimeout(400);

/* Quantos casos o painel atribui ao CD antes de qualquer ajuste. */
const contarCD = async () =>
  Number(
    (await sac.locator('.eq-sac-resp-item.r-cd b').first().innerText()).trim()
  );
const antes = await contarCD();
if (!Number.isFinite(antes) || antes === 0) {
  problemas.push(`o exemplo precisa ter caso do CD para o teste valer: ${antes}`);
}

/* Abre o editor pelo selo de responsavel da primeira linha do CD. */
const alvo = sac.locator('.eq-sac-resp-botao').first();
await alvo.scrollIntoViewIfNeeded();
await alvo.click();
await pagina.waitForTimeout(250);

const editor = sac.locator('.eq-sac-editor').first();
if ((await editor.count()) === 0) {
  problemas.push('clicar no responsavel nao abriu o editor');
} else {
  await editor.locator('select').selectOption('FORNECEDOR');
  await editor.locator('input').fill('fornecedor enviou o item errado ao CD');
  await editor.getByRole('button', { name: 'Salvar' }).click();
  await pagina.waitForTimeout(400);

  const depois = await contarCD();
  if (depois !== antes - 1) {
    problemas.push(`o ajuste nao saiu da gaveta do CD: ${antes} -> ${depois}`);
  }
  const marcados = await sac.locator('.eq-sac-selo.ajustado').count();
  if (marcados === 0) problemas.push('o caso ajustado nao ficou marcado na tabela');

  const legenda = await sac.locator('.panel-sub').first().innerText();
  if (!/reclassificado\(s\) manualmente/i.test(legenda)) {
    problemas.push(`o cartao nao avisa que ha ajuste manual: "${legenda}"`);
  }
  await sac.screenshot({ path: join(SAIDA, 'sac-ajuste.png') });
}

/* O ajuste e apuracao: nao pode se perder ao fechar a pagina. */
await pagina.reload({ waitUntil: 'networkidle' });
await pagina.waitForTimeout(1200);
const sac2 = pagina.locator('.panel', { hasText: 'Inversões e faltas' }).first();
await sac2.scrollIntoViewIfNeeded();
await pagina.waitForTimeout(400);
if ((await sac2.locator('.eq-sac-selo.ajustado').count()) === 0) {
  problemas.push('o ajuste se perdeu ao recarregar a pagina');
}

/* Desfazer devolve o caso para a classificacao pelo texto. */
await sac2.locator('.eq-sac-resp-botao').first().click();
await pagina.waitForTimeout(250);
const editor2 = sac2.locator('.eq-sac-editor').first();
const voltar = editor2.getByRole('button', { name: 'Voltar ao automático' });
if ((await voltar.count()) === 0) {
  problemas.push('o editor nao oferece voltar ao automatico em caso ja ajustado');
} else {
  await voltar.click();
  await pagina.waitForTimeout(400);
  const cd = Number((await sac2.locator('.eq-sac-resp-item.r-cd b').first().innerText()).trim());
  if (cd !== antes) problemas.push(`desfazer nao devolveu o caso ao CD: ${cd} != ${antes}`);
  if ((await sac2.locator('.eq-sac-selo.ajustado').count()) !== 0) {
    problemas.push('a marca do ajuste ficou depois de desfazer');
  }
}

await navegador.close();
servidor.close();

if (problemas.length > 0) {
  console.error('PROBLEMAS:\n' + problemas.map((p) => ` - ${p}`).join('\n'));
  process.exit(1);
}
console.log('Ajuste de responsavel: muda a gaveta, marca a linha, persiste e desfaz.');
