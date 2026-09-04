-- ---------------------------------------------------------------
-- Ajustes da equipe que nao sao dado de projeto: por enquanto, quais
-- situacoes aparecem, com que nome e com que cor. Uma tabela chave/
-- valor porque a proxima configuracao vai ser outra e nao vale criar
-- uma coluna por ideia.
--
-- As situacoes continuam sendo as seis do tipo do Postgres: esconder
-- "Em risco" e decisao de tela, nao de banco. Mexer no tipo obrigaria
-- a reescrever dado existente para tirar uma coluna do quadro.
-- ---------------------------------------------------------------
create table if not exists projetos.configuracoes (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

grant select, insert, update, delete on projetos.configuracoes to authenticated;

alter table projetos.configuracoes enable row level security;

-- Quem tem acesso le; so administrador muda. Configuracao vale para
-- todo mundo, entao nao pode ser mexida por quem so acompanha.
create policy configuracoes_leitura on projetos.configuracoes
  for select to authenticated using (projetos.tem_acesso());
create policy configuracoes_escrita on projetos.configuracoes
  for all to authenticated using (projetos.eh_admin()) with check (projetos.eh_admin());

create trigger configuracoes_atualizado_em before update on projetos.configuracoes
  for each row execute function projetos.marcar_atualizacao();
