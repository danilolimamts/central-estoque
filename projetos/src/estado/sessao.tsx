import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Pessoa } from '@/dominio/tipos';

interface Sessao {
  carregando: boolean;
  sessao: Session | null;
  /* Cadastro do usuario no modulo. Nulo com sessao ativa significa
     e-mail autenticado mas sem acesso liberado por um administrador. */
  eu: Pessoa | null;
  ehAdmin: boolean;
  podeCriar: boolean;
  entrar: (email: string) => Promise<void>;
  sair: () => Promise<void>;
  recarregarPerfil: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [eu, setEu] = useState<Pessoa | null>(null);
  const [carregando, setCarregando] = useState(true);

  const buscarPerfil = useCallback(async (userId: string | undefined) => {
    if (!userId) { setEu(null); return; }
    const { data } = await supabase
      .from('pessoas').select('*').eq('user_id', userId).maybeSingle();
    setEu((data as Pessoa) ?? null);
  }, []);

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!vivo) return;
      setSessao(data.session);
      await buscarPerfil(data.session?.user.id);
      setCarregando(false);
    });
    const { data: assinatura } = supabase.auth.onAuthStateChange(async (_evento, nova) => {
      setSessao(nova);
      await buscarPerfil(nova?.user.id);
      setCarregando(false);
    });
    return () => { vivo = false; assinatura.subscription.unsubscribe(); };
  }, [buscarPerfil]);

  const valor = useMemo<Sessao>(() => ({
    carregando,
    sessao,
    eu,
    ehAdmin: eu?.papel === 'admin' && eu.ativo,
    podeCriar: !!eu?.ativo && (eu.papel === 'admin' || eu.papel === 'editor'),
    entrar: async (email: string) => {
      /* O link magico volta para a propria pagina. Em producao a URL
         precisa estar liberada em Authentication > URL Configuration. */
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: window.location.href.split('#')[0] },
      });
      if (error) throw error;
    },
    sair: async () => { await supabase.auth.signOut(); setEu(null); },
    recarregarPerfil: () => buscarPerfil(sessao?.user.id),
  }), [carregando, sessao, eu, buscarPerfil]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useSessao precisa estar dentro de ProvedorSessao');
  return ctx;
}
