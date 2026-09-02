-- ---------------------------------------------------------------
-- Funcoes de apoio as policies.
-- SECURITY DEFINER de proposito: elas leem projetos.pessoas, que tem
-- RLS. Sem isso a policy de pessoas chamaria a si mesma em recursao.
-- ---------------------------------------------------------------

-- Qualquer pessoa consegue pedir um link magico ao Supabase. Se "estar
-- autenticado" bastasse para ler, um e-mail de fora veria a carteira
-- inteira. Acesso exige cadastro previo feito por um administrador; o
-- login apenas se liga a esse cadastro.
create or replace function projetos.tem_acesso()
returns boolean language sql stable security definer set search_path = projetos, pg_temp
as $$ select exists (select 1 from projetos.pessoas p where p.user_id = auth.uid() and p.ativo); $$;

create or replace function projetos.papel_atual()
returns projetos.papel language sql stable security definer set search_path = projetos, pg_temp
as $$
  select coalesce(
    (select p.papel from projetos.pessoas p where p.user_id = auth.uid() and p.ativo limit 1),
    'leitor'::projetos.papel
  );
$$;

create or replace function projetos.eh_admin()
returns boolean language sql stable security definer set search_path = projetos, pg_temp
as $$ select projetos.tem_acesso() and projetos.papel_atual() = 'admin'::projetos.papel; $$;

create or replace function projetos.pode_criar()
returns boolean language sql stable security definer set search_path = projetos, pg_temp
as $$ select projetos.tem_acesso() and projetos.papel_atual() in ('admin'::projetos.papel, 'editor'::projetos.papel); $$;

-- Escrita em um projeto: admin, ou a pessoa marcada como responsavel.
create or replace function projetos.pode_editar_projeto(p_projeto uuid)
returns boolean language sql stable security definer set search_path = projetos, pg_temp
as $$
  select projetos.eh_admin() or exists (
    select 1 from projetos.projetos pr
    join projetos.pessoas pe on pe.id = pr.responsavel_id
    where pr.id = p_projeto and pe.user_id = auth.uid() and pe.ativo
  );
$$;

create or replace function projetos.marcar_atualizacao()
returns trigger language plpgsql set search_path = projetos, pg_temp
as $$ begin new.atualizado_em := now(); return new; end; $$;

create trigger pessoas_atualizado_em before update on projetos.pessoas
  for each row execute function projetos.marcar_atualizacao();
create trigger projetos_atualizado_em before update on projetos.projetos
  for each row execute function projetos.marcar_atualizacao();
create trigger marcos_atualizado_em before update on projetos.marcos
  for each row execute function projetos.marcar_atualizacao();
create trigger tarefas_atualizado_em before update on projetos.tarefas
  for each row execute function projetos.marcar_atualizacao();

-- Um usuario pode corrigir o proprio cadastro, mas nao se promover.
create or replace function projetos.impede_autopromocao()
returns trigger language plpgsql security definer set search_path = projetos, pg_temp
as $$
begin
  if (new.papel is distinct from old.papel
      or new.ativo is distinct from old.ativo
      or new.user_id is distinct from old.user_id)
     and not projetos.eh_admin() then
    raise exception 'somente um administrador pode alterar papel, vinculo ou situacao de acesso';
  end if;
  return new;
end;
$$;

create trigger pessoas_papel_protegido before update on projetos.pessoas
  for each row execute function projetos.impede_autopromocao();

-- Primeiro acesso: liga o login ao cadastro feito pelo administrador.
-- O primeiro usuario do modulo nasce admin, senao nao haveria ninguem
-- para cadastrar os demais.
create or replace function projetos.vincular_novo_usuario()
returns trigger language plpgsql security definer set search_path = projetos, pg_temp
as $$
declare
  v_email text := lower(new.email);
  v_existe boolean;
begin
  update projetos.pessoas set user_id = new.id
   where lower(email) = v_email and user_id is null;

  if not found then
    select exists (select 1 from projetos.pessoas where user_id is not null) into v_existe;
    if not v_existe then
      insert into projetos.pessoas (user_id, nome, email, papel)
      values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(v_email, '@', 1)), v_email, 'admin');
    end if;
  end if;

  return new;
end;
$$;

create trigger projetos_vincular_novo_usuario after insert on auth.users
  for each row execute function projetos.vincular_novo_usuario();

-- ---------------------------------------------------------------
-- RLS: leitura para quem tem cadastro ativo, escrita conforme papel.
-- ---------------------------------------------------------------
alter table projetos.pessoas enable row level security;
alter table projetos.projetos enable row level security;
alter table projetos.marcos enable row level security;
alter table projetos.tarefas enable row level security;
alter table projetos.atualizacoes enable row level security;

-- A propria linha e sempre visivel: e como a tela sabe dizer "seu
-- e-mail ainda nao tem acesso" em vez de mostrar um vazio sem motivo.
create policy pessoas_leitura on projetos.pessoas
  for select to authenticated using (projetos.tem_acesso() or user_id = auth.uid());
create policy pessoas_insercao on projetos.pessoas
  for insert to authenticated with check (projetos.eh_admin());
create policy pessoas_alteracao on projetos.pessoas
  for update to authenticated
  using (projetos.eh_admin() or user_id = auth.uid())
  with check (projetos.eh_admin() or user_id = auth.uid());
create policy pessoas_exclusao on projetos.pessoas
  for delete to authenticated using (projetos.eh_admin());

create policy projetos_leitura on projetos.projetos
  for select to authenticated using (projetos.tem_acesso());
create policy projetos_insercao on projetos.projetos
  for insert to authenticated with check (projetos.pode_criar());
create policy projetos_alteracao on projetos.projetos
  for update to authenticated
  using (projetos.pode_editar_projeto(id)) with check (projetos.pode_editar_projeto(id));
create policy projetos_exclusao on projetos.projetos
  for delete to authenticated using (projetos.eh_admin());

create policy marcos_leitura on projetos.marcos
  for select to authenticated using (projetos.tem_acesso());
create policy marcos_escrita on projetos.marcos
  for all to authenticated
  using (projetos.pode_editar_projeto(projeto_id)) with check (projetos.pode_editar_projeto(projeto_id));

create policy tarefas_leitura on projetos.tarefas
  for select to authenticated using (projetos.tem_acesso());
create policy tarefas_escrita on projetos.tarefas
  for all to authenticated
  using (projetos.pode_editar_projeto(projeto_id)) with check (projetos.pode_editar_projeto(projeto_id));
-- Quem executa a tarefa atualiza o proprio andamento sem depender do
-- responsavel pelo projeto.
create policy tarefas_andamento_do_executor on projetos.tarefas
  for update to authenticated
  using (exists (select 1 from projetos.pessoas pe where pe.id = tarefas.responsavel_id and pe.user_id = auth.uid() and pe.ativo))
  with check (exists (select 1 from projetos.pessoas pe where pe.id = tarefas.responsavel_id and pe.user_id = auth.uid() and pe.ativo));

create policy atualizacoes_leitura on projetos.atualizacoes
  for select to authenticated using (projetos.tem_acesso());
create policy atualizacoes_insercao on projetos.atualizacoes
  for insert to authenticated
  with check (projetos.pode_editar_projeto(projeto_id) and autor_id = auth.uid());
-- Historico nao se reescreve: so o proprio autor corrige o que acabou
-- de lancar, e admin remove lancamento errado.
create policy atualizacoes_alteracao on projetos.atualizacoes
  for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());
create policy atualizacoes_exclusao on projetos.atualizacoes
  for delete to authenticated using (projetos.eh_admin() or autor_id = auth.uid());
