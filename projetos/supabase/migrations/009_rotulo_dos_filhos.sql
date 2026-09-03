-- Projeto que agrupa outros e so um guarda-chuva: marcos, tarefas,
-- paginas, anexos e documento pertencem a cada item de dentro, nunca ao
-- grupo. O nome desses itens muda conforme o projeto - "Melhorias" no
-- Bseller, "Frentes" ou "Etapas" em outro -, entao vira campo.
alter table projetos.projetos
  add column if not exists rotulo_filhos text;

comment on column projetos.projetos.rotulo_filhos is
  'Preenchido: o projeto agrupa itens e este e o nome deles no plural (ex.: Melhorias). Vazio: projeto comum, com marcos, tarefas, paginas e anexos proprios.';
