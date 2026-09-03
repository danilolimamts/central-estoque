import { useMemo, useState } from 'react';
import Quadro from '@/componentes/Quadro';
import type { CartaoDoQuadro, ColunaDoQuadro } from '@/componentes/Quadro';
import { Aviso, Barra, SeloPrioridade, Vazio } from '@/componentes/ui';
import { coresStatus } from '@/config/tokens';
import { mensagemDeErro, salvarProjeto } from '@/estado/dados';
import { avancoDoGrupo, filhosDe, generoDoRotulo, rotuloDosFilhos, singularDoRotulo } from '@/dominio/arvore';
import { atrasado, diasDeAtraso, formatarData } from '@/dominio/regras';
import type { Pessoa, Projeto, StatusProjeto } from '@/dominio/tipos';
import { STATUS, rotuloStatus } from '@/dominio/tipos';

interface Props {
  pai: Projeto;
  projetos: Projeto[];
  pessoas: Pessoa[];
  aoAbrir: (p: Projeto) => void;
  recarregar: () => Promise<void>;
}

const COLUNAS: ColunaDoQuadro[] = STATUS.map((s) => ({
  id: s, rotulo: rotuloStatus[s], cor: coresStatus[s],
}));

interface CartaoDeMelhoria extends CartaoDoQuadro {
  projeto: Projeto;
}

/* Os itens de um grupo sao projetos filhos: cada um tem marcos,
   tarefas, paginas, anexos e documento proprios. Aqui aparecem como um
   quadro por situacao, que e como a equipe acompanha uma carteira
   grande. O nome deles vem do proprio projeto: "Melhorias" no Bseller,
   "Frentes" ou "Etapas" em outro. */
export default function Melhorias({ pai, projetos, pessoas, aoAbrir, recarregar }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [emQuadro, setEmQuadro] = useState(true);
  const [criando, setCriando] = useState<StatusProjeto | null>(null);
  const [nome, setNome] = useState('');

  const filhos = useMemo(() => filhosDe(projetos, pai.id), [projetos, pai.id]);
  const plural = rotuloDosFilhos(pai);
  const singular = singularDoRotulo(pai);
  const artigo = generoDoRotulo(pai) === 'f' ? 'a' : 'o';
  const avanco = avancoDoGrupo(projetos, pai.id);
  const nomePessoa = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '';

  const cartoes: CartaoDeMelhoria[] = filhos.map((p) => ({ id: p.id, coluna: p.status, projeto: p }));

  async function criar(status: StatusProjeto) {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      await salvarProjeto({
        nome: limpo,
        projeto_pai_id: pai.id,
        /* A melhoria herda area e responsavel do grupo: quase sempre e o
           mesmo, e quem quiser troca depois. */
        area: pai.area,
        responsavel_id: pai.responsavel_id,
        status,
        prioridade: 'media',
      });
      setNome('');
      setCriando(null);
      await recarregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }

  async function mover(cartao: CartaoDeMelhoria, coluna: string) {
    try {
      await salvarProjeto(
        { nome: cartao.projeto.nome, status: coluna as StatusProjeto },
        cartao.projeto.id,
      );
      await recarregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }

  return (
    <section className="cartao overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linha px-4 py-3">
        <h2 className="font-titulo text-sm font-extrabold">
          {plural} {filhos.length > 0 && <span className="text-tinta-suave">({filhos.length})</span>}
          {avanco !== null && <span className="ml-2 text-xs font-normal text-tinta-suave">avanço médio {avanco}%</span>}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-linha p-0.5 text-xs font-bold">
            <button
              className={`rounded px-2 py-1 ${emQuadro ? 'bg-roxo-suave text-roxo-escuro' : 'text-tinta-suave'}`}
              onClick={() => setEmQuadro(true)}
            >Quadro</button>
            <button
              className={`rounded px-2 py-1 ${!emQuadro ? 'bg-roxo-suave text-roxo-escuro' : 'text-tinta-suave'}`}
              onClick={() => setEmQuadro(false)}
            >Lista</button>
          </div>
          <button className="botao-primario py-1 text-xs" onClick={() => setCriando('nao_iniciado')}>
            + Nov{artigo} {singular.toLowerCase()}
          </button>
        </div>
      </div>

      {erro && <div className="p-4"><Aviso>{erro}</Aviso></div>}

      {criando && (
        <form
          className="flex flex-wrap items-end gap-2 border-b border-linha bg-papel px-4 py-3"
          onSubmit={(e) => { e.preventDefault(); void criar(criando); }}
        >
          <label className="min-w-[240px] flex-1">
            <span className="rotulo">Nome d{artigo} {singular.toLowerCase()}</span>
            <input
              className="campo" value={nome} autoFocus
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Trava sistêmica para transferência de paletes"
            />
          </label>
          <label>
            <span className="rotulo">Situação</span>
            <select className="campo" value={criando} onChange={(e) => setCriando(e.target.value as StatusProjeto)}>
              {STATUS.map((s) => <option key={s} value={s}>{rotuloStatus[s]}</option>)}
            </select>
          </label>
          <button type="submit" className="botao-primario">Criar</button>
          <button type="button" className="botao-neutro" onClick={() => { setCriando(null); setNome(''); }}>
            Cancelar
          </button>
        </form>
      )}

      {!filhos.length ? (
        <Vazio>
          Nenhum item em {plural.toLowerCase()} ainda. Cada {singular.toLowerCase()} tem marcos,
          tarefas, páginas, anexos e gera o próprio documento em Word.
        </Vazio>
      ) : emQuadro ? (
        <Quadro
          colunas={COLUNAS}
          itens={cartoes}
          aoMover={mover}
          aoAbrir={(c) => aoAbrir(c.projeto)}
          rodape={(coluna) => (
            <button
              className="w-full rounded-lg border border-dashed border-linha py-1.5 text-[11px] font-bold text-tinta-suave hover:border-roxo hover:text-roxo-escuro"
              onClick={() => { setCriando(coluna.id as StatusProjeto); setNome(''); }}
            >+ Adicionar</button>
          )}
          cartao={(c) => (
            <>
              <p className="text-sm font-semibold leading-snug">{c.projeto.nome}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <SeloPrioridade prioridade={c.projeto.prioridade} />
                {atrasado(c.projeto) && (
                  <span className="text-[11px] font-bold text-vermelho">+{diasDeAtraso(c.projeto)}d</span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Barra valor={c.projeto.percentual} />
                <span className="text-[11px] font-bold text-tinta-suave">{c.projeto.percentual}%</span>
              </div>
              {(c.projeto.fim_previsto || c.projeto.responsavel_id) && (
                <p className="mt-1.5 truncate text-[11px] text-tinta-suave">
                  {nomePessoa(c.projeto.responsavel_id)}
                  {c.projeto.fim_previsto && ` · ${formatarData(c.projeto.fim_previsto)}`}
                </p>
              )}
            </>
          )}
        />
      ) : (
        <ul className="divide-y divide-linha">
          {filhos.map((p) => (
            <li
              key={p.id}
              className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-papel"
              onClick={() => aoAbrir(p)}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: coresStatus[p.status] }} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.nome}</span>
              <span className="text-xs text-tinta-suave">{rotuloStatus[p.status]}</span>
              <div className="flex w-32 items-center gap-2">
                <Barra valor={p.percentual} />
                <span className="w-8 text-right text-[11px] font-bold">{p.percentual}%</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
