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

## Estado atual: Fase 1 concluida

Estrutura do projeto, design tokens, parsers e camada de dominio, com testes
passando. **Ainda sem interface** (fases 2 em diante).

Camadas implementadas:

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

### Testes

A suite roda com uma planilha sintetica gerada em memoria que cobre todas as
regressoes conhecidas (secao 8 do brief), entao passa sem nenhum arquivo externo.

A validacao dos numeros exatos contra os dados reais (secao 9) fica em
`tests/equalizacao.real.test.ts` e e **pulada** ate a planilha real ser colocada
em `tests/fixtures/`. Veja `tests/fixtures/LEIA-ME.md`.

## Deploy

Este projeto vive na subpasta `elevadores/` do repositorio `central-estoque`
(o app de Auditoria de Divergencias segue na raiz). No Netlify, configure a
**base directory** como `elevadores/` (a partir da fase 5).

## Proximas fases

2. Dashboard Geral (KPIs, mapa de calor, plano de acao, auditoria de valoracao).
3. Status Projeto (score, alertas, BurnDown/BurnUp, Gantt, matriz).
4. Exportacoes Excel e PPTX.
5. Persistencia (IndexedDB), deploy no Netlify e ajustes finos.
