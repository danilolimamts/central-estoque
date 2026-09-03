/* O texto das paginas volta do banco como HTML e e injetado na tela.
   Como o modulo e aberto, qualquer um consegue escrever direto na API -
   entao o conteudo e limpo na hora de exibir, e nao so na de salvar.
   Sem isso, um <script> gravado por fora rodaria no navegador de quem
   abrisse a pagina. */
const TAGS_PERMITIDAS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'S', 'U', 'CODE', 'PRE', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'A', 'IMG', 'HR',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SPAN', 'DIV',
]);

const ATRIBUTOS_PERMITIDOS = new Set(['href', 'src', 'alt', 'title', 'class', 'colspan', 'rowspan']);

function enderecoSeguro(valor: string): boolean {
  const limpo = valor.trim().toLowerCase();
  return !limpo.startsWith('javascript:') && !limpo.startsWith('data:text/html');
}

export function limparHtml(html: string): string {
  const molde = document.createElement('div');
  molde.innerHTML = html;

  const percorrer = (no: Element) => {
    for (const filho of [...no.children]) {
      if (!TAGS_PERMITIDAS.has(filho.tagName)) {
        /* A tag some, o texto fica: apagar o conteudo junto perderia
           trecho legitimo por causa de uma marcacao desconhecida. */
        filho.replaceWith(...filho.childNodes);
        continue;
      }
      for (const atributo of [...filho.attributes]) {
        const nome = atributo.name.toLowerCase();
        if (!ATRIBUTOS_PERMITIDOS.has(nome) || nome.startsWith('on')) {
          filho.removeAttribute(atributo.name);
        } else if ((nome === 'href' || nome === 'src') && !enderecoSeguro(atributo.value)) {
          filho.removeAttribute(atributo.name);
        }
      }
      percorrer(filho);
    }
  };

  percorrer(molde);
  return molde.innerHTML;
}
