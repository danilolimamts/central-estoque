-- Pagina de documentacao tem ciclo proprio: nasce rascunho, vai para
-- revisao, e aprovada, entra em vigor ou e cancelada. Sem isso, quem
-- abre a lista nao sabe qual pagina ja vale e qual ainda esta sendo
-- escrita.
create type projetos.status_pagina as enum (
  'rascunho', 'em_revisao', 'aprovada', 'concluida', 'cancelada'
);

alter table projetos.paginas
  add column if not exists status projetos.status_pagina not null default 'rascunho';

create index if not exists paginas_status_idx on projetos.paginas (projeto_id, status);
