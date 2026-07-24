# Central de Equalizacao de Elevadores

Loja do Mecanico, CD Cajamar, Controle de Estoque.

Casa **Base** com **Coluna** dos elevadores automotivos por fornecedor e tonelada,
para saber o que comprar ou vender, e acompanha o plano de acao do projeto no
formato PMO. Reconstrucao modular do antigo `dashboard_elevadores_v3.html`,
seguindo o [brief tecnico](./BRIEF_Claude_Code_Equalizacao_Elevadores.md).

Roda 100% no navegador: import manual do Excel, persistencia local, exportacoes
Excel e PPTX geradas no proprio navegador, sem servidor e sem CDN.

## Stack

Vite + React + TypeScript, Tailwind, Chart.js, SheetJS (xlsx), PptxGenJS,
localforage (IndexedDB) e Vitest.

## Comandos

```bash
npm install
npm test          # roda a suite (Vitest)
npm run test:watch
npm run typecheck
npm run dev       # servidor de desenvolvimento (a partir da fase 2)
npm run build
```

## Como usar

1. `npm install`
2. `npm run dev` e abra o endereco que aparecer no terminal.
3. Na tela inicial, escolha o arquivo `08. Equalização de Elevadores CD CAJAMAR.xlsx`
   (e, se quiser as fotos, tambem o `DE_PARA_LINK_FOTO.xlsx`) e clique em
   **Processar planilha**.

Os dados ficam salvos no navegador (IndexedDB), entao da para fechar e voltar
depois sem reimportar. O botao **Nova importacao** limpa e recomeca.

## Estado atual: fases 1 a 4

Dominio, parsers, as duas paginas e as exportacoes em Excel estao prontos e
verificados no navegador. Falta a exportacao em PPTX e o deploy.

### Telas

- **Dashboard Geral** — KPIs de direcionamento, mapa de calor Fornecedor x
  Tonelada (alternando marca/fabricante), ranking de gap, situacao dos
  conjuntos, colunas x bases a comprar, plano de acao com filtros e a
  auditoria de valoracao com as correcoes prontas para o Bseller.
- **Status Projeto** — score decomposto nos quatro pilares, medidor de saude,
  alertas automaticos, matriz Impacto x Esforco, BurnDown, Gantt com barra
  tracejada de reagendamento e linha de hoje, e o plano de acao. Os filtros
  globais valem para todos os indicadores, **inclusive o score**.
- Menu lateral com os elevadores, foto do produto e o status do conjunto.
- Tema claro e escuro.

### Camadas

- `src/config/` - `regras.ts` (ratio, cortes da matriz, pesos do score) e
  `tokens.ts` (paleta e tipografia da marca).
- `src/domain/` - regras de negocio puras e testaveis:
  - `equalizacao.ts` - agrupamento por Chave, deficit, kits, status, compras
    sugeridas e teste de fechamento.
  - `valoracao.ts` - auditoria do campo `in interface`, com a correcao pronta
    para o Bseller.
  - `projeto.ts` - metricas, score decomposto, saude, matriz Impacto x Esforco
    e derivados de prazo.
- `src/parsers/` - leitura da planilha (apenas as abas `Multiplos` e `Projeto`),
  com protecao contra a coluna `Marca` duplicada, filtro estrito de BASE/COLUNA
  e conversao de data em tres formatos.

- `src/pages/`, `src/components/`, `src/store/` - telas, componentes de UI e
  grafico, e a persistencia local.
- `src/export/exportExcel.ts` - base completa, plano de acao e correcoes do
  Bseller, geradas no navegador.

### Exportacoes

Ja disponiveis em Excel: base completa (as 18 colunas originais na mesma ordem
mais as colunas de analise), plano de acao da equalizacao, correcoes de
valoracao e plano de acao do projeto.

### Testes

A suite roda com uma planilha sintetica gerada em memoria que cobre todas as
regressoes conhecidas (secao 8 do brief), entao passa sem nenhum arquivo externo.

A validacao dos numeros exatos contra os dados reais (secao 9) fica em
`tests/equalizacao.real.test.ts` e e **pulada** ate a planilha real ser colocada
em `tests/fixtures/`. Veja `tests/fixtures/LEIA-ME.md`.

Alem dos testes, `npm run verificar:navegador` sobe o build num Chromium,
importa uma planilha de demonstracao, percorre as duas paginas, confere a
persistencia e falha se aparecer qualquer erro de console, pagina ou rede.
A planilha de demonstracao sai de `npm run demo:planilha` e traz de proposito
as armadilhas da secao 8 (coluna `Marca` duplicada, BOMBA/COMANDO no meio dos
componentes, datas em formatos diferentes e concluidas sem data).

## Deploy

Este projeto vive na subpasta `elevadores/` do repositorio `central-estoque`
(o app de Auditoria de Divergencias segue na raiz). No Netlify, configure a
**base directory** como `elevadores/`.

## O que falta

- Exportacao em PPTX (secao 12 do brief): apresentacao 16:9 com os quatro
  recortes (executivo, completo, foco em atrasos e por responsavel).
- BurnUp e velocidade semanal na pagina de projeto.
- Base mestre editavel.
- Deploy no Netlify.
- Rodar os testes da secao 9 com a planilha real para confirmar os numeros.
