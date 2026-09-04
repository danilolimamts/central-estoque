import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/estado/dados';
import { coresStatus } from '@/config/tokens';
import { STATUS, rotuloStatus } from '@/dominio/tipos';
import type { StatusProjeto } from '@/dominio/tipos';

/* As situações continuam sendo as seis do banco — mexer no tipo do
   Postgres para esconder uma coluna do quadro seria caro e perigoso.
   O que se ajusta aqui é a aparência: qual aparece, com que nome e com
   que cor. É configuração da equipe, não de cada navegador, por isso
   vive numa tabela e não no armazenamento local. */

export interface AjusteDeStatus {
  usar: boolean;
  rotulo: string;
  cor: string;
}

export type ConfigDeStatus = Record<StatusProjeto, AjusteDeStatus>;

const CHAVE = 'status_projeto';

export function statusPadrao(): ConfigDeStatus {
  return Object.fromEntries(
    STATUS.map((s) => [s, { usar: true, rotulo: rotuloStatus[s], cor: coresStatus[s] }]),
  ) as ConfigDeStatus;
}

/* O que vem do banco pode estar incompleto (config antiga, situação
   nova); o padrão preenche o que faltar. */
function normalizar(valor: unknown): ConfigDeStatus {
  const base = statusPadrao();
  if (!valor || typeof valor !== 'object') return base;
  for (const s of STATUS) {
    const lido = (valor as Record<string, Partial<AjusteDeStatus>>)[s];
    if (!lido) continue;
    base[s] = {
      usar: lido.usar ?? true,
      rotulo: (lido.rotulo ?? '').trim() || rotuloStatus[s],
      cor: lido.cor ?? coresStatus[s],
    };
  }
  return base;
}

export async function lerConfigDeStatus(): Promise<ConfigDeStatus> {
  const { data, error } = await supabase
    .from('configuracoes').select('valor').eq('chave', CHAVE).maybeSingle();
  if (error) throw error;
  return normalizar((data as { valor?: unknown } | null)?.valor);
}

export async function salvarConfigDeStatus(config: ConfigDeStatus): Promise<void> {
  const { error } = await supabase.from('configuracoes')
    .upsert({ chave: CHAVE, valor: config }, { onConflict: 'chave' });
  if (error) throw error;
}

export interface Configuracao {
  status: ConfigDeStatus;
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useConfiguracao(): Configuracao {
  const [status, setStatus] = useState<ConfigDeStatus>(statusPadrao);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setStatus(await lerConfigDeStatus());
      setErro(null);
    } catch (falha) {
      /* Sem configuração o módulo funciona igual, com os nomes de
         fábrica: erro aqui não pode derrubar a tela inteira. */
      setErro(mensagemDeErro(falha));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { status, carregando, erro, recarregar };
}

export const ContextoStatus = createContext<ConfigDeStatus>(statusPadrao());

export const useStatusConfigurados = () => useContext(ContextoStatus);

/* Situação escondida não some de quem já a usa: o cartão continuaria
   invisível no quadro e ninguém entenderia para onde ele foi. */
export function statusEmUso(config: ConfigDeStatus, usados: StatusProjeto[]): StatusProjeto[] {
  return STATUS.filter((s) => config[s].usar || usados.includes(s));
}

export const rotuloDe = (config: ConfigDeStatus, s: StatusProjeto) => config[s].rotulo;
export const corDe = (config: ConfigDeStatus, s: StatusProjeto) => config[s].cor;
