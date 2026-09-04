import { atrasado, venceEm } from './regras';
import type { Prioridade, Projeto, StatusProjeto } from './tipos';
import type { ConteudoDoProjeto, MapaDeConteudo } from '@/estado/conteudo';

/* Filtros da lista de atividades. Ficam aqui, fora do componente, para
   serem testados sem montar tela e para a barra lateral so cuidar de
   desenhar. */

/* Tres estados em vez de uma caixa marcada: "sem documentacao" e uma
   pergunta tao comum quanto "com documentacao", e uma caixa so
   responderia metade. */
export type Presenca = 'tanto' | 'com' | 'sem';

export type FiltroDePrazo = 'tanto' | 'vencidas' | 'proximas' | 'sem_prazo';

export interface FiltrosDeAtividade {
  texto: string;
  /* A pergunta do dia a dia e "esta documentada ou nao", e tanto faz o
     formato: pagina escrita aqui, proposta gerada aqui ou arquivo
     anexado valem igual. Os filtros por formato continuam logo abaixo
     para quem quiser separar. */
  documentacao: Presenca;
  /* Lista vazia significa "todas": e o estado inicial e tambem o que
     sobra quando alguem desmarca tudo, que nao pode esconder a lista
     inteira sem querer. */
  status: StatusProjeto[];
  prioridades: Prioridade[];
  responsavelId: string;
  paginas: Presenca;
  tarefas: Presenca;
  marcos: Presenca;
  anexos: Presenca;
  documentos: Presenca;
  prazo: FiltroDePrazo;
}

export const filtrosVazios = (): FiltrosDeAtividade => ({
  texto: '',
  documentacao: 'tanto',
  status: [],
  prioridades: [],
  responsavelId: '',
  paginas: 'tanto',
  tarefas: 'tanto',
  marcos: 'tanto',
  anexos: 'tanto',
  documentos: 'tanto',
  prazo: 'tanto',
});

export const CONTEUDOS = [
  { campo: 'paginas', rotulo: 'Páginas' },
  { campo: 'documentos', rotulo: 'Documento Word' },
  { campo: 'tarefas', rotulo: 'Tarefas' },
  { campo: 'marcos', rotulo: 'Marcos' },
  { campo: 'anexos', rotulo: 'Anexos' },
] as const satisfies readonly { campo: keyof ConteudoDoProjeto; rotulo: string }[];

/* Documentacao e a soma dos tres: escrita, gerada ou anexada. */
export const documentosDe = (c?: ConteudoDoProjeto): number =>
  (c ? c.paginas + c.documentos + c.anexos : 0);

export const temDocumentacao = (c?: ConteudoDoProjeto): boolean => documentosDe(c) > 0;

function combina(presenca: Presenca, quantidade: number): boolean {
  if (presenca === 'com') return quantidade > 0;
  if (presenca === 'sem') return quantidade === 0;
  return true;
}

function combinaPrazo(projeto: Projeto, prazo: FiltroDePrazo): boolean {
  if (prazo === 'vencidas') return atrasado(projeto);
  if (prazo === 'proximas') return venceEm(projeto, 7);
  if (prazo === 'sem_prazo') return !projeto.fim_previsto;
  return true;
}

/* Sem acento e sem caixa: quem procura "inventario" precisa achar
   "Inventário". */
const chave = (texto: string) =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function aplicarFiltros(
  lista: Projeto[], conteudo: MapaDeConteudo, f: FiltrosDeAtividade,
): Projeto[] {
  const busca = chave(f.texto.trim());

  return lista.filter((p) => {
    if (busca && !chave(`${p.nome} ${p.descricao ?? ''} ${p.codigo ?? ''}`).includes(busca)) return false;
    if (f.status.length && !f.status.includes(p.status)) return false;
    if (f.prioridades.length && !f.prioridades.includes(p.prioridade)) return false;
    if (f.responsavelId && p.responsavel_id !== f.responsavelId) return false;
    if (!combinaPrazo(p, f.prazo)) return false;

    const tem = conteudo[p.id];
    if (!combina(f.documentacao, documentosDe(tem))) return false;
    for (const { campo } of CONTEUDOS) {
      if (!combina(f[campo], tem?.[campo] ?? 0)) return false;
    }
    return true;
  });
}

/* Quantos filtros estao valendo: e o numero no botao da barra, para
   ninguem estranhar uma lista curta sem perceber que filtrou. */
export function filtrosAtivos(f: FiltrosDeAtividade): number {
  let contagem = 0;
  if (f.texto.trim()) contagem += 1;
  if (f.status.length) contagem += 1;
  if (f.prioridades.length) contagem += 1;
  if (f.responsavelId) contagem += 1;
  if (f.prazo !== 'tanto') contagem += 1;
  if (f.documentacao !== 'tanto') contagem += 1;
  for (const { campo } of CONTEUDOS) if (f[campo] !== 'tanto') contagem += 1;
  return contagem;
}

/* Alternar item de lista: clicar de novo no mesmo desmarca. */
export function alternar<T>(lista: T[], item: T): T[] {
  return lista.includes(item) ? lista.filter((i) => i !== item) : [...lista, item];
}
