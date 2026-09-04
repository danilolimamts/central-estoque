import { useMemo, useState } from 'react';
import Quadro from '@/componentes/Quadro';
import type { CartaoDoQuadro, ColunaDoQuadro } from '@/componentes/Quadro';
import { Aviso, Barra, SeloPrioridade, SeloSaude, SeloStatus, Vazio } from '@/componentes/ui';
import { coresStatus } from '@/config/tokens';
import { mensagemDeErro, salvarProjeto } from '@/estado/dados';
import {
  avancoPorConclusao, filhosDe, generoDoRotulo, percentualEfetivo, porPrioridade,
  rotuloDosFilhos, singularDoRotulo,
} from '@/dominio/arvore';
import { atrasado, diasDeAtraso, formatarData, percentualEsperado, saude } from '@/dominio/regras';
import type { Pessoa, Prioridade, Projeto, StatusProjeto } from '@/dominio/tipos';
import { PRIORIDADES, STATUS, rotuloPrioridade, rotuloStatus } from '@/dominio/tipos';

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

interface CartaoDeAtividade extends CartaoDoQuadro {
  projeto: Projeto;
}

/* O conteudo de um projeto sao suas atividades: abrir o projeto mostra
   esta lista, e o trabalho de verdade (marcos, tarefas, paginas, anexos
   e documento) vive dentro de cada atividade.

   A lista e a visao padrao porque e onde cabem prazo, prioridade,
   situacao e avanco lado a lado; o quadro fica a um clique para quem
   quiser arrastar. O nome das atividades vem do proprio projeto:
   "Melhorias" no Bseller, "Frentes" ou "Etapas" em outro. */
export default function Atividades({ pai, projetos, pessoas, aoAbrir, recarregar }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [emQuadro, setEmQuadro] = useState(false);
  const [criando, setCriando] = useState<StatusProjeto | null>(null);
  const [nome, setNome] = useState('');
  const [ordem, setOrdem] = useState<'prioridade' | 'prazo' | 'situacao' | 'nome'>('prioridade');

  /* Prioridade manda na ordem: o que e critico aparece primeiro, e o
     prazo desempata. Quem preferir outra ordem troca no seletor. */
  const filhos = useMemo(() => {
    const lista = [...filhosDe(projetos, pai.id)];
    if (ordem === 'prioridade') return lista.sort(porPrioridade);
    if (ordem === 'prazo') {
      return lista.sort((a, b) => (a.fim_previsto ?? '9999').localeCompare(b.fim_previsto ?? '9999'));
    }
    if (ordem === 'situacao') return lista.sort((a, b) => STATUS.indexOf(a.status) - STATUS.indexOf(b.status));
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [projetos, pai.id, ordem]);
  const plural = rotuloDosFilhos(pai);
  const singular = singularDoRotulo(pai);
  const artigo = generoDoRotulo(pai) === 'f' ? 'a' : 'o';
  const avanco = avancoPorConclusao(projetos, pai.id);
  const nomePessoa = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '—';

  const cartoes: CartaoDeAtividade[] = filhos.map((p) => ({ id: p.id, coluna: p.status, projeto: p }));

  async function criar(status: StatusProjeto) {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      await salvarProjeto({
        nome: limpo,
        projeto_pai_id: pai.id,
        /* A atividade herda area e responsavel do projeto: quase sempre
           e o mesmo, e quem quiser troca na propria linha. */
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

  /* Mudar situacao, prioridade ou responsavel direto na linha: e o que
     se faz o dia inteiro, e nao deveria exigir abrir a atividade. */
  async function alterar(projeto: Projeto, mudanca: Partial<Projeto>) {
    try {
      await salvarProjeto({ nome: projeto.nome, ...mudanca }, projeto.id);
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
          {avanco && (
            <span className="ml-2 text-xs font-normal text-tinta-suave">
              {avanco.concluidas} de {avanco.total} concluídas · {avanco.percentual}%
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="campo w-36 py-1 text-xs" value={ordem}
            onChange={(e) => setOrdem(e.target.value as typeof ordem)}
            title="Ordenar a lista"
          >
            <option value="prioridade">Por prioridade</option>
            <option value="prazo">Por prazo</option>
            <option value="situacao">Por situação</option>
            <option value="nome">Por nome</option>
          </select>
          <div className="flex rounded-lg border border-linha p-0.5 text-xs font-bold">
            <button
              className={`rounded px-2 py-1 ${!emQuadro ? 'bg-roxo-suave text-roxo-escuro' : 'text-tinta-suave'}`}
              onClick={() => setEmQuadro(false)}
            >Lista</button>
            <button
              className={`rounded px-2 py-1 ${emQuadro ? 'bg-roxo-suave text-roxo-escuro' : 'text-tinta-suave'}`}
              onClick={() => setEmQuadro(true)}
            >Quadro</button>
          </div>
          <button className="botao-primario py-1 text-xs" onClick={() => { setCriando('nao_iniciado'); setNome(''); }}>
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
          aoMover={(c, coluna) => alterar(c.projeto, { status: coluna as StatusProjeto })}
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
                <Barra valor={percentualEfetivo(projetos, c.projeto)} />
                <span className="text-[11px] font-bold text-tinta-suave">
                  {percentualEfetivo(projetos, c.projeto)}%
                </span>
              </div>
              <p className="mt-1.5 truncate text-[11px] text-tinta-suave">
                {nomePessoa(c.projeto.responsavel_id)}
                {c.projeto.fim_previsto && ` · ${formatarData(c.projeto.fim_previsto)}`}
              </p>
            </>
          )}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-papel text-left text-[11px] uppercase tracking-wider text-tinta-suave">
              <tr>
                <th className="px-4 py-2 font-bold">{singular}</th>
                <th className="px-3 py-2 font-bold">Responsável</th>
                <th className="px-3 py-2 font-bold">Situação</th>
                <th className="px-3 py-2 font-bold">Prioridade</th>
                <th className="px-3 py-2 font-bold">Prazo</th>
                <th className="px-3 py-2 font-bold">Saúde</th>
                <th className="px-3 py-2 font-bold w-40">Avanço</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filhos.map((p) => (
                <tr key={p.id} className="border-t border-linha hover:bg-papel">
                  <td className="px-4 py-2">
                    <button
                      className="text-left font-semibold hover:text-roxo-escuro hover:underline"
                      onClick={() => aoAbrir(p)}
                    >{p.nome}</button>
                  </td>

                  <td className="px-3 py-2">
                    <select
                      className="campo w-36 py-1 text-xs" value={p.responsavel_id ?? ''}
                      onChange={(e) => void alterar(p, { responsavel_id: e.target.value || null })}
                    >
                      <option value="">Sem responsável</option>
                      {pessoas.filter((q) => q.ativo).map((q) => (
                        <option key={q.id} value={q.id}>{q.nome}</option>
                      ))}
                    </select>
                  </td>

                  <td className="px-3 py-2">
                    <select
                      className="campo w-36 py-1 text-xs" value={p.status}
                      onChange={(e) => void alterar(p, { status: e.target.value as StatusProjeto })}
                    >
                      {STATUS.map((s) => <option key={s} value={s}>{rotuloStatus[s]}</option>)}
                    </select>
                  </td>

                  <td className="px-3 py-2">
                    <select
                      className="campo w-28 py-1 text-xs" value={p.prioridade}
                      onChange={(e) => void alterar(p, { prioridade: e.target.value as Prioridade })}
                    >
                      {PRIORIDADES.map((s) => <option key={s} value={s}>{rotuloPrioridade[s]}</option>)}
                    </select>
                  </td>

                  <td className="px-3 py-2">
                    <input
                      type="date" className="campo w-36 py-1 text-xs" value={p.fim_previsto ?? ''}
                      onChange={(e) => void alterar(p, { fim_previsto: e.target.value || null })}
                    />
                    {diasDeAtraso(p) > 0 && (
                      <span className="ml-1 text-[11px] font-bold text-vermelho">+{diasDeAtraso(p)}d</span>
                    )}
                  </td>

                  <td className="px-3 py-2"><SeloSaude saude={saude(p)} /></td>

                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Barra valor={percentualEfetivo(projetos, p)} esperado={percentualEsperado(p)} />
                      <input
                        type="number" min={0} max={100} value={p.percentual}
                        className="campo w-14 px-1 py-0.5 text-center text-xs"
                        onChange={(e) => void alterar(p, {
                          percentual: Math.min(100, Math.max(0, Number(e.target.value))),
                        })}
                      />
                    </div>
                  </td>

                  <td className="px-3 py-2 text-right">
                    <button className="text-xs font-bold text-roxo-escuro" onClick={() => aoAbrir(p)}>Abrir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-linha px-4 py-2">
            <button
              className="text-xs font-bold text-tinta-suave hover:text-roxo-escuro"
              onClick={() => { setCriando('nao_iniciado'); setNome(''); }}
            >+ Adicionar {singular.toLowerCase()}</button>
          </div>
        </div>
      )}

      {/* Situação do projeto inteiro, num selo só, para quem chega pela lista. */}
      {filhos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-linha px-4 py-2 text-[11px] text-tinta-suave">
          {STATUS.filter((s) => filhos.some((f) => f.status === s)).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <SeloStatus status={s} />
              <span className="font-bold">{filhos.filter((f) => f.status === s).length}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
