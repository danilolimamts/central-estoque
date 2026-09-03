-- Propostas de Melhoria Sistemica geradas a partir do projeto. O
-- conteudo das 15 secoes fica em jsonb: sao muitos campos, quase todos
-- texto livre, e uma coluna por campo viraria uma tabela imensa que
-- muda a cada ajuste do padrao do documento.
create table projetos.documentos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos.projetos(id) on delete cascade,
  -- Numero sequencial do documento no padrao "NN__Proposta...".
  numero smallint not null,
  titulo text not null,
  subtitulo text,
  categoria text,
  dados jsonb not null default '{}'::jsonb,
  gerado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index documentos_numero_idx on projetos.documentos (numero);
create index documentos_projeto_idx on projetos.documentos (projeto_id, criado_em desc);

create trigger documentos_atualizado_em before update on projetos.documentos
  for each row execute function projetos.marcar_atualizacao();

grant select, insert, update, delete on projetos.documentos to anon, authenticated;

alter table projetos.documentos enable row level security;

create policy documentos_aberto on projetos.documentos
  for all to anon using (true) with check (true);
create policy documentos_leitura on projetos.documentos
  for select to authenticated using (projetos.tem_acesso());
create policy documentos_escrita on projetos.documentos
  for all to authenticated
  using (projetos.pode_editar_projeto(projeto_id))
  with check (projetos.pode_editar_projeto(projeto_id));
