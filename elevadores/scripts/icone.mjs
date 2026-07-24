/* Icone da aba do navegador: o mesmo simbolo LDM que aparece na barra de
   topo do app. Vai embutido como data URI para nao depender de arquivo
   externo nem de rede, o que tambem atende a restricao de CDN.

   Sem isso o navegador cai no icone do site que estiver hospedando a
   pagina, o que faz um sistema interno aparecer com marca de terceiro. */
export const SVG_ICONE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="13" fill="#FA4616"/>
<text x="32" y="41" text-anchor="middle" font-family="Poppins,Segoe UI,Helvetica,Arial,sans-serif" font-size="21" font-weight="700" fill="#fff" letter-spacing="0.5">LDM</text>
</svg>`;

/* O data URI precisa do SVG em uma linha e com os caracteres reservados
   escapados, para funcionar em qualquer navegador. */
export function iconeDataUri() {
  const limpo = SVG_ICONE.replace(/\n\s*/g, ' ').trim();
  return `data:image/svg+xml,${encodeURIComponent(limpo)}`;
}

export function tagIcone() {
  return `<link rel="icon" href="${iconeDataUri()}">`;
}
