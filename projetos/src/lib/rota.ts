/* Onde a pessoa esta, guardado no endereco.

   O modulo e uma tela so, entao antes o F5 devolvia todo mundo ao
   painel: quem estava dentro de uma melhoria perdia o lugar a cada
   atualizacao. Guardar a posicao no proprio endereco resolve e ainda
   deixa o link do projeto colavel numa conversa.

   Fica no trecho depois do "#" porque o site e estatico no GitHub
   Pages: caminho de verdade exigiria servidor que devolvesse o index
   para qualquer rota. */

export type Aba = 'painel' | 'projetos' | 'cronograma' | 'pessoas';

const ABAS: Aba[] = ['painel', 'projetos', 'cronograma', 'pessoas'];

export interface Rota {
  aba: Aba;
  projetoId: string | null;
}

export const ROTA_INICIAL: Rota = { aba: 'painel', projetoId: null };

export function lerRota(hash: string): Rota {
  const limpo = hash.replace(/^#\/?/, '').trim();
  if (!limpo) return ROTA_INICIAL;

  const [primeiro, segundo] = limpo.split('/');
  if (primeiro === 'projeto' && segundo) {
    /* A aba fica em projetos: e de la que o detalhe nasce, e voltar tem
       de cair na lista, nao no painel. */
    return { aba: 'projetos', projetoId: decodeURIComponent(segundo) };
  }
  const aba = ABAS.find((a) => a === primeiro);
  return aba ? { aba, projetoId: null } : ROTA_INICIAL;
}

export function escreverRota(rota: Rota): string {
  return rota.projetoId ? `#/projeto/${encodeURIComponent(rota.projetoId)}` : `#/${rota.aba}`;
}
