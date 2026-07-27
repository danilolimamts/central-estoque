# Referencia: versao v3.5

`dashboard_elevadores_v3_5.html` e a versao em producao (arquivo unico) que
esta reconstrucao substitui. Fica aqui como referencia viva das regras e do
comportamento ja validados contra os dados reais.

Nao entra no build. Serve para consultar como cada regra foi implementada e
para comparar telas.

De onde saiu o que ja foi aproveitado:

- `src/dados/fotosPais.ts` - o dicionario `FOTOS_PAIS` deste arquivo, com 187
  itens pai e as URLs do catalogo publico da Loja do Mecanico. As fotos ficam
  embutidas, sem depender de importar planilha.
