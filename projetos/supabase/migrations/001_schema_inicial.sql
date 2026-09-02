-- Aplicada no projeto Supabase "Estoque Project" (jfvnswafpeshyfweoadg).
-- Modulo de Projetos da Central. Fica em schema proprio para conviver
-- com os outros modulos do mesmo projeto Supabase sem misturar tabelas.
create schema if not exists projetos;

create type projetos.papel as enum ('admin', 'editor', 'leitor');
create type projetos.status_projeto as enum ('nao_iniciado', 'em_andamento', 'em_risco', 'pausado', 'concluido', 'cancelado');
create type projetos.prioridade as enum ('baixa', 'media', 'alta', 'critica');
create type projetos.status_tarefa as enum ('pendente', 'em_andamento', 'concluida', 'bloqueada');

-- Pessoas existem independentemente de login: da para cadastrar um
-- responsavel que ainda nao acessou o sistema. O vinculo com auth.users
-- acontece depois, pelo e-mail, no primeiro acesso.
create table projetos.pessoas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  nome text not null,
  email text not null unique,
  area text,
  papel projetos.papel not null default 'leitor',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table projetos.projetos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nome text not null,
  descricao text,
  area text,
  responsavel_id uuid references projetos.pessoas(id) on delete set null,
  status projetos.status_projeto not null default 'nao_iniciado',
  prioridade projetos.prioridade not null default 'media',
  inicio_previsto date,
  fim_previsto date,
  inicio_real date,
  fim_real date,
  percentual smallint not null default 0 check (percentual between 0 and 100),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint periodo_previsto_coerente check (fim_previsto is null or inicio_previsto is null or fim_previsto >= inicio_previsto),
  constraint periodo_real_coerente check (fim_real is null or inicio_real is null or fim_real >= inicio_real)
);

create table projetos.marcos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos.projetos(id) on delete cascade,
  nome text not null,
  descricao text,
  data_prevista date,
  data_real date,
  concluido boolean not null default false,
  ordem smallint not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table projetos.tarefas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos.projetos(id) on delete cascade,
  marco_id uuid references projetos.marcos(id) on delete set null,
  titulo text not null,
  descricao text,
  responsavel_id uuid references projetos.pessoas(id) on delete set null,
  status projetos.status_tarefa not null default 'pendente',
  inicio date,
  prazo date,
  concluida_em date,
  ordem smallint not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Historico de acompanhamento (o "status semanal"). Uma linha por
-- reporte, nunca sobrescrita: e o que permite ver a evolucao.
create table projetos.atualizacoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos.projetos(id) on delete cascade,
  data date not null default current_date,
  texto text not null,
  status_reportado projetos.status_projeto,
  percentual smallint check (percentual between 0 and 100),
  riscos text,
  proximos_passos text,
  autor_id uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index pessoas_user_id_idx on projetos.pessoas (user_id);
create index projetos_status_idx on projetos.projetos (status);
create index projetos_responsavel_idx on projetos.projetos (responsavel_id);
create index projetos_fim_previsto_idx on projetos.projetos (fim_previsto);
create index marcos_projeto_idx on projetos.marcos (projeto_id, ordem);
create index tarefas_projeto_idx on projetos.tarefas (projeto_id, ordem);
create index tarefas_marco_idx on projetos.tarefas (marco_id);
create index tarefas_responsavel_idx on projetos.tarefas (responsavel_id);
create index atualizacoes_projeto_idx on projetos.atualizacoes (projeto_id, data desc);

-- PostgREST atende pelo papel do usuario autenticado; sem grant no
-- schema e nas tabelas nem a policy chega a ser avaliada.
grant usage on schema projetos to anon, authenticated;
grant select, insert, update, delete on all tables in schema projetos to authenticated;
alter default privileges in schema projetos grant select, insert, update, delete on tables to authenticated;
