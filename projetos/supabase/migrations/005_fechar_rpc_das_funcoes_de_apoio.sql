-- As funcoes de apoio as policies ficavam expostas como endpoint RPC
-- (/rest/v1/rpc/...) e o linter do Supabase acusava. Elas so devem ser
-- chamadas de dentro das policies e dos gatilhos, nunca pela API.
-- O papel authenticated mantem execute nas predicativas porque as
-- policies de login as avaliam em nome do proprio usuario.
revoke execute on function projetos.tem_acesso() from anon;
revoke execute on function projetos.papel_atual() from anon;
revoke execute on function projetos.eh_admin() from anon;
revoke execute on function projetos.pode_criar() from anon;
revoke execute on function projetos.pode_editar_projeto(uuid) from anon;

-- Gatilhos rodam pelo mecanismo do Postgres; ninguem precisa chama-los.
revoke execute on function projetos.impede_autopromocao() from anon, authenticated;
revoke execute on function projetos.vincular_novo_usuario() from anon, authenticated;
revoke execute on function projetos.marcar_atualizacao() from anon, authenticated;
