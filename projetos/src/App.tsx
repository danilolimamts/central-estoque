import { useState } from 'react';
import Login from '@/paginas/Login';
import SemAcesso from '@/paginas/SemAcesso';
import Painel from '@/paginas/Painel';
import ListaProjetos from '@/paginas/ListaProjetos';
import DetalheProjeto from '@/paginas/DetalheProjeto';
import Cronograma from '@/paginas/Cronograma';
import Pessoas from '@/paginas/Pessoas';
import { Aviso, Carregando } from '@/componentes/ui';
import { useCarteira } from '@/estado/dados';
import { useSessao } from '@/estado/sessao';
import type { Projeto } from '@/dominio/tipos';

declare const __VERSAO__: string;

type Aba = 'painel' | 'projetos' | 'cronograma' | 'pessoas';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'painel', rotulo: 'Painel' },
  { id: 'projetos', rotulo: 'Projetos' },
  { id: 'cronograma', rotulo: 'Cronograma' },
  { id: 'pessoas', rotulo: 'Pessoas' },
];

export default function App() {
  const { carregando, sessao, eu, ehAdmin, podeCriar, sair } = useSessao();
  const [aba, setAba] = useState<Aba>('painel');
  const [aberto, setAberto] = useState<Projeto | null>(null);
  const carteira = useCarteira(!!eu?.ativo);

  if (carregando) return <div className="p-10"><Carregando /></div>;
  if (!sessao) return <Login />;
  if (!eu || !eu.ativo) return <SemAcesso />;

  /* O projeto aberto vem sempre da lista recarregada: guardar o objeto
     no estado deixaria a tela com dados velhos apos uma edicao. */
  const selecionado = aberto ? carteira.projetos.find((p) => p.id === aberto.id) ?? aberto : null;
  const podeEditar = (p: Projeto) => ehAdmin || (!!eu && p.responsavel_id === eu.id);

  return (
    <div className="min-h-screen">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-4 px-6 py-4">
          <img src="./brand/Logo_LDM_hor_2_Branco.png" alt="Loja do Mecânico" className="h-8" />
          <div className="mr-auto">
            <h1 className="font-titulo text-lg font-extrabold leading-tight">Projetos</h1>
            <p className="text-xs text-white/60">CD Cajamar · acompanhamento de projetos e iniciativas</p>
          </div>
          <a href="../" className="text-xs font-bold text-white/70 hover:text-white">← Central</a>
          <div className="text-right text-xs">
            <p className="font-bold">{eu.nome}</p>
            <button className="text-white/60 hover:text-white" onClick={() => void sair()}>Sair</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1240px] gap-1 px-6">
          {ABAS.filter((a) => a.id !== 'pessoas' || ehAdmin || eu.papel === 'editor').map((a) => (
            <button
              key={a.id}
              onClick={() => { setAba(a.id); setAberto(null); }}
              className={`rounded-t-lg px-4 py-2 text-sm font-bold transition ${
                aba === a.id ? 'bg-papel text-navy' : 'text-white/70 hover:bg-white/10'
              }`}
            >{a.rotulo}</button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1240px] px-6 py-6">
        {carteira.erro && <Aviso>{carteira.erro}</Aviso>}
        {carteira.carregando ? <Carregando /> : selecionado ? (
          <DetalheProjeto
            projeto={selecionado}
            pessoas={carteira.pessoas}
            podeEditar={podeEditar(selecionado)}
            ehAdmin={ehAdmin}
            euId={eu.id}
            authId={sessao.user.id}
            aoVoltar={() => setAberto(null)}
            recarregar={carteira.recarregar}
          />
        ) : (
          <>
            {aba === 'painel' && <Painel projetos={carteira.projetos} pessoas={carteira.pessoas} aoAbrir={setAberto} />}
            {aba === 'projetos' && (
              <ListaProjetos
                projetos={carteira.projetos} pessoas={carteira.pessoas} podeCriar={podeCriar}
                aoAbrir={setAberto} recarregar={carteira.recarregar}
              />
            )}
            {aba === 'cronograma' && <Cronograma projetos={carteira.projetos} aoAbrir={setAberto} />}
            {aba === 'pessoas' && <Pessoas pessoas={carteira.pessoas} ehAdmin={ehAdmin} recarregar={carteira.recarregar} />}
          </>
        )}
      </main>

      <footer className="pb-8 text-center text-[11px] text-tinta-suave">
        Central de Estoque · Loja do Mecânico — versão {__VERSAO__}
      </footer>
    </div>
  );
}
