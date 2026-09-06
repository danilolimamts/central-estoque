/* Publicacao nova troca o nome dos pedacos do bundle (o hash do
   arquivo). A aba que ficou aberta continua com o index antigo em
   memoria e, ao pedir um pedaco sob demanda — o gerador de Word, a
   planilha, o editor —, busca um arquivo que nao existe mais e recebe
   "Failed to fetch dynamically imported module".

   Recarregar uma vez resolve, porque a recarga traz o index novo. A
   trava em sessionStorage existe para nao entrar em laco quando a falha
   for outra coisa (internet caida, por exemplo): na segunda vez o erro
   sobe para a tela como qualquer outro. */

const CHAVE = 'projetos.recarga-por-versao';

function ehPedacoQueSumiu(falha: unknown): boolean {
  const texto = falha instanceof Error ? `${falha.name} ${falha.message}` : String(falha);
  return /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(texto);
}

export async function importarModulo<T>(carregar: () => Promise<T>): Promise<T> {
  try {
    const modulo = await carregar();
    sessionStorage.removeItem(CHAVE);
    return modulo;
  } catch (falha) {
    if (ehPedacoQueSumiu(falha) && !sessionStorage.getItem(CHAVE)) {
      sessionStorage.setItem(CHAVE, '1');
      location.reload();
      /* A promessa nunca resolve: a pagina esta indo embora, e resolver
         faria a tela desenhar um estado que vai sumir no mesmo instante. */
      await new Promise<never>(() => {});
    }
    throw falha;
  }
}
