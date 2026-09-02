-- O modulo passa a ser aberto, como os demais da Central: sem login,
-- acessado direto pelo hub. Quem chega e o papel "anon" do PostgREST.
-- As policies de usuario autenticado continuam no lugar; religar o
-- login e derrubar as policies de anon criadas aqui.
grant select, insert, update, delete on all tables in schema projetos to anon;
alter default privileges in schema projetos grant select, insert, update, delete on tables to anon;

-- Sem login nao existe autor_id: quem reporta se identifica escolhendo
-- o proprio nome na lista de pessoas.
alter table projetos.atualizacoes add column if not exists autor_nome text;

create policy pessoas_aberto on projetos.pessoas
  for all to anon using (true) with check (true);
create policy projetos_aberto on projetos.projetos
  for all to anon using (true) with check (true);
create policy marcos_aberto on projetos.marcos
  for all to anon using (true) with check (true);
create policy tarefas_aberto on projetos.tarefas
  for all to anon using (true) with check (true);
create policy atualizacoes_aberto on projetos.atualizacoes
  for all to anon using (true) with check (true);
