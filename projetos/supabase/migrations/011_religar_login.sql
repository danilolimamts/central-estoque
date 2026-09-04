-- ---------------------------------------------------------------
-- O modulo volta a exigir login. As regras por papel de 002 nunca
-- sairam do lugar: o que existia por cima eram as policies de "anon"
-- criadas em 003 (e as gemeas em 004, 006 e 007). Derrubadas elas, o
-- PostgREST volta a responder pelas policies de usuario autenticado.
--
-- Quem entra sem cadastro ativo em projetos.pessoas nao le nada: o
-- login apenas se liga ao cadastro que um administrador fez antes.
-- ---------------------------------------------------------------

drop policy if exists pessoas_aberto on projetos.pessoas;
drop policy if exists projetos_aberto on projetos.projetos;
drop policy if exists marcos_aberto on projetos.marcos;
drop policy if exists tarefas_aberto on projetos.tarefas;
drop policy if exists atualizacoes_aberto on projetos.atualizacoes;
drop policy if exists anexos_aberto on projetos.anexos;
drop policy if exists paginas_aberto on projetos.paginas;
drop policy if exists paginas_versoes_aberto on projetos.paginas_versoes;
drop policy if exists documentos_aberto on projetos.documentos;

-- Sem grant nao ha o que policy liberar: e a segunda tranca, para o
-- caso de alguem recriar uma policy de anon sem querer.
revoke select, insert, update, delete on all tables in schema projetos from anon;
alter default privileges in schema projetos revoke select, insert, update, delete on tables from anon;

-- ---------------------------------------------------------------
-- Arquivos: enviar e apagar passam a exigir login. A leitura continua
-- publica de proposito — o balde e publico e a pagina exibe a
-- miniatura direto pela URL, que carrega um UUID aleatorio. Fechar a
-- leitura exigiria URL assinada em todo lugar (pagina, documento,
-- exportacao) e quebraria os links ja gravados.
-- ---------------------------------------------------------------
drop policy if exists anexos_projetos_envio on storage.objects;
drop policy if exists anexos_projetos_exclusao on storage.objects;

create policy anexos_projetos_envio on storage.objects
  for insert to authenticated with check (bucket_id = 'anexos-projetos');
create policy anexos_projetos_exclusao on storage.objects
  for delete to authenticated using (bucket_id = 'anexos-projetos');

-- ---------------------------------------------------------------
-- Quem lancou acompanhamento sem login ficou sem autor_id; o nome
-- digitado (autor_nome) continua sendo a identificacao desses. A
-- policy de insercao exige autor_id a partir de agora, entao o app
-- passa a gravar os dois.
-- ---------------------------------------------------------------

-- O dono do modulo precisa ser administrador, senao ninguem consegue
-- cadastrar as demais pessoas depois que o login voltar. O gatilho que
-- impede autopromocao sai do caminho por um instante: ele cobra um
-- administrador logado, e aqui nao ha sessao nenhuma.
alter table projetos.pessoas disable trigger pessoas_papel_protegido;
update projetos.pessoas set papel = 'admin'
 where lower(email) = 'danilolima@lojadomecanico.com.br';
alter table projetos.pessoas enable trigger pessoas_papel_protegido;
