import { useSessao } from '@/estado/sessao';
import { Aviso } from '@/componentes/ui';

/* E-mail autenticado que nao tem cadastro no modulo. O banco ja o
   bloqueia; esta tela existe para o usuario entender o motivo. */
export default function SemAcesso() {
  const { sessao, sair, eu, recarregarPerfil } = useSessao();
  const inativo = eu && !eu.ativo;

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-alto">
        <h1 className="font-titulo text-lg font-extrabold">Acesso não liberado</h1>
        <p className="mb-4 mt-1 text-sm text-tinta-suave">
          O e-mail <strong>{sessao?.user.email}</strong>{' '}
          {inativo ? 'está com o acesso suspenso.' : 'ainda não está cadastrado no módulo de Projetos.'}
        </p>
        <Aviso tipo="info">
          Peça a um administrador do módulo para cadastrar seu e-mail em Pessoas. Depois
          disso, clique em “Já fui liberado”.
        </Aviso>
        <div className="mt-4 flex gap-2">
          <button className="botao-primario flex-1" onClick={() => void recarregarPerfil()}>Já fui liberado</button>
          <button className="botao-neutro" onClick={() => void sair()}>Sair</button>
        </div>
      </div>
    </div>
  );
}
