-- A situacao do projeto deixa de ser um tipo fechado do Postgres e vira
-- texto: a equipe passa a criar as proprias ("Aguardando Bseller",
-- "Em homologacao"), e o significado de cada uma (aberta, concluida ou
-- cancelada) fica na configuracao, junto com nome e cor.
--
-- O tipo garantia que ninguem escrevesse status invalido; a troca por
-- texto entrega essa garantia para a tela, que so oferece o que esta
-- configurado. E o preco de deixar a equipe nomear o proprio processo.
alter table projetos.projetos alter column status drop default;
alter table projetos.projetos alter column status type text using status::text;
alter table projetos.projetos alter column status set default 'nao_iniciado';
alter table projetos.projetos add constraint projetos_status_nao_vazio
  check (length(trim(status)) > 0);

alter table projetos.atualizacoes alter column status_reportado type text
  using status_reportado::text;

-- O tipo continua existindo, sem coluna nenhuma apontando para ele:
-- apagar seria irreversivel e nao ganha nada.
comment on type projetos.status_projeto is
  'Sem uso desde 015: a situacao virou texto livre, configurada na tabela configuracoes.';
