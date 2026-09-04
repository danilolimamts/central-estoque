-- ---------------------------------------------------------------
-- Quem nao e administrador enxerga tudo, mas so mexe no que criou.
--
-- Antes, editar dependia de ser o responsavel pelo projeto. Isso servia
-- para delegar trabalho; agora o modulo e compartilhado para consulta,
-- e a regra passa a ser a autoria: cada um cuida do que lancou, o resto
-- e leitura. Administrador continua podendo tudo.
-- ---------------------------------------------------------------

-- Sem esta coluna preenchida nao ha como saber quem criou. O valor vem
-- do gatilho, e nao do app: assim vale tambem para linha criada por
-- fora da tela, e ninguem consegue se declarar autor de outra pessoa.
create or replace function projetos.marcar_criador()
returns trigger language plpgsql security definer set search_path = projetos, pg_temp
as $$ begin new.criado_por := coalesce(new.criado_por, auth.uid()); return new; end; $$;

drop trigger if exists projetos_marcar_criador on projetos.projetos;
create trigger projetos_marcar_criador before insert on projetos.projetos
  for each row execute function projetos.marcar_criador();

revoke execute on function projetos.marcar_criador() from anon, authenticated;

create or replace function projetos.pode_editar_projeto(p_projeto uuid)
returns boolean language sql stable security definer set search_path = projetos, pg_temp
as $$
  select projetos.eh_admin() or (
    projetos.tem_acesso() and exists (
      select 1 from projetos.projetos pr
      where pr.id = p_projeto and pr.criado_por = auth.uid()
    )
  );
$$;

-- ---------------------------------------------------------------
-- Arquivos: o balde e um so, entao a permissao vem do caminho, que
-- comeca pelo id do projeto ("<projeto>/arquivo" nos anexos,
-- "paginas/<projeto>/arquivo" nas imagens coladas no texto). Sem isso
-- qualquer pessoa logada apagaria o arquivo de qualquer projeto, mesmo
-- sem poder apagar a linha que aponta para ele.
-- ---------------------------------------------------------------
create or replace function projetos.pode_mexer_no_arquivo(p_caminho text)
returns boolean language sql stable security definer set search_path = projetos, pg_temp
as $$
  select projetos.eh_admin() or exists (
    select 1 from projetos.projetos pr
    where projetos.pode_editar_projeto(pr.id)
      and (p_caminho like pr.id::text || '/%' or p_caminho like 'paginas/' || pr.id::text || '/%')
  );
$$;

revoke execute on function projetos.pode_mexer_no_arquivo(text) from anon;

drop policy if exists anexos_projetos_envio on storage.objects;
drop policy if exists anexos_projetos_exclusao on storage.objects;

create policy anexos_projetos_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'anexos-projetos' and projetos.pode_mexer_no_arquivo(name));
create policy anexos_projetos_exclusao on storage.objects
  for delete to authenticated
  using (bucket_id = 'anexos-projetos' and projetos.pode_mexer_no_arquivo(name));

-- As pessoas que recebem o link entram para acompanhar e registrar o
-- que for delas: criar podem, mexer no alheio nao.
alter table projetos.pessoas disable trigger pessoas_papel_protegido;
update projetos.pessoas set papel = 'editor'
 where lower(email) in ('brunobizetto@lojadomecanico.com.br', 'edernascimento@lojadomecanico.com.br');
alter table projetos.pessoas enable trigger pessoas_papel_protegido;
