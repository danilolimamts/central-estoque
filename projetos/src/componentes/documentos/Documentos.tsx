import { useEffect, useMemo, useState } from 'react';
import { Aviso, Campo, Carregando, Modal, Vazio } from '@/componentes/ui';
import { mensagemDeErro } from '@/estado/dados';
import { excluirDocumento, proximoNumero, salvarDocumento, useDocumentos } from '@/estado/documentos';
import { usePaginas } from '@/estado/paginas';
import { montarBriefing, lerConteudoColado } from '@/dominio/briefing';
import { faltamCamposParaRascunho, montarRascunho } from '@/dominio/rascunho';
import {
  dataPorExtenso, documentoVazio, ESFORCOS, nomeDoArquivo,
} from '@/dominio/documento';
import type {
  DadosDoDocumento, Documento, ImagemDoDocumento, Par, PrioridadeDoDocumento, Trio,
} from '@/dominio/documento';
import { formatarData } from '@/dominio/regras';
import { urlDoAnexo } from '@/estado/dados';
import type { Anexo, Marco, Pessoa, Projeto, Tarefa } from '@/dominio/tipos';

interface Props {
  projeto: Projeto;
  pessoas: Pessoa[];
  marcos: Marco[];
  tarefas: Tarefa[];
  anexos: Anexo[];
}

/* Listas e tabelas do documento sao editadas como texto: uma linha por
   item, colunas separadas por barra. Um editor de linhas com botoes
   custaria muito mais codigo e seria mais lento de preencher do que
   digitar ou colar direto. */
const paraLinhas = (itens: string[]) => itens.join('\n');
const dasLinhas = (texto: string) => texto.split('\n').map((l) => l.trim()).filter(Boolean);

const paraPares = (itens: Par[]) => itens.map((i) => `${i.a} | ${i.b}`).join('\n');
const dosPares = (texto: string): Par[] => dasLinhas(texto).map((l) => {
  const [a, ...resto] = l.split('|');
  return { a: a.trim(), b: resto.join('|').trim() };
});

const paraTrios = (itens: Trio[]) => itens.map((i) => `${i.a} | ${i.b} | ${i.c}`).join('\n');
const dosTrios = (texto: string): Trio[] => dasLinhas(texto).map((l) => {
  const [a, b, ...resto] = l.split('|');
  return { a: (a ?? '').trim(), b: (b ?? '').trim(), c: resto.join('|').trim() };
});

function baixar(blob: Blob, nome: string) {
  const endereco = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = endereco;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(endereco);
}

export default function Documentos({ projeto, pessoas, marcos, tarefas, anexos }: Props) {
  const carteira = useDocumentos(projeto.id);
  const carteiraDePaginas = usePaginas(projeto.id);
  const [editando, setEditando] = useState<Documento | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function novo() {
    setErro(null);
    try {
      setEditando('novo');
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }

  async function remover(d: Documento) {
    if (!confirm(`Excluir o documento ${String(d.numero).padStart(2, '0')} "${d.titulo}"?`)) return;
    try {
      await excluirDocumento(d.id);
      await carteira.recarregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }

  if (editando) {
    return (
      <Formulario
        projeto={projeto} pessoas={pessoas} marcos={marcos} tarefas={tarefas} anexos={anexos}
        paginas={carteiraDePaginas.paginas}
        documento={editando === 'novo' ? null : editando}
        aoFechar={() => setEditando(null)}
        aoSalvar={carteira.recarregar}
      />
    );
  }

  return (
    <section className="cartao overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linha px-4 py-3">
        <h2 className="font-titulo text-sm font-extrabold">
          Documentos {carteira.documentos.length > 0 && <span className="text-tinta-suave">({carteira.documentos.length})</span>}
        </h2>
        <button className="botao-primario" onClick={() => void novo()}>Criar documento</button>
      </div>

      {(erro || carteira.erro) && <div className="p-4"><Aviso>{erro ?? carteira.erro}</Aviso></div>}

      {carteira.carregando ? <Carregando /> : !carteira.documentos.length ? (
        <Vazio>
          Nenhuma proposta gerada. O documento sai no padrão Bseller: capa, 15 seções,
          cabeçalho, rodapé e nome de arquivo numerado.
        </Vazio>
      ) : (
        <ul className="divide-y divide-linha">
          {carteira.documentos.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="rounded bg-papel px-2 py-1 text-xs font-extrabold text-roxo-escuro">
                {String(d.numero).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.titulo}</p>
                <p className="truncate text-xs text-tinta-suave">
                  {d.subtitulo || 'sem subtítulo'} · atualizado em {formatarData(d.atualizado_em)}
                  {d.gerado_por && ` por ${d.gerado_por}`}
                </p>
              </div>
              <button className="botao-neutro py-1 text-xs" onClick={() => setEditando(d)}>Abrir</button>
              <button className="text-xs font-bold text-vermelho" onClick={() => void remover(d)}>Excluir</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Formulário (o questionário) ---------------- */

interface PropsDoFormulario extends Props {
  paginas: ReturnType<typeof usePaginas>['paginas'];
  documento: Documento | null;
  aoFechar: () => void;
  aoSalvar: () => Promise<void>;
}

function Formulario({
  projeto, pessoas, marcos, tarefas, anexos, paginas, documento, aoFechar, aoSalvar,
}: PropsDoFormulario) {
  const [dados, setDados] = useState<DadosDoDocumento | null>(null);
  const [id, setId] = useState<string | undefined>(documento?.id);
  const [autor, setAutor] = useState(documento?.gerado_por ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [colando, setColando] = useState(false);
  const [textoColado, setTextoColado] = useState('');

  const imagensDisponiveis = useMemo(
    () => anexos.filter((a) => a.tipo_mime?.startsWith('image/')),
    [anexos],
  );
  const fluxosDisponiveis = useMemo(
    () => paginas.flatMap((p) => p.blocos
      .filter((b) => b.tipo === 'fluxo')
      .map((b, i) => ({ titulo: `${p.titulo}${i ? ` (${i + 1})` : ''}`, codigo: b.conteudo }))),
    [paginas],
  );

  /* Documento novo nasce com o que o projeto ja sabe: titulo, area,
     prioridade, marcos viram fases de implantacao. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (documento) { setDados(documento.dados); return; }
      const numero = await proximoNumero().catch(() => 1);
      if (!vivo) return;
      const base = documentoVazio(numero);
      setDados({
        ...base,
        titulo: projeto.nome,
        categoria: projeto.area ?? '',
        data: dataPorExtenso(new Date()),
        prioridade: (projeto.prioridade === 'critica' || projeto.prioridade === 'alta'
          ? 'ALTA'
          : projeto.prioridade === 'baixa' ? 'BAIXA' : 'MÉDIA') as PrioridadeDoDocumento,
        rollout: marcos.map((m, i) => ({
          a: `Fase ${i + 1} | ${m.nome}`,
          b: m.data_prevista ? `Previsto para ${formatarData(m.data_prevista)}` : 'Data a definir',
        })),
      });
    })();
    return () => { vivo = false; };
  }, [documento, projeto, marcos]);

  if (!dados) return <div className="cartao"><Carregando /></div>;

  const mudar = (campo: keyof DadosDoDocumento, valor: unknown) =>
    setDados((atual) => (atual ? { ...atual, [campo]: valor } : atual));

  async function copiarBriefing() {
    const texto = montarBriefing(
      projeto, pessoas, marcos, tarefas, anexos, paginas, dados!.numero, dados!.objetivo,
    );
    try {
      await navigator.clipboard.writeText(texto);
      setAviso('Briefing copiado. Cole no chat, peça o conteúdo e volte com "Colar conteúdo".');
      setErro(null);
    } catch {
      /* Área de transferência bloqueada (navegador antigo, sem HTTPS):
         o texto ainda precisa chegar à pessoa de alguma forma. */
      setTextoColado(texto);
      setColando(true);
      setAviso('Copie o texto da caixa e cole no chat.');
    }
  }

  function gerarRascunho() {
    const faltando = faltamCamposParaRascunho(dados!);
    if (faltando.length) {
      setErro(`Antes do rascunho, preencha: ${faltando.join(', ')}.`);
      setAviso(null);
      return;
    }
    setDados(montarRascunho(dados!, { projeto, marcos, tarefas }));
    setErro(null);
    setAviso('Rascunho montado. Revise as seções antes de gerar o Word.');
  }

  function aplicarConteudo() {
    try {
      setDados(lerConteudoColado(textoColado, dados!));
      setColando(false);
      setTextoColado('');
      setAviso('Conteúdo aplicado. Confira os campos antes de gerar.');
      setErro(null);
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }

  async function salvar(): Promise<string | undefined> {
    setOcupado('salvando');
    setErro(null);
    try {
      const salvo = await salvarDocumento(projeto.id, dados!, autor || null, id);
      setId(salvo);
      await aoSalvar();
      setAviso('Documento salvo.');
      return salvo;
    } catch (falha) {
      setErro(mensagemDeErro(falha));
      return undefined;
    } finally {
      setOcupado(null);
    }
  }

  async function gerar() {
    if (!dados!.titulo.trim()) { setErro('O documento precisa de um título.'); return; }
    setOcupado('gerando');
    setErro(null);
    try {
      const [{ gerarDocumentoWord }, { baixarImagem, fluxogramaEmPng }] = await Promise.all([
        import('@/exportar/documentoWord'),
        import('@/lib/imagensParaWord'),
      ]);

      const recursos: { logo?: Awaited<ReturnType<typeof baixarImagem>>; imagens: Record<string, Awaited<ReturnType<typeof baixarImagem>>> } = { imagens: {} };
      /* O logo da capa e o da marca em fundo claro; falha ao baixar nao
         impede a geracao, so tira a imagem do documento. */
      recursos.logo = await baixarImagem('./brand/Logo_LDM_hor_2.png').catch(() => undefined);

      for (const img of dados!.imagens) {
        const baixada = await baixarImagem(img.url).catch(() => undefined);
        if (baixada) recursos.imagens[img.url] = baixada;
      }
      for (const fluxo of dados!.fluxogramas) {
        const desenho = await fluxogramaEmPng(fluxo.codigo).catch(() => undefined);
        if (desenho) recursos.imagens[`fluxo:${fluxo.titulo}`] = desenho;
      }

      const { blob, nome } = await gerarDocumentoWord(dados!, recursos);
      baixar(blob, nome);
      await salvar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setOcupado(null);
    }
  }

  const trocarImagem = (url: string, secao: string) => {
    const outras = dados!.imagens.filter((i) => i.url !== url);
    if (!secao) { mudar('imagens', outras); return; }
    const anexo = imagensDisponiveis.find((a) => urlDoAnexo(a.caminho) === url);
    const nova: ImagemDoDocumento = {
      url,
      legenda: anexo?.legenda ?? anexo?.nome_arquivo ?? '',
      secao: secao as ImagemDoDocumento['secao'],
    };
    mudar('imagens', [...outras, nova]);
  };

  return (
    <section className="cartao overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linha px-4 py-3">
        <h2 className="font-titulo text-sm font-extrabold">
          Documento {String(dados.numero).padStart(2, '0')} · Proposta de Melhoria Sistêmica
        </h2>
        <div className="flex flex-wrap gap-2">
          <button className="botao-neutro" onClick={aoFechar}>Fechar</button>
          <button className="botao-neutro" onClick={() => void salvar()} disabled={!!ocupado}>
            {ocupado === 'salvando' ? 'Salvando…' : 'Salvar'}
          </button>
          <button className="botao-primario" onClick={() => void gerar()} disabled={!!ocupado}>
            {ocupado === 'gerando' ? 'Gerando…' : 'Gerar Word'}
          </button>
        </div>
      </div>

      <div className="space-y-5 p-4">
        <div className="rounded-xl border border-linha bg-papel p-3">
          <p className="text-sm font-bold text-navy">Montar o documento a partir do objetivo</p>
          <p className="mt-1 text-xs text-tinta-suave">
            Preencha <strong>objetivo</strong>, <strong>dor atual</strong>, <strong>o que muda</strong> e
            o <strong>problema central</strong>. O botão abaixo escreve as demais seções recombinando
            esses textos e o que o projeto já tem: ganhos, impactos, riscos, critérios de aceite,
            KPIs, rollout, ROI e resumo executivo. Onde não há base, deixa marcado como a definir.
            Nada do que você já escreveu é sobrescrito.
          </p>
          <div className="mt-2">
            <button className="botao-primario py-1 text-xs" onClick={gerarRascunho}>Gerar rascunho</button>
          </div>
        </div>

        <div className="rounded-xl border border-roxo-claro bg-roxo-suave p-3">
          <p className="text-sm font-bold text-roxo-escuro">Escrever com ajuda do chat (opcional)</p>
          <p className="mt-1 text-xs text-tinta-suave">
            Preencha o objetivo abaixo, clique em <strong>Copiar briefing</strong> e cole no chat.
            O texto já leva marcos, tarefas, anexos e páginas deste projeto. Depois volte com
            <strong> Colar conteúdo</strong> e confira os campos.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="botao-neutro py-1 text-xs" onClick={() => void copiarBriefing()}>Copiar briefing</button>
            <button className="botao-neutro py-1 text-xs" onClick={() => { setTextoColado(''); setColando(true); }}>Colar conteúdo</button>
          </div>
        </div>

        {aviso && <Aviso tipo="sucesso">{aviso}</Aviso>}
        {erro && <Aviso>{erro}</Aviso>}

        <Bloco titulo="A. Identificação">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Número"><input type="number" className="campo" value={dados.numero} onChange={(e) => mudar('numero', Number(e.target.value))} /></Campo>
            <Campo rotulo="Categoria"><input className="campo" value={dados.categoria} onChange={(e) => mudar('categoria', e.target.value)} /></Campo>
            <Campo rotulo="Versão"><input className="campo" value={dados.versao} onChange={(e) => mudar('versao', e.target.value)} /></Campo>
            <Campo rotulo="Status"><input className="campo" value={dados.status} onChange={(e) => mudar('status', e.target.value)} /></Campo>
          </div>
          <Campo rotulo="Título da melhoria *"><input className="campo" value={dados.titulo} onChange={(e) => mudar('titulo', e.target.value)} /></Campo>
          <Campo rotulo="Subtítulo técnico"><input className="campo" value={dados.subtitulo} onChange={(e) => mudar('subtitulo', e.target.value)} /></Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Elaborado por"><input className="campo" value={dados.elaborado_por} onChange={(e) => mudar('elaborado_por', e.target.value)} /></Campo>
            <Campo rotulo="Destinatário"><input className="campo" value={dados.destinatario} onChange={(e) => mudar('destinatario', e.target.value)} /></Campo>
            <Campo rotulo="Data"><input className="campo" value={dados.data} onChange={(e) => mudar('data', e.target.value)} /></Campo>
            <Campo rotulo="Documento relacionado"><input className="campo" value={dados.documento_relacionado} onChange={(e) => mudar('documento_relacionado', e.target.value)} /></Campo>
          </div>
          <Campo rotulo="Contexto especial (fica só no corpo, nunca na capa)">
            <input className="campo" value={dados.contexto_especial} onChange={(e) => mudar('contexto_especial', e.target.value)} />
          </Campo>
        </Bloco>

        <Bloco titulo="B. Essência da melhoria">
          <Campo rotulo="Objetivo *"><textarea rows={3} className="campo" value={dados.objetivo} onChange={(e) => mudar('objetivo', e.target.value)} /></Campo>
          <Campo rotulo="Dor atual, o AS IS *"><textarea rows={3} className="campo" value={dados.dor} onChange={(e) => mudar('dor', e.target.value)} /></Campo>
          <Campo rotulo="O que muda, o TO BE *"><textarea rows={3} className="campo" value={dados.to_be} onChange={(e) => mudar('to_be', e.target.value)} /></Campo>
          <Campo rotulo="Problema central em uma frase *"><input className="campo" value={dados.problema_central} onChange={(e) => mudar('problema_central', e.target.value)} /></Campo>
          <Lista rotulo="Ganho direto (dimensão | ganho)" valor={paraPares(dados.ganhos)} aoMudar={(t) => mudar('ganhos', dosPares(t))} />
          <Campo rotulo="Exemplo prático"><textarea rows={3} className="campo" value={dados.exemplo_pratico} onChange={(e) => mudar('exemplo_pratico', e.target.value)} /></Campo>
        </Bloco>

        <Bloco titulo="C. Regras e fluxo">
          <Lista rotulo="Regras de negócio (uma por linha)" valor={paraLinhas(dados.regras_negocio)} aoMudar={(t) => mudar('regras_negocio', dasLinhas(t))} />
          <Lista rotulo="Pontos em aberto (um por linha)" valor={paraLinhas(dados.pontos_aberto)} aoMudar={(t) => mudar('pontos_aberto', dasLinhas(t))} />
          <Lista rotulo="Fluxo (etapa | como é hoje | como fica)" valor={paraTrios(dados.fluxo)} aoMudar={(t) => mudar('fluxo', dosTrios(t))} />
        </Bloco>

        <Bloco titulo="D. Consequências">
          <Lista rotulo="Impactos esperados (dimensão | descrição)" valor={paraPares(dados.impactos)} aoMudar={(t) => mudar('impactos', dosPares(t))} />
          <Lista rotulo="Riscos e dependências (item | descrição)" valor={paraPares(dados.riscos)} aoMudar={(t) => mudar('riscos', dosPares(t))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Esforço">
              <select className="campo" value={dados.esforco} onChange={(e) => mudar('esforco', e.target.value)}>
                {ESFORCOS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Prioridade">
              <select className="campo" value={dados.prioridade} onChange={(e) => mudar('prioridade', e.target.value)}>
                <option value="ALTA">Alta</option>
                <option value="MÉDIA">Média</option>
                <option value="BAIXA">Baixa</option>
              </select>
            </Campo>
          </div>
          <Campo rotulo="Justificativa do esforço"><textarea rows={2} className="campo" value={dados.esforco_justificativa} onChange={(e) => mudar('esforco_justificativa', e.target.value)} /></Campo>
          <Campo rotulo="Justificativa da prioridade"><textarea rows={2} className="campo" value={dados.prioridade_justificativa} onChange={(e) => mudar('prioridade_justificativa', e.target.value)} /></Campo>
        </Bloco>

        <Bloco titulo="E. Validação e resultado">
          <Lista rotulo="Critérios de aceite (um por linha)" valor={paraLinhas(dados.criterios_aceite)} aoMudar={(t) => mudar('criterios_aceite', dasLinhas(t))} />
          <Lista rotulo="Cenários de validação (um por linha)" valor={paraLinhas(dados.cenarios_validacao)} aoMudar={(t) => mudar('cenarios_validacao', dasLinhas(t))} />
          <Lista rotulo="KPIs (indicador | meta TO BE)" valor={paraPares(dados.kpis)} aoMudar={(t) => mudar('kpis', dosPares(t))} />
          <Lista rotulo="Rollout (fase | atividades)" valor={paraPares(dados.rollout)} aoMudar={(t) => mudar('rollout', dosPares(t))} />
          <Lista rotulo="ROI (um ganho por linha)" valor={paraLinhas(dados.roi_bullets)} aoMudar={(t) => mudar('roi_bullets', dasLinhas(t))} />
          <Campo rotulo="Fechamento do ROI"><textarea rows={2} className="campo" value={dados.roi_fechamento} onChange={(e) => mudar('roi_fechamento', e.target.value)} /></Campo>
          <Campo rotulo="Resumo executivo"><textarea rows={4} className="campo" value={dados.resumo_executivo} onChange={(e) => mudar('resumo_executivo', e.target.value)} /></Campo>
        </Bloco>

        <Bloco titulo="F. Material visual do projeto">
          {imagensDisponiveis.length ? (
            <div className="space-y-2">
              <p className="rotulo">Prints e fotos dos anexos</p>
              {imagensDisponiveis.map((a) => {
                const url = urlDoAnexo(a.caminho);
                const atual = dados.imagens.find((i) => i.url === url);
                return (
                  <div key={a.id} className="flex items-center gap-3">
                    <img src={url} alt="" className="h-10 w-14 rounded border border-linha object-cover" />
                    <span className="min-w-0 flex-1 truncate text-sm">{a.legenda || a.nome_arquivo}</span>
                    <select
                      className="campo w-40 py-1 text-xs" value={atual?.secao ?? ''}
                      onChange={(e) => trocarImagem(url, e.target.value)}
                    >
                      <option value="">Não incluir</option>
                      <option value="as_is">Seção 3 | AS IS</option>
                      <option value="to_be">Seção 5 | TO BE</option>
                      <option value="anexo">Anexos, no fim</option>
                    </select>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-xs text-tinta-suave">Nenhuma imagem nos anexos deste projeto.</p>}

          {fluxosDisponiveis.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="rotulo">Fluxogramas das páginas</p>
              {fluxosDisponiveis.map((f) => (
                <label key={f.titulo} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={dados.fluxogramas.some((x) => x.titulo === f.titulo)}
                    onChange={(e) => mudar('fluxogramas', e.target.checked
                      ? [...dados.fluxogramas, f]
                      : dados.fluxogramas.filter((x) => x.titulo !== f.titulo))}
                  />
                  {f.titulo}
                </label>
              ))}
              <p className="text-[11px] text-tinta-suave">O desenho vira imagem na seção 7 do documento.</p>
            </div>
          )}
        </Bloco>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-linha pt-4">
          <Campo rotulo="Gerado por">
            <select className="campo w-56" value={autor} onChange={(e) => setAutor(e.target.value)}>
              <option value="">Não informado</option>
              {pessoas.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
            </select>
          </Campo>
          <p className="text-xs text-tinta-suave">
            Arquivo: <strong>{nomeDoArquivo(dados)}</strong>
          </p>
        </div>
      </div>

      <Modal aberto={colando} aoFechar={() => setColando(false)} titulo="Conteúdo vindo do chat" largura="max-w-2xl">
        <p className="mb-2 text-xs text-tinta-suave">
          Cole aqui o JSON que o chat devolveu. Os campos preenchidos substituem os atuais;
          número, imagens e fluxogramas continuam como estão.
        </p>
        <textarea
          rows={12} className="campo font-mono text-xs" value={textoColado}
          onChange={(e) => setTextoColado(e.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button className="botao-neutro" onClick={() => setColando(false)}>Cancelar</button>
          <button className="botao-primario" onClick={aplicarConteudo}>Aplicar</button>
        </div>
      </Modal>
    </section>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-linha p-3">
      <h3 className="font-titulo text-sm font-extrabold text-navy">{titulo}</h3>
      {children}
    </div>
  );
}

function Lista({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (t: string) => void }) {
  return (
    <Campo rotulo={rotulo}>
      <textarea
        rows={Math.min(10, Math.max(3, valor.split('\n').length + 1))}
        className="campo" value={valor} onChange={(e) => aoMudar(e.target.value)}
      />
    </Campo>
  );
}
