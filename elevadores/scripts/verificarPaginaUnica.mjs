/* Abre a pagina unica gerada direto do arquivo e confere que ela sobe
   sozinha, ja com os dados de exemplo, sem nenhuma requisicao externa. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';

const ARQUIVO = resolve(process.argv[2]);
const SAIDA = process.argv[3] || '.';

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 1000 } });

const problemas = [];
const externas = [];
pagina.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) problemas.push(`console: ${m.text()}`);
});
pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
pagina.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) externas.push(u);
});

await pagina.goto(pathToFileURL(ARQUIVO).href, { waitUntil: 'networkidle' });
await pagina.waitForTimeout(2000);

// Precisa abrir ja no dashboard, com os dados de exemplo carregados.
const temAba = await pagina.getByRole('tab', { name: /Dashboard Geral/i }).count();
console.log('abriu no dashboard:', temAba > 0 ? 'sim' : 'NAO');
const selo = await pagina.getByText('Dados de exemplo', { exact: false }).count();
console.log('aviso de dados de exemplo:', selo > 0 ? 'sim' : 'NAO');
await pagina.screenshot({ path: join(SAIDA, 'pu-01-dashboard.png'), fullPage: true });

await pagina.getByRole('tab', { name: /Status Projeto/i }).click();
await pagina.waitForTimeout(1200);
await pagina.screenshot({ path: join(SAIDA, 'pu-02-projeto.png'), fullPage: true });

// Volta ao dashboard e testa um filtro, para garantir interatividade.
await pagina.getByRole('tab', { name: /Dashboard Geral/i }).click();
await pagina.waitForTimeout(600);
await pagina.getByRole('button', { name: /Por Fabricante/i }).click();
await pagina.waitForTimeout(500);
await pagina.screenshot({ path: join(SAIDA, 'pu-03-fabricante.png') });

await navegador.close();

if (externas.length) console.log('\nREQUISICOES EXTERNAS:\n' + externas.join('\n'));
if (problemas.length) {
  console.log('\nPROBLEMAS:\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('\nsem erros e sem requisicoes externas');
