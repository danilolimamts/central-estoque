-- O documento gerado passa a ficar anexado na atividade, sempre no
-- mesmo caminho: gerar de novo substitui a versao anterior em vez de
-- empilhar copias. Substituir e um update no objeto do balde, e ate
-- agora so havia policy de inserir e apagar.
create policy anexos_projetos_substituicao on storage.objects
  for update to authenticated
  using (bucket_id = 'anexos-projetos' and projetos.pode_mexer_no_arquivo(name))
  with check (bucket_id = 'anexos-projetos' and projetos.pode_mexer_no_arquivo(name));
