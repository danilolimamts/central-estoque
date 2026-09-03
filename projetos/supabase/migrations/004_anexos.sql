-- Anexos: fotos e documentos por projeto, com o par antes/depois que
-- e o que a operacao usa para mostrar o resultado de uma iniciativa.
create type projetos.momento as enum ('antes', 'depois', 'evidencia', 'documento');

create table projetos.anexos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos.projetos(id) on delete cascade,
  marco_id uuid references projetos.marcos(id) on delete set null,
  atualizacao_id uuid references projetos.atualizacoes(id) on delete cascade,
  caminho text not null unique,
  nome_arquivo text not null,
  tipo_mime text,
  tamanho_bytes integer,
  momento projetos.momento not null default 'evidencia',
  legenda text,
  -- Liga o "antes" ao "depois" da mesma cena: os dois anexos recebem o
  -- mesmo par, e so assim a galeria consegue mostrar lado a lado.
  par text,
  enviado_por text,
  criado_em timestamptz not null default now()
);

create index anexos_projeto_idx on projetos.anexos (projeto_id, criado_em desc);
create index anexos_atualizacao_idx on projetos.anexos (atualizacao_id);
create index anexos_par_idx on projetos.anexos (projeto_id, par);

grant select, insert, update, delete on projetos.anexos to anon, authenticated;

alter table projetos.anexos enable row level security;

-- Modulo aberto: mesma regra das demais tabelas.
create policy anexos_aberto on projetos.anexos
  for all to anon using (true) with check (true);
-- Mantida para o dia em que o login voltar: quem edita o projeto
-- gerencia os anexos dele.
create policy anexos_leitura on projetos.anexos
  for select to authenticated using (projetos.tem_acesso());
create policy anexos_escrita on projetos.anexos
  for all to authenticated
  using (projetos.pode_editar_projeto(projeto_id))
  with check (projetos.pode_editar_projeto(projeto_id));

-- ---------------------------------------------------------------
-- Bucket dos arquivos. Publico na leitura porque o modulo e aberto e a
-- pagina precisa exibir a miniatura direto pela URL, sem token.
-- Limite de 15 MB por arquivo: acima disso e video ou digitalizacao
-- inteira, que nao e o caso de uso aqui.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos-projetos', 'anexos-projetos', true, 15728640,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy anexos_projetos_leitura on storage.objects
  for select to anon, authenticated using (bucket_id = 'anexos-projetos');
create policy anexos_projetos_envio on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'anexos-projetos');
create policy anexos_projetos_exclusao on storage.objects
  for delete to anon, authenticated using (bucket_id = 'anexos-projetos');
