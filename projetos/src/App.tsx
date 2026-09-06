import { useMemo, useState } from 'react';
import Acesso from '@/paginas/Acesso';
import Painel from '@/paginas/Painel';
import ListaProjetos from '@/paginas/ListaProjetos';
import DetalheProjeto from '@/paginas/DetalheProjeto';
import Cronograma from '@/paginas/Cronograma';
import Pessoas from '@/paginas/Pessoas';
import { Aviso, Carregando } from '@/componentes/ui';
import { useCarteira } from '@/estado/dados';
import { ContextoPermissoes, permissoesDe, sair, useSessao } from '@/estado/sessao';
import { ContextoSituacoes, useConfiguracao } from '@/estado/configuracao';
import { rotuloPapel } from '@/dominio/tipos';
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
  const [aba, setAba] = useState<Aba>('painel');
  const [aberto, setAberto] = useState<Projeto | null>(null);
  const sessao = useSessao();
  /* Nada de dado antes de a sessao estar resolvida: consulta enviada sem
     token chega ao banco como visitante e volta recusada. */
  const pronto = !sessao.carregando && !!sessao.usuario;
  const carteira = useCarteira(pronto);
  const permissoes = useMemo(() => permissoesDe(sessao), [sessao]);
  const configuracao = useConfiguracao(pronto);

  /* O projeto aberto vem sempre da lista recarregada: guardar o objeto
     no estado deixaria a tela com dados velhos apos uma edicao. */
  const selecionado = aberto ? carteira.projetos.find((p) => p.id === aberto.id) ?? aberto : null;

  if (sessao.carregando) return <Carregando />;
  if (!sessao.usuario) return <Acesso />;

  /* Logado sem cadastro ativo: o banco nao devolve nada para essa
     pessoa, entao a tela diz o motivo em vez de mostrar uma carteira
     vazia que pareceria defeito. */
  if (!sessao.pessoa?.ativo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy px-4">
        <div className="cartao max-w-sm p-6 text-center">
          <h1 className="font-titulo text-lg font-extrabold">Acesso ainda não liberado</h1>
          <p className="mt-2 text-sm text-tinta-suave">
            O login de <strong>{sessao.usuario.email}</strong> funcionou, mas este e-mail não está
            cadastrado como pessoa ativa do módulo. Peça a um administrador para cadastrá-lo
            com exatamente este endereço.
          </p>
          <button className="botao-neutro mt-4" onClick={() => void sair()}>Sair</button>
        </div>
      </div>
    );
  }

  return (
    <ContextoPermissoes.Provider value={permissoes}>
    <ContextoSituacoes.Provider value={configuracao.situacoes}>
    <div className="min-h-screen">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-tela flex-wrap items-center gap-5 px-6 py-5 xl:px-10">
          {/* O arquivo em brand/ tem 91 px de altura. Em 72 px a marca
              domina o cabecalho e ainda sobra pixel de origem; passar
              disso e esticar o PNG, que embaça. No celular cai para
              56 px para nao empurrar o titulo para a linha de baixo. */}
          <img
            src="./brand/Logo_LDM_hor_2_Branco.png" alt="Loja do Mecânico"
            width={188} height={72}
            className="h-14 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,.4)] sm:h-[72px]"
          />
          <span className="hidden h-12 w-px bg-white/20 sm:block" />
          <div className="mr-auto">
            <h1 className="font-titulo text-2xl font-extrabold leading-tight">Projetos</h1>
            <p className="text-[13px] text-white/60">CD Cajamar · acompanhamento de projetos e iniciativas</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold text-white/90">{sessao.pessoa.nome}</p>
            <p className="text-white/50">{rotuloPapel[sessao.pessoa.papel]}</p>
            <div className="mt-1 flex gap-3 font-bold text-white/70">
              <a href="../" className="hover:text-white">← Central</a>
              <button className="hover:text-white" onClick={() => void sair()}>Sair</button>
            </div>
          </div>
        </div>
        <nav className="mx-auto flex max-w-tela gap-1 px-6 xl:px-10">
          {ABAS.map((a) => (
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

      <main className="mx-auto max-w-tela px-6 py-6 xl:px-10">
        {carteira.erro && <Aviso>{carteira.erro}</Aviso>}
        {carteira.carregando ? <Carregando /> : selecionado ? (
          <DetalheProjeto
            projeto={selecionado}
            projetos={carteira.projetos}
            pessoas={carteira.pessoas}
            recarregarConfig={configuracao.recarregar}
            aoVoltar={() => setAberto(null)}
            aoAbrir={setAberto}
            recarregar={carteira.recarregar}
          />
        ) : (
          <>
            {aba === 'painel' && <Painel projetos={carteira.projetos} pessoas={carteira.pessoas} aoAbrir={setAberto} />}
            {aba === 'projetos' && (
              <ListaProjetos
                projetos={carteira.projetos} pessoas={carteira.pessoas}
                aoAbrir={setAberto} recarregar={carteira.recarregar}
              />
            )}
            {aba === 'cronograma' && <Cronograma projetos={carteira.projetos} aoAbrir={setAberto} />}
            {aba === 'pessoas' && <Pessoas pessoas={carteira.pessoas} recarregar={carteira.recarregar} />}
          </>
        )}
      </main>

      <footer className="pb-8 text-center text-[11px] text-tinta-suave">
        Central de Estoque · Loja do Mecânico — versão {__VERSAO__}
      </footer>
    </div>
    </ContextoSituacoes.Provider>
    </ContextoPermissoes.Provider>
  );
}
