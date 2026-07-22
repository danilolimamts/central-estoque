# Brief tecnico: Central de Equalizacao de Elevadores

Documento para reconstruir o projeto no Claude Code, com arquitetura melhorada.
Loja do Mecanico, CD Cajamar, Controle de Estoque.

---

## 1. Objetivo do sistema

Equalizar o estoque de componentes de elevadores automotivos no CD: casar **Base** com **Coluna**
para saber, por fornecedor e tonelada, o que precisa ser comprado ou vendido. O projeto so e
considerado concluido quando 100% dos conjuntos estiverem casados.

O sistema tem duas frentes:

1. **Equalizacao** (operacional): quanto comprar de base e de coluna, por conjunto.
2. **Status do Projeto** (gestao): acompanhamento das acoes do plano, no formato PMO.

---

## 2. O que ja existe e o que deve ser preservado

Hoje existe um arquivo unico `dashboard_elevadores_v3.html` (~230 KB) que funciona e esta validado
contra os dados reais. **Todas as regras de negocio deste documento ja foram testadas e conferidas
com a planilha do usuario.** A reconstrucao deve manter o comportamento e melhorar a estrutura.

Comportamentos que precisam continuar existindo:

- Importacao manual do Excel pelo navegador (a automacao via Power Automate e SharePoint foi
  bloqueada pela TI, entao o import manual e o caminho definitivo).
- Dados persistem no navegador entre sessoes.
- Funciona sem servidor, sem back-end obrigatorio e sem rodar script nenhum.
- Exportacoes em Excel e PowerPoint geradas no proprio navegador.

---

## 3. Principais melhorias sobre a versao atual

| Problema hoje | Melhoria |
|---|---|
| Arquivo unico de 230 KB, dificil de editar | Projeto modular, com camadas separadas |
| Regras de negocio espalhadas pelo codigo de tela | Camada de dominio isolada e testavel |
| Nenhum teste automatizado (bugs foram achados por acaso) | Suite de testes com a planilha real como fixture |
| Constantes fixas no meio do codigo | Arquivo unico de configuracao de regras |
| Cores repetidas literalmente em dezenas de lugares | Design tokens centralizados |
| Persistencia via API proprietaria do ambiente | IndexedDB (padrao do navegador) |
| Duas paginas com troca manual de `display` | Roteamento de verdade, preparado para novas paginas |
| Chart.js e PptxGenJS via CDN (risco de firewall) | Bibliotecas empacotadas no build, sem depender de CDN |

---

## 4. Stack proposta

- **Vite** + **React** + **TypeScript**
- **Tailwind CSS** com tokens da marca
- **Chart.js** + **chartjs-plugin-datalabels** (graficos)
- **SheetJS (xlsx)** para leitura e escrita de Excel
- **PptxGenJS** para geracao da apresentacao
- **Vitest** para testes
- **localforage** (IndexedDB) para persistencia local
- Deploy estatico no **Netlify**, repositorio no **GitHub** (o usuario ja usa esse fluxo)

Ponto de atencao: empacotar Chart.js e PptxGenJS no bundle, sem `<script src="cdn...">`.
Hoje o PptxGenJS vem de `cdn.jsdelivr.net` e pode ser bloqueado pelo firewall da empresa.

---

## 5. Estrutura de pastas

```
src/
  config/
    regras.ts            # ratio, cortes da matriz, pesos do score, metas
    tokens.ts            # paleta de cores e tipografia
  domain/
    tipos.ts             # interfaces de Componente, Conjunto, Elevador, Acao
    equalizacao.ts       # calculo de deficit, kits, status, acao sugerida
    valoracao.ts         # auditoria do campo "in interface"
    projeto.ts           # metricas, score, saude, quadrantes da matriz
  parsers/
    lerMultiplos.ts      # aba Multiplos -> Componente[]
    lerProjeto.ts        # aba Projeto -> Acao[]
    planilha.ts          # orquestrador: le apenas as abas uteis
    utilData.ts          # conversao de data (serial Excel, Date, string)
  export/
    exportExcel.ts       # base completa e plano de acao
    exportPptx.ts        # apresentacao de status, 4 recortes
  components/
    ui/                  # Card, Kpi, Badge, Tabela, Modal
    charts/              # wrappers de Chart.js
  pages/
    DashboardGeral.tsx
    StatusProjeto.tsx
  store/
    useDados.ts          # estado global e persistencia
  App.tsx
tests/
  fixtures/
    equalizacao.xlsx     # planilha real, usada nos testes
  equalizacao.test.ts
  valoracao.test.ts
  projeto.test.ts
  parsers.test.ts
```

---

## 6. Fonte de dados

Arquivo: `08. Equalização de Elevadores CD CAJAMAR.xlsx`

| Aba | Tabela nomeada | Uso |
|---|---|---|
| `Multiplos` | `f_SIGEQ231Multiplos` (A3:R470) | Equalizacao. Cabecalho na **linha 3** |
| `Projeto` | `f_Projetos` (A1:U33) | Status do projeto. Cabecalho na linha 1 |
| `EstoqueAtual` | `d_QRY0390EstoqueAtual` | Nao usar (100 mil linhas, trava a leitura) |
| `Cadastros` | | Nao usar (306 mil linhas) |

Ler **apenas** as abas `Multiplos` e `Projeto` no `XLSX.read`, com `cellDates: true`.

### Colunas da aba Multiplos (A a R)

`Item Vol.Multiplo` (item pai), `Nome Item Vol.Multiplo`, `Item Componente`, `Nome Item Componente`,
`Quantidade`, `in interface`, `Peso`, `Linha do Produto`, `Marca`, `Componente BASE/COLUNA`,
`Filtrar ?`, `CD`, `REVERSA`, `DS`, `OUTROS`, `Chave`, `Tonelada FIXA`, `Fabricante`.

### Colunas da aba Projeto (A a U)

`N° PLAN ACTION`, `PROPOSTA`, `O QUE FAZER?`, `POR QUÊ?`, `COMO SOLUCIONAR?`, `QUEM? (RESPONSAVEL)`,
`ÍNICIO`, `FIM`, `REAGENDAMENTO`, `SITUAÇÃO`, `DATA CONCLUSÃO`, `DURAÇÃO`, `STATUS`, `OBS`, `ESFORÇO`,
`REDUZ ERRO ?`, `MELHORA PRODUTIVIDADE ?`, `MELHORA P/ CLIENTE ?`, `REDUZ CUSTO ?`,
`AUMENTA SEGURANÇA ?`, `IMPACTO`.

Base auxiliar de fotos: `DE_PARA_LINK_FOTO.xlsx`, aba `Export`.
Coluna **E** = `Id Item` (vem como **string**, precisa comparar como string).
Coluna **AP** = `URL Foto`. Cruzar com `Item Vol.Multiplo`. Hoje 187 dos 190 pais tem foto.

---

## 7. Regras de negocio

### 7.1 Agrupamento

O agrupamento correto e pela coluna **`Chave`** (Marca + Fabricante + Tonelada).
Exemplo: `FORTG JM MAQUINAS 4 t` e diferente de `FORTG MAQUINAS RIBEIRO 4 t`.
Agrupar so por Marca + Peso produz resultado errado, porque a mesma marca tem fabricantes diferentes.
A coluna **`Tonelada FIXA`** normaliza os pesos: 4000 e 4100 viram `4 t`.

### 7.2 Ratio Coluna por Base

Definido pela tonelada, nao pelo peso bruto:

```ts
function ratioDaTonelada(ton: string): number {
  const t = ton.trim().toUpperCase();
  return (t.startsWith('4') || t.startsWith('5')) ? 2 : 1;
}
```

Ate 3,2 t o kit e 1 base + 1 coluna. De 4 t para cima, 1 base + 2 colunas.

### 7.3 Equalizacao (so saldo CD)

```ts
const colunasNecessarias = baseCD * ratio;
const deficit = colunasNecessarias - colCD;
const kits = Math.min(baseCD, Math.floor(colCD / ratio));

if (baseCD === 0 && colCD === 0)      status = 'SEM ESTOQUE';
else if (deficit === 0 && reversa > 0) status = 'REVERSA';   // nao da para determinar
else if (deficit === 0)                status = 'CASADO';
else                                   status = 'DESCASADO';

// deficit > 0: faltam colunas
comprarColuna = deficit;

// deficit < 0: sobram colunas sem base
const sobra = -deficit;
comprarBase   = Math.ceil(sobra / ratio);
comprarColuna = comprarBase * ratio - sobra;  // completa o ultimo kit
```

Reversa, DS e Outros **nao** entram no calculo. Aparecem separados, como alerta.
Se o conjunto esta casado mas tem saldo na reversa, o status e `REVERSA` (amarelo),
porque nao e possivel afirmar que esta equalizado ate validar o que esta la.

### 7.4 Valoracao (campo `in interface`)

Regra do negocio: **dentro do kit, quem carrega o valor e a COLUNA.**
O `S` deve estar na coluna e a base deve ficar em `N`.

| Situacao | Diagnostico |
|---|---|
| S na coluna, N na base | OK |
| S na base, N na coluna | CORRIGIR (invertido) |
| S nos dois | DUPLICADO |
| Nenhum S | SEM S |

O sistema deve gerar a instrucao pronta para o Bseller, por exemplo:
`BASE 965793: S -> N` e `COLUNA 965794: N -> S`.

### 7.5 Score do projeto (0 a 100)

Quatro pilares com pesos, exibidos decompostos na tela para poder ser defendido em reuniao:

```ts
entrega      = pctConcluidas                        // peso 0.40
prazo        = (1 - atrasadas / total) * 100        // peso 0.25
estabilidade = (1 - reagendadas / total) * 100      // peso 0.20
retorno      = clamp01(impNorm * (1 - esfNorm * 0.5)) * 100  // peso 0.15
// impNorm = mediaImpacto / 5 ; esfNorm = min(mediaEsforco / 15, 1)

score = Math.round(soma(pilar.valor * pilar.peso));
```

Saude do projeto:

- Saudavel: score >= 70 e atrasadas <= 10% do total
- Atencao: score >= 50 e atrasadas <= 30%
- Critico: demais casos

### 7.6 Matriz Impacto x Esforco

Plotar por **proposta**, nao por acao. Esforco e impacto sao constantes dentro de cada proposta,
o que da 9 pontos (confere com o grafico que o usuario monta no Excel).

- Eixo X (Esforco): 0 a 16, escala Fibonacci (3, 5, 7, 8, 15)
- Eixo Y (Impacto): 0 a 6
- Quadrantes divididos exatamente ao meio: **X = 8** e **Y = 3**

| Quadrante | Condicao | Cor |
|---|---|---|
| Ganhos rapidos | impacto > 3 e esforco <= 8 | verde |
| Projetos estrategicos | impacto > 3 e esforco > 8 | navy |
| Melhorias incrementais | impacto <= 3 e esforco <= 8 | laranja claro |
| Baixa prioridade | impacto <= 3 e esforco > 8 | laranja escuro |

### 7.7 Prazo das acoes

O prazo valido e o **Reagendamento** quando existe; caso contrario, o **Fim** original.
Atrasada = nao concluida e prazo < hoje.

---

## 8. Armadilhas conhecidas (bugs que ja custaram caro)

Estes erros ja aconteceram e foram corrigidos. Precisam de teste de regressao.

1. **Duas colunas chamadas "Marca" na aba Multiplos.** A coluna I e o dado real; a coluna V e
   cabecalho de uma tabela dinamica que o usuario mantem ao lado. Ao converter a planilha em
   objetos, a segunda sobrescreve a primeira e todo o agrupamento sai errado.
   **Solucao:** parar de ler o cabecalho no primeiro intervalo de duas colunas vazias consecutivas
   e, em caso de nome repetido, manter o primeiro. O mesmo vale para a aba Projeto.
2. **BOMBA, COMANDO e MOTOR contados como coluna.** A coluna `Componente BASE/COLUNA` tem 14 valores
   distintos. Filtrar de forma estrita apenas `BASE` e `COLUNA`.
3. **Datas do Excel chegam em tres formatos:** numero serial, objeto `Date` ou string `dd/mm/aaaa`.
   A funcao de conversao precisa tratar os tres. Serial usa base `Date.UTC(1899, 11, 30)`.
4. **`Id Item` da base de fotos e string.** Comparar com `String(itemPai)`, senao o cruzamento
   retorna zero resultados.
5. **Reconstruir o `innerHTML` de um `<select>` apaga a opcao selecionada.** Isso quebrou o filtro
   de fornecedor por varias versoes. Em React o problema deixa de existir, mas vale um teste.
6. **Abas grandes travam a leitura.** Passar apenas as abas necessarias no `XLSX.read`.
7. **Acoes marcadas como concluidas sem data de conclusao** distorcem o BurnDown. Hoje ha 3 casos.
   Deve existir um alerta especifico para isso.

---

## 9. Testes obrigatorios com numeros esperados

Usar a planilha real como fixture. Estes valores foram conferidos manualmente.

### Parser e equalizacao

- 467 linhas de dados na aba Multiplos
- 190 itens pai distintos
- 21 conjuntos (Chave), sendo 16 com saldo no CD
- Tipos de componente: 244 COLUNA, 176 BASE, 21 BOMBA, 4 COMANDO, 1 MOTOR e outros
- Somatorio por Chave deve bater 16 de 16 com a tabela dinamica do usuario. Exemplos:
  - `ENGECASS 4 t`: 174 colunas, 72 bases
  - `KREBS 2 t`: 29 colunas, 52 bases
  - `FORTG JM MAQUINAS 4 t`: 28 colunas, 20 bases
- Resultado da equalizacao: comprar ~48 colunas e 21 bases; 39 unidades travadas na reversa;
  3 de 16 conjuntos casados
- **Teste de fechamento:** aplicando as compras sugeridas, todos os conjuntos devem ficar com
  deficit igual a zero

### Valoracao

- 44 elevadores com S na base (a corrigir)
- 11 sem nenhum S
- 135 corretos
- Concentracao: AUTOP 16 (100% da marca errada), Maquinas Ribeiro 12, Engecass 10, Krebs 6

### Projeto

- 32 acoes, 9 propostas, 9 responsaveis
- Periodo de 26/05/2026 a 27/07/2026
- 20 concluidas (63%), 8 em andamento, 4 pendentes, 13 reagendadas
- Score em torno de 66 a 67, saude Atencao
- Matriz: 9 pontos, sendo 5 ganhos rapidos, 3 incrementais, 1 estrategico (Melhoria Bseller, E15/I4)
- Beneficios: erro 100%, produtividade 94%, cliente 63%, custo 100%, seguranca 25%

### Fotos

- 187 de 190 itens pai com URL de foto

---

## 10. Design tokens

Paleta padrao da Loja do Mecanico. Nunca usar fundo totalmente preto.

```ts
export const cores = {
  laranja:   { base: '#FA4616', escuro: '#C83812', medio: '#E13F14', claro: '#F8592D', suave: '#FB6B45' },
  navy:      { base: '#001A72', escuro: '#00155B', medio: '#001767', claro: '#1A3180', suave: '#33488E' },
  dark:      { base: '#1D1F2A', d2: '#171922', d3: '#1A1C26', d4: '#34353F', d5: '#4C4A55' },
  fundo:     { profundo: '#0A0B23', azulProfundo: '#0B1934' },
  semantico: { verde: '#1F7A4C', ambar: '#B8860B', cinza: '#5B5E6B', linha: '#E4E6EE' },
};
```

Tipografia: **Poppins** para titulos e numeros, **Inter** para texto.
Padroes visuais a manter: cards com sombra suave e leve elevacao no hover, cabecalho de tabela navy,
faixa laranja de 4 px abaixo da barra de topo, rotulos de dados visiveis em todos os graficos.

---

## 11. Paginas

### Pagina 1: Dashboard Geral

- KPIs de direcionamento (o que comprar, o que esta travado na reversa)
- Mapa de calor Fornecedor x Tonelada, com quantidade de bases e colunas por celula.
  Verde = casado, amarelo = tem reversa, vermelho = descasado, cinza = sem estoque.
  Alternancia entre visao por marca e consolidada por fabricante.
- Plano de acao com filtros e exportacao
- Graficos: ranking de gap por fabricante, colunas x bases a comprar, saldo na reversa,
  situacao dos conjuntos
- Auditoria de valoracao, com a correcao pronta para o Bseller
- Base mestre editavel
- Menu lateral com os 190 elevadores e foto do produto

### Pagina 2: Status Projeto

- Cards executivos, gauge do score decomposto, indicador de saude
- Alertas automaticos: atrasadas, reagendadas, sobrecarga de responsavel,
  acoes criticas (impacto >= 5), alto esforco (>= 10), concluidas sem data
- Linha do tempo comparando tempo consumido com entrega realizada
- BurnDown, BurnUp, velocidade semanal
- Matriz Impacto x Esforco
- Gantt com barra tracejada de reagendamento e linha de hoje
- Distribuicoes, visao de responsaveis, beneficios, plano de acao, timeline
- Filtros globais: responsavel, status, proposta, impacto, esforco, periodo, busca.
  **Todos os indicadores devem respeitar o filtro**, inclusive o score.

---

## 12. Exportacoes

1. **Base completa em Excel:** as 18 colunas originais da aba Multiplos, na mesma ordem, mais
   colunas de analise no final (ratio, saldos do conjunto, kits, deficit, status, acao, valoracao).
2. **Plano de acao** (equalizacao e projeto).
3. **Correcoes de valoracao** para o Bseller.
4. **Apresentacao PPTX**, 16:9, com 4 recortes: executivo (5 slides), completo (9), foco em atrasos
   (5), por responsavel (5). Padrao fixo: capa navy com score, cabecalho navy com filete laranja,
   rodape com data e numeracao, tabelas com cabecalho navy, laranja para atraso e verde para
   concluido. Slide final de proximos passos gerado a partir dos dados. Respeita os filtros ativos.

---

## 13. Roadmap

| Fase | Entrega |
|---|---|
| 1 | Estrutura do projeto, tokens, parsers e camada de dominio com testes passando |
| 2 | Dashboard Geral completo |
| 3 | Status Projeto completo |
| 4 | Exportacoes Excel e PPTX |
| 5 | Persistencia, deploy no Netlify, ajustes finos |

Priorizar a fase 1: com os parsers e o dominio testados, o resto e apresentacao.
