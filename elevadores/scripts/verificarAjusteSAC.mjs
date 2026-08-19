/* Confere os ajustes manuais no cartao do SAC, nas duas decisoes:

   - trocar o responsavel: o caso muda de gaveta, fica marcado na
     tabela e sobrevive ao recarregar a pagina;
   - desconsiderar: o caso sai do total e de todas as gavetas, aparece
     na lista de auditoria com o motivo, e volta a contar quando
     desfeito.

   O segundo caso e o que mais importa vigiar: filtrar so a tabela e
   deixar o grafico contando seria pior do que nao ter a funcao. */
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

/* ---- desconsiderar: o caso tem que sumir de TODOS os numeros ---- */
const totalCasos = async () => {
  const t = await sac2.locator('.eq-sac-numero.destaque b').first().innerText();
  return Number(t.trim());
};
const totalAntes = await totalCasos();
const somaResp = async () => {
  const ns = await sac2.locator('.eq-sac-resp-item b').allInnerTexts();
  return ns.reduce((s, n) => s + Number(n.trim() || 0), 0);
};
const respAntes = await somaResp();

await sac2.locator('.eq-sac-resp-botao').first().click();
await pagina.waitForTimeout(250);
const ed = sac2.locator('.eq-sac-editor').first();
await ed.locator('select').selectOption('FORA');
await ed.locator('input').fill('não foi culpa do CD, item errado veio de fora');
await ed.getByRole('button', { name: 'Salvar' }).click();
await pagina.waitForTimeout(500);

const totalDepois = await totalCasos();
if (totalDepois !== totalAntes - 1) {
  problemas.push(`desconsiderar nao tirou do total: ${totalAntes} -> ${totalDepois}`);
}
const respDepois = await somaResp();
if (respDepois !== respAntes - 1) {
  problemas.push(`o caso desconsiderado sobrou em alguma gaveta: ${respAntes} -> ${respDepois}`);
}

const fora = sac2.locator('.eq-sac-fora-item');
if ((await fora.count()) === 0) {
  problemas.push('o caso desconsiderado nao aparece na lista de auditoria');
} else if (!/culpa do CD/i.test(await fora.first().innerText())) {
  problemas.push('a lista de desconsiderados nao mostra o motivo');
}
const sub = await sac2.locator('.panel-sub').first().innerText();
if (!/desconsiderado\(s\)/i.test(sub)) {
  problemas.push(`o cartao nao avisa que ha caso fora da conta: "${sub}"`);
}
await sac2.locator('.eq-sac-fora').first().screenshot({ path: join(SAIDA, 'sac-desconsiderado.png') });

/* Voltar a contar devolve o caso a todos os numeros. */
await fora.first().getByRole('button', { name: 'Voltar a contar' }).click();
await pagina.waitForTimeout(500);
if ((await totalCasos()) !== totalAntes) {
  problemas.push('voltar a contar nao devolveu o caso ao total');
}

await navegador.close();
servidor.close();

if (problemas.length > 0) {
  console.error('PROBLEMAS:\n' + problemas.map((p) => ` - ${p}`).join('\n'));
  process.exit(1);
}
console.log('Ajustes do SAC: troca de gaveta e desconsideracao saem de todos os numeros, com rastro e desfazer.');
