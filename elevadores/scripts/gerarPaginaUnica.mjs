/* Junta o build (JS + CSS) num unico arquivo HTML, para publicar como
   pagina de visualizacao. Tudo embutido: nenhuma requisicao externa. */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DIST = resolve(process.env.DIST_DIR || 'dist-pagina-unica');
const saida = process.argv[2] || 'pagina-unica.html';

const assets = await readdir(join(DIST, 'assets'));
const arqJs = assets.find((a) => a.startsWith('index') && a.endsWith('.js'));
const arqCss = assets.find((a) => a.endsWith('.css'));
if (!arqJs || !arqCss) throw new Error('build nao encontrado em ' + DIST);
if (assets.filter((a) => a.endsWith('.js')).length > 1) throw new Error('o build gerou mais de um JS; use vite.config.pagina-unica.ts');

const js = await readFile(join(DIST, 'assets', arqJs), 'utf8');
const css = await readFile(join(DIST, 'assets', arqCss), 'utf8');

/* O container da pagina publicada injeta doctype, head e body, entao aqui
   vao apenas o conteudo: titulo, estilos, o ponto de montagem e o script. */
const html = `<title>Central de Equalização de Elevadores — CD Cajamar</title>
<style>
${css}
</style>
<div id="root"></div>
<script>window.__EQUALIZACAO_DEMO__ = true;</script>
<script type="module">
${js}
</script>
`;

await writeFile(saida, html);
console.log(`gerado: ${saida} (${(html.length / 1024).toFixed(0)} KB)`);
