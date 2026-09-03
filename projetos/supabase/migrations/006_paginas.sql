-- Paginas: a folha onde se escreve o comportamento da tela, com a
-- imagem no meio do texto e o fluxograma logo abaixo. E o material que
-- nao cabe em campo de formulario nem em anexo solto.
create table projetos.paginas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos.projetos(id) on delete cascade,
  titulo text not null default 'Nova página',
  -- Lista ordenada de blocos: {id, tipo: 'texto'|'fluxo', conteudo}.
  -- Guardar a pagina inteira em um documento so torna o salvamento
  -- atomico e a reordenacao trivial - com uma linha por bloco, cada
  -- arrastar viraria varias escritas que podem falhar pela metade.
  blocos jsonb not null default '[]'::jsonb,
  ordem smallint not null default 0,
  atualizado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Historico: cada salvamento guarda a versao anterior. Sem isso, um
-- texto apagado por engano nao volta.
create table projetos.paginas_versoes (
  id uuid primary key default gen_random_uuid(),
  pagina_id uuid not null references projetos.paginas(id) on delete cascade,
  titulo text not null,
  blocos jsonb not null,
  salvo_por text,
  criado_em timestamptz not null default now()
);

create index paginas_projeto_idx on projetos.paginas (projeto_id, ordem);
create index paginas_versoes_pagina_idx on projetos.paginas_versoes (pagina_id, criado_em desc);

create trigger paginas_atualizado_em before update on projetos.paginas
  for each row execute function projetos.marcar_atualizacao();

grant select, insert, update, delete on projetos.paginas to anon, authenticated;
grant select, insert, update, delete on projetos.paginas_versoes to anon, authenticated;

alter table projetos.paginas enable row level security;
alter table projetos.paginas_versoes enable row level security;

-- Modulo aberto: mesma regra das demais tabelas.
create policy paginas_aberto on projetos.paginas
  for all to anon using (true) with check (true);
create policy paginas_versoes_aberto on projetos.paginas_versoes
  for all to anon using (true) with check (true);

-- Mantidas para o dia em que o login voltar.
create policy paginas_leitura on projetos.paginas
  for select to authenticated using (projetos.tem_acesso());
create policy paginas_escrita on projetos.paginas
  for all to authenticated
  using (projetos.pode_editar_projeto(projeto_id))
  with check (projetos.pode_editar_projeto(projeto_id));
create policy paginas_versoes_leitura on projetos.paginas_versoes
  for select to authenticated using (projetos.tem_acesso());
create policy paginas_versoes_escrita on projetos.paginas_versoes
  for all to authenticated
  using (exists (select 1 from projetos.paginas p where p.id = pagina_id and projetos.pode_editar_projeto(p.projeto_id)))
  with check (exists (select 1 from projetos.paginas p where p.id = pagina_id and projetos.pode_editar_projeto(p.projeto_id)));
