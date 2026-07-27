/* Icone da aba do navegador: o logo quadrado da Loja do Mecanico,
   embutido como data URI para nao depender de arquivo externo nem de
   rede, o que tambem atende a restricao de CDN da empresa.

   Sem isso o navegador cai no icone do site que estiver hospedando a
   pagina, o que faz um sistema interno aparecer com marca de terceiro. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const ORIGEM = fileURLToPath(new URL('../src/dados/logo.ts', import.meta.url));

export async function iconeDataUri() {
  const fonte = await readFile(ORIGEM, 'utf8');
  const m = /LOGO_QUADRADO = '([^']+)'/.exec(fonte);
  if (!m) throw new Error('LOGO_QUADRADO nao encontrado em src/dados/logo.ts');
  return m[1];
}

export async function tagIcone() {
  return `<link rel="icon" href="${await iconeDataUri()}">`;
}
