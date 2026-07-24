/* ============================================================
   Shell da aplicacao: barra de topo com filete laranja, menu
   lateral dos elevadores e roteamento entre as paginas.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { useDados, useAcoes } from './store/useDados';
import { Importar } from './pages/Importar';
import { DashboardGeral } from './pages/DashboardGeral';
import { StatusProjeto } from './pages/StatusProjeto';
import { agruparConjuntos } from './domain/equalizacao';
import { auditarValoracao } from './domain/valoracao';
import { coresStatus } from './config/tokens';
import { FOTOS_PAIS } from './dados/fotosPais';
import { Botao, Busca, Vazio } from './components/ui';
import type { Componente, StatusConjunto } from './domain/tipos';

type Pagina = 'geral' | 'projeto';

/* Menu lateral com os elevadores (item pai) e a foto do produto. */
function MenuElevadores({
  componentes,
  fotos,
}: {
  componentes: Componente[];
  fotos: Map<string, string>;
}) {
  const [busca, setBusca] = useState('');

  const elevadores = useMemo(() => {
    const conjuntos = new Map(agruparConjuntos(componentes).map((c) => [c.chave, c]));
    const valoracoes = new Map(auditarValoracao(componentes).map((v) => [v.itemVolMultiplo, v]));
    const vistos = new Map<string, { item: string; nome: string; marca: string; ton: string; status: StatusConjunto }>();
    for (const c of componentes) {
      if (!c.itemVolMultiplo || vistos.has(c.itemVolMultiplo)) continue;
      vistos.set(c.itemVolMultiplo, {
        item: c.itemVolMultiplo,
        nome: c.nomeItemVolMultiplo,
        marca: c.marca,
        ton: c.toneladaFixa,
        status: conjuntos.get(c.chave)?.status ?? 'SEM ESTOQUE',
      });
    }
    return [...vistos.values()].map((e) => ({ ...e, diagnostico: valoracoes.get(e.item)?.diagnostico }));
  }, [componentes]);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return elevadores;
    return elevadores.filter((e) => `${e.item} ${e.nome} ${e.marca}`.toLowerCase().includes(b));
  }, [elevadores, busca]);

  return (
    <aside className="cartao self-start overflow-hidden">
      <div className="px-4 pb-2.5 pt-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
        <h3 className="text-[13px] uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
          Elevadores
        </h3>
        <div className="num mt-0.5 text-[22px]">{elevadores.length}</div>
        <div className="mt-2.5">
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar item ou marca…" />
        </div>
      </div>
      <div className="max-h-[560px] overflow-y-auto">
        {filtrados.length === 0 ? (
          <Vazio>Nenhum elevador encontrado.</Vazio>
        ) : (
          filtrados.map((e) => {
            const foto = fotos.get(String(e.item));
            return (
              <div
                key={e.item}
                className="flex cursor-default items-center gap-2.5 px-3.5 py-2.5"
                style={{ borderBottom: '1px solid var(--line)' }}
                title={e.nome}
              >
                <div
                  className="h-10 w-10 flex-none overflow-hidden rounded-md"
                  style={{ border: '1px solid var(--line)', background: 'var(--surface-2)' }}
                >
                  {foto ? (
                    <img src={foto} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[10px]" style={{ color: 'var(--ink-soft)' }}>
                      sem foto
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {e.item}
                  </div>
                  <div className="truncate text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                    {[e.marca, e.ton].filter(Boolean).join(' · ') || e.nome}
                  </div>
                </div>
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: coresStatus[e.status] }}
                  title={e.status}
                />
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

export default function App() {
  const { dados, carregando, erro, importar, carregarDemo, limpar } = useDados();
  const [pagina, setPagina] = useState<Pagina>('geral');
  const [tema, setTema] = useState<'claro' | 'escuro' | null>(null);

  const hoje = useMemo(() => new Date(), []);
  const acoes = useAcoes(dados?.acoes, hoje);
  /* As fotos ja vem embutidas por codigo do item pai; o que for importado
     do DE_PARA_LINK_FOTO entra por cima, para atualizar ou cobrir itens
     novos sem precisar mexer no codigo. */
  const fotos = useMemo(() => {
    const m = new Map<string, string>(Object.entries(FOTOS_PAIS));
    for (const [item, url] of dados?.fotos ?? []) m.set(String(item), url);
    return m;
  }, [dados]);

  useEffect(() => {
    if (tema) document.documentElement.setAttribute('data-theme', tema === 'escuro' ? 'dark' : 'light');
  }, [tema]);

  /* O app sempre abre na tela de importacao, que e o caminho real de uso.
     Os dados de exemplo so entram quando pedidos de proposito, pela URL
     (?exemplo=1) ou pelo botao da propria tela. */
  useEffect(() => {
    if (carregando || dados) return;
    if (new URLSearchParams(window.location.search).has('exemplo')) void carregarDemo();
  }, [carregando, dados, carregarDemo]);

  function alternarTema() {
    const escuroAgora =
      tema === null ? window.matchMedia('(prefers-color-scheme: dark)').matches : tema === 'escuro';
    setTema(escuroAgora ? 'claro' : 'escuro');
  }

  return (
    <>
      <header className="sticky top-0 z-20" style={{ background: 'var(--navy)', borderBottom: '4px solid var(--laranja)' }}>
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-5 py-3">
          <div
            className="grid h-10 w-10 flex-none place-items-center rounded-lg text-[15px] font-bold text-white"
            style={{ background: 'var(--laranja)', fontFamily: 'Poppins, sans-serif' }}
          >
            LDM
          </div>
          <div>
            <h1 className="text-[16.5px] text-white">Central de Equalização de Elevadores</h1>
            <p className="mt-px text-[11.5px]" style={{ color: '#B9C0E6' }}>
              CD Cajamar · Controle de Estoque · Loja do Mecânico
            </p>
          </div>

          {dados && (
            <nav className="flex gap-1" role="tablist" aria-label="Páginas">
              {([['geral', 'Dashboard Geral'], ['projeto', 'Status Projeto']] as const).map(([id, rotulo]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={pagina === id}
                  onClick={() => setPagina(id)}
                  className="rounded-lg px-3.5 py-2 text-[13px] font-medium"
                  style={{
                    fontFamily: 'Poppins, sans-serif',
                    background: pagina === id ? 'rgba(255,255,255,.12)' : 'transparent',
                    color: pagina === id ? '#fff' : '#C3C9EA',
                  }}
                >
                  {rotulo}
                </button>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2.5">
            {dados?.demonstracao && (
              <span
                className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide"
                style={{ background: 'rgba(250,70,22,.18)', color: '#FFD9CC', border: '1px solid rgba(250,70,22,.5)' }}
                title="Números ilustrativos. A planilha do CD entra pela tela de importação."
              >
                Dados de exemplo
              </span>
            )}
            {dados && !dados.demonstracao && (
              <span className="hidden text-[11.5px] sm:block" style={{ color: '#B9C0E6' }}>
                {dados.arquivo} · {new Date(dados.importadoEm).toLocaleDateString('pt-BR')}
                {dados.semPersistencia && ' · só nesta sessão'}
              </span>
            )}
            {dados && (
              <Botao variante="secundario" aoClicar={limpar}>
                {dados.demonstracao ? 'Importar planilha' : 'Nova importação'}
              </Botao>
            )}
            <button
              onClick={alternarTema}
              aria-label="Alternar tema"
              className="h-8.5 w-8.5 rounded-lg text-[15px] text-white"
              style={{ width: 34, height: 34, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)' }}
            >
              ◐
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-5 pb-10 pt-4">
        {carregando ? (
          <Vazio>Carregando dados salvos…</Vazio>
        ) : !dados ? (
          <Importar aoImportar={importar} aoVerExemplo={carregarDemo} erro={erro} />
        ) : (
          <div className="grid gap-4.5 lg:grid-cols-[268px_1fr]" style={{ gap: 18 }}>
            <MenuElevadores componentes={dados.componentes} fotos={fotos} />
            <main className="min-w-0">
              {pagina === 'geral' ? (
                <DashboardGeral componentes={dados.componentes} fotos={fotos} />
              ) : (
                <StatusProjeto acoes={acoes} hoje={hoje} />
              )}
            </main>
          </div>
        )}
      </div>
    </>
  );
}
