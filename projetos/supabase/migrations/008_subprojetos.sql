-- Um projeto pode agrupar outros: "Melhorias Bseller" reune dezenas de
-- melhorias, e cada melhoria precisa da propria documentacao, dos
-- proprios marcos e do proprio documento em Word. Em vez de criar uma
-- entidade nova pela metade, o proprio projeto ganha um pai - assim a
-- melhoria herda tudo o que o projeto ja sabe fazer.
alter table projetos.projetos
  add column if not exists projeto_pai_id uuid references projetos.projetos(id) on delete cascade;

create index if not exists projetos_pai_idx on projetos.projetos (projeto_pai_id);

-- Um projeto nao pode ser pai de si mesmo. Ciclos mais longos sao
-- barrados na tela, que so oferece projetos raiz como pai.
alter table projetos.projetos
  add constraint projeto_nao_e_pai_de_si_mesmo check (projeto_pai_id is null or projeto_pai_id <> id);
