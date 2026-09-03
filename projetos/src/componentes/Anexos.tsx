import { useMemo, useRef, useState } from 'react';
import { Aviso, Campo, Modal, Selo, Vazio } from '@/componentes/ui';
import { atualizarAnexo, enviarAnexo, excluirAnexo, mensagemDeErro, urlDoAnexo } from '@/estado/dados';
import { formatarTamanho } from '@/lib/imagem';
import { formatarData } from '@/dominio/regras';
import type { Anexo, Marco, Momento, Pessoa } from '@/dominio/tipos';
import { MOMENTOS, rotuloMomento } from '@/dominio/tipos';

const coresMomento: Record<Momento, string> = {
  antes: '#C79212', depois: '#2E8B57', evidencia: '#2F6FE0', documento: '#6A6F94',
};

const ehImagemDoAnexo = (a: Anexo) => !!a.tipo_mime?.startsWith('image/');

function iconeDoArquivo(a: Anexo): string {
  const t = a.tipo_mime ?? '';
  if (t.includes('pdf')) return 'PDF';
  if (t.includes('spreadsheet') || t.includes('excel') || t.includes('csv')) return 'XLS';
  if (t.includes('word')) return 'DOC';
  if (t.includes('presentation') || t.includes('powerpoint')) return 'PPT';
  return 'ARQ';
}

interface Props {
  projetoId: string;
  anexos: Anexo[];
  marcos: Marco[];
  pessoas: Pessoa[];
  recarregar: () => Promise<void>;
}

export default function Anexos({ projetoId, anexos, marcos, pessoas, recarregar }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ampliado, setAmpliado] = useState<Anexo | null>(null);
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const campoArquivo = useRef<HTMLInputElement>(null);

  /* Cenas ja usadas viram sugestao: o par so funciona se o "antes" e o
     "depois" forem escritos igual, e digitar de novo erra. */
  const cenas = useMemo(
    () => [...new Set(anexos.map((a) => a.par).filter(Boolean) as string[])].sort(),
    [anexos],
  );

  const comparacoes = useMemo(() => {
    const porCena = new Map<string, { antes?: Anexo; depois?: Anexo }>();
    for (const a of anexos) {
      if (!a.par || (a.momento !== 'antes' && a.momento !== 'depois')) continue;
      const atual = porCena.get(a.par) ?? {};
      /* Com mais de uma foto do mesmo momento na cena, vale a mais
         recente - e a que representa a situação atual. */
      if (!atual[a.momento]) atual[a.momento] = a;
      porCena.set(a.par, atual);
    }
    return [...porCena.entries()].filter(([, par]) => par.antes || par.depois);
  }, [anexos]);

  const emComparacao = new Set(comparacoes.flatMap(([, p]) => [p.antes?.id, p.depois?.id]));
  const soltos = anexos.filter((a) => !emComparacao.has(a.id));
  const imagens = soltos.filter(ehImagemDoAnexo);
  const documentos = soltos.filter((a) => !ehImagemDoAnexo(a));

  function receber(lista: FileList | null) {
    if (!lista?.length) return;
    setPendentes([...lista]);
    setErro(null);
  }

  async function confirmarEnvio(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEnviando(true);
    setErro(null);
    try {
      for (const arquivo of pendentes) {
        await enviarAnexo(arquivo, {
          projetoId,
          momento: f.get('momento') as Momento,
          par: String(f.get('par')).trim() || null,
          legenda: String(f.get('legenda')).trim() || null,
          marcoId: String(f.get('marco_id')) || null,
          enviadoPor: String(f.get('enviado_por')) || null,
        });
      }
      setPendentes([]);
      if (campoArquivo.current) campoArquivo.current.value = '';
      await recarregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  async function remover(a: Anexo) {
    if (!confirm(`Excluir "${a.nome_arquivo}"? O arquivo é apagado de vez.`)) return;
    try {
      await excluirAnexo(a);
      await recarregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }

  async function trocarMomento(a: Anexo, momento: Momento) {
    try {
      await atualizarAnexo(a.id, { momento });
      await recarregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }

  return (
    <section className="cartao overflow-hidden">
      <div className="flex items-center justify-between border-b border-linha px-4 py-3">
        <h2 className="font-titulo text-sm font-extrabold">
          Anexos {anexos.length > 0 && <span className="text-tinta-suave">({anexos.length})</span>}
        </h2>
        <span className="text-xs text-tinta-suave">Fotos e documentos · até 15 MB por arquivo</span>
      </div>

      <div className="p-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files); }}
          onClick={() => campoArquivo.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            arrastando ? 'border-roxo bg-roxo-suave' : 'border-linha hover:border-roxo-claro hover:bg-papel'
          }`}
        >
          <p className="text-sm font-bold text-roxo-escuro">Arraste arquivos aqui ou clique para escolher</p>
          <p className="mt-1 text-xs text-tinta-suave">
            Imagens são reduzidas automaticamente antes de subir. PDF, Word, Excel e PowerPoint também aceitos.
          </p>
          <input
            ref={campoArquivo} type="file" multiple className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
            onChange={(e) => receber(e.target.files)}
          />
        </div>

        {pendentes.length > 0 && (
          <form onSubmit={confirmarEnvio} className="mt-4 space-y-3 rounded-xl border border-linha bg-papel p-4">
            <p className="text-sm font-bold">
              {pendentes.length} arquivo(s) selecionado(s):{' '}
              <span className="font-normal text-tinta-suave">
                {pendentes.map((a) => a.name).join(', ')}
              </span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Momento">
                <select name="momento" className="campo" defaultValue="evidencia">
                  {MOMENTOS.map((m) => <option key={m} value={m}>{rotuloMomento[m]}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Cena (liga antes e depois)">
                <input name="par" list="cenas-anexos" className="campo" placeholder="Ex.: Corredor C" />
                <datalist id="cenas-anexos">
                  {cenas.map((c) => <option key={c} value={c} />)}
                </datalist>
              </Campo>
              <Campo rotulo="Marco">
                <select name="marco_id" className="campo" defaultValue="">
                  <option value="">Sem marco</option>
                  {marcos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Enviado por">
                <select name="enviado_por" className="campo" defaultValue="">
                  <option value="">Não informado</option>
                  {pessoas.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                </select>
              </Campo>
            </div>
            <Campo rotulo="Legenda">
              <input name="legenda" className="campo" placeholder="O que a foto ou o documento mostra" />
            </Campo>
            <div className="flex justify-end gap-2">
              <button type="button" className="botao-neutro" onClick={() => setPendentes([])} disabled={enviando}>
                Cancelar
              </button>
              <button type="submit" className="botao-primario" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </form>
        )}

        {erro && <div className="mt-3"><Aviso>{erro}</Aviso></div>}

        {comparacoes.length > 0 && (
          <div className="mt-5 space-y-4">
            <h3 className="rotulo">Antes e depois</h3>
            {comparacoes.map(([cena, par]) => (
              <div key={cena} className="rounded-xl border border-linha p-3">
                <p className="mb-2 text-sm font-bold">{cena}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['antes', 'depois'] as const).map((lado) => {
                    const a = par[lado];
                    return (
                      <div key={lado}>
                        <div className="mb-1 flex items-center justify-between">
                          <Selo cor={coresMomento[lado]}>{rotuloMomento[lado]}</Selo>
                          {a && (
                            <button className="text-xs font-bold text-vermelho" onClick={() => void remover(a)}>
                              Excluir
                            </button>
                          )}
                        </div>
                        {a ? (
                          <Miniatura anexo={a} aoAmpliar={setAmpliado} altura="h-56" />
                        ) : (
                          <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-linha text-xs text-tinta-suave">
                            Sem foto do {rotuloMomento[lado].toLowerCase()}
                          </div>
                        )}
                        {a?.legenda && <p className="mt-1 text-xs text-tinta-suave">{a.legenda}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {imagens.length > 0 && (
          <div className="mt-5">
            <h3 className="rotulo">Fotos</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {imagens.map((a) => (
                <div key={a.id} className="rounded-lg border border-linha p-2">
                  <Miniatura anexo={a} aoAmpliar={setAmpliado} altura="h-32" />
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <select
                      className="campo w-full px-1.5 py-0.5 text-[11px]" value={a.momento}
                      onChange={(e) => void trocarMomento(a, e.target.value as Momento)}
                    >
                      {MOMENTOS.map((m) => <option key={m} value={m}>{rotuloMomento[m]}</option>)}
                    </select>
                    <button className="text-[11px] font-bold text-vermelho" onClick={() => void remover(a)}>
                      Excluir
                    </button>
                  </div>
                  {a.legenda && <p className="mt-1 truncate text-[11px] text-tinta-suave" title={a.legenda}>{a.legenda}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {documentos.length > 0 && (
          <div className="mt-5">
            <h3 className="rotulo">Documentos</h3>
            <ul className="divide-y divide-linha rounded-lg border border-linha">
              {documentos.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="rounded bg-papel px-2 py-1 text-[10px] font-extrabold text-tinta-suave">
                    {iconeDoArquivo(a)}
                  </span>
                  <a
                    href={urlDoAnexo(a.caminho)} target="_blank" rel="noreferrer"
                    className="flex-1 truncate text-sm font-semibold text-roxo-escuro hover:underline"
                  >
                    {a.nome_arquivo}
                  </a>
                  <span className="hidden text-xs text-tinta-suave sm:block">
                    {formatarTamanho(a.tamanho_bytes)} · {formatarData(a.criado_em)}
                    {a.enviado_por && ` · ${a.enviado_por}`}
                  </span>
                  <button className="text-xs font-bold text-vermelho" onClick={() => void remover(a)}>Excluir</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!anexos.length && !pendentes.length && (
          <Vazio>Nenhum anexo ainda. Suba a foto do antes agora e a do depois quando a entrega acontecer.</Vazio>
        )}
      </div>

      <Modal
        aberto={!!ampliado} aoFechar={() => setAmpliado(null)} largura="max-w-4xl"
        titulo={ampliado?.legenda || ampliado?.nome_arquivo || 'Anexo'}
      >
        {ampliado && (
          <div>
            <img src={urlDoAnexo(ampliado.caminho)} alt={ampliado.legenda ?? ampliado.nome_arquivo} className="w-full rounded-lg" />
            <p className="mt-2 text-xs text-tinta-suave">
              {rotuloMomento[ampliado.momento]}
              {ampliado.par && ` · ${ampliado.par}`}
              {` · ${formatarTamanho(ampliado.tamanho_bytes)} · ${formatarData(ampliado.criado_em)}`}
              {ampliado.enviado_por && ` · enviado por ${ampliado.enviado_por}`}
            </p>
            <a
              href={urlDoAnexo(ampliado.caminho)} target="_blank" rel="noreferrer"
              className="mt-2 inline-block text-sm font-bold text-roxo-escuro hover:underline"
            >
              Abrir em tamanho original
            </a>
          </div>
        )}
      </Modal>
    </section>
  );
}

function Miniatura({ anexo, aoAmpliar, altura }: {
  anexo: Anexo; aoAmpliar: (a: Anexo) => void; altura: string;
}) {
  return (
    <button
      type="button" onClick={() => aoAmpliar(anexo)}
      className={`block w-full ${altura} overflow-hidden rounded-lg border border-linha bg-papel`}
      title={anexo.nome_arquivo}
    >
      <img
        src={urlDoAnexo(anexo.caminho)} alt={anexo.legenda ?? anexo.nome_arquivo}
        loading="lazy" className="h-full w-full object-cover transition hover:scale-105"
      />
    </button>
  );
}
