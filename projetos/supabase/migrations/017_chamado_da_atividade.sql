-- Toda melhoria vira um chamado no BSeller (e, quando o time deles
-- abre, um ticket no Jira). Sem esse numero guardado na atividade, a
-- ligacao entre o que esta aqui e o que esta la fica na cabeca de quem
-- abriu — e some quando alguem pergunta "em que pe esta o 145537?".
alter table projetos.projetos
  add column if not exists chamado text,
  add column if not exists chamado_url text,
  add column if not exists ticket_jira text;

comment on column projetos.projetos.chamado is 'Numero do chamado no BSeller, como aparece na central de ajuda (ex.: 145537).';
comment on column projetos.projetos.chamado_url is 'Endereco do chamado, para abrir direto pela lista.';
comment on column projetos.projetos.ticket_jira is 'Ticket do time de desenvolvimento, quando existir (ex.: BM-1438).';
