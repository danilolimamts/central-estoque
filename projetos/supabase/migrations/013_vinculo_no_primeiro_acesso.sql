-- O primeiro acesso quebrava com "Database error saving new user".
--
-- Motivo: o gatilho que liga o login novo ao cadastro (vincular_novo_usuario)
-- faz um update em projetos.pessoas, e o gatilho que impede autopromocao
-- barrava esse update por nao haver administrador logado — durante o cadastro
-- no Supabase Auth nao existe sessao nenhuma.
--
-- Sem sessao nao ha usuario para se promover: quem esta agindo e o proprio
-- banco (gatilho ou chave de servico). A protecao continua valendo para todo
-- mundo que esta logado, que e onde ela importa.
create or replace function projetos.impede_autopromocao()
returns trigger language plpgsql security definer set search_path = projetos, pg_temp
as $$
begin
  if (new.papel is distinct from old.papel
      or new.ativo is distinct from old.ativo
      or new.user_id is distinct from old.user_id)
     and auth.uid() is not null
     and not projetos.eh_admin() then
    raise exception 'somente um administrador pode alterar papel, vinculo ou situacao de acesso';
  end if;
  return new;
end;
$$;
