import { useState } from 'react';
import { useSessao } from '@/estado/sessao';
import { Aviso } from '@/componentes/ui';

export default function Login() {
  const { entrar } = useSessao();
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await entrar(email);
      setEnviado(true);
    } catch (falha) {
      setErro((falha as Error).message ?? 'Não foi possível enviar o link.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-alto">
        <img src="./brand/Logo_LDM_hor_2.png" alt="Loja do Mecânico" className="mb-6 h-10" />
        <h1 className="font-titulo text-xl font-extrabold">Projetos — CD Cajamar</h1>
        <p className="mb-5 mt-1 text-sm text-tinta-suave">
          Acompanhamento de projetos e iniciativas do CD.
        </p>

        {enviado ? (
          <Aviso tipo="sucesso">
            Link de acesso enviado para <strong>{email}</strong>. Abra o e-mail neste mesmo
            navegador para entrar.
          </Aviso>
        ) : (
          <form onSubmit={enviar} className="space-y-3">
            <label className="block">
              <span className="rotulo">E-mail corporativo</span>
              <input
                type="email" required autoFocus className="campo" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="nome@lojadomecanico.com.br"
              />
            </label>
            <button type="submit" className="botao-primario w-full" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Receber link de acesso'}
            </button>
            {erro && <Aviso>{erro}</Aviso>}
            <p className="pt-1 text-xs text-tinta-suave">
              O acesso é liberado por um administrador do módulo. Sem senha: o login chega
              por e-mail.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
