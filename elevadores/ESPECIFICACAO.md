# Equalização de Elevadores — especificação para reconstrução

Documento para outra IA reconstruir o painel do zero. Contém stack, origem
dos dados, regras de negócio, telas e as armadilhas que já custaram
retrabalho. Escrito em 20/08/2026, a partir do commit `1082028`.

---

## 1. O que é

Painel de acompanhamento do CD Cajamar (Loja do Mecânico) para um projeto
de equalização de estoque de elevadores automotivos. Responde três
perguntas:

1. **Quanto do estoque parado vira elevador vendável?** Base sem coluna
   (ou o contrário) não vende. O painel diz o que comprar para destravar.
2. **Como está o plano de ação do projeto?** Score, prazos, Gantt.
3. **O projeto está reduzindo erro de expedição?** Devoluções por item
   trocado ou peça faltando, mês a mês.

Público final: gerência e diretoria. O painel é projetado em reunião e
vira imagem para e-mail. **Isso manda no design:** todo número precisa
estar escrito na tela, sem depender de passar o cursor.

---

## 2. Repositório e publicação

| | |
|---|---|
| Repositório | `https://github.com/danilolimamts/central-estoque` |
| Branch principal | `main` |
| Código do app | `/elevadores` |
| Build publicado | `/equalizacao-elevadores` (commitado no repo) |
| URL | `https://danilolimamts.github.io/central-estoque/equalizacao-elevadores/` |
| Hospedagem | GitHub Pages, servindo a **raiz do repositório** no `main` |

O repositório hospeda mais de um app (`inventario-rotativo`, `auditoria`)
sob a mesma Central em `/index.html`.

**Consequência crítica do modelo de publicação:** `npm run publicar` faz
`rm -rf` da pasta `equalizacao-elevadores` e copia o `dist` por cima. Nada
editado à mão lá sobrevive. Tudo que precisa aparecer no app tem que estar
em `/elevadores/src`. (Um link "Voltar para a Central" já foi perdido assim.)

A pasta `brand/` precisa ser recopiada no publicar: ela não sai do build e
o `index.html` referencia `./brand/Logo_LDM_box.png` como favicon.

`vite.config.ts` usa `base: './'` — o app vive em subpasta, então caminhos
absolutos quebram.

---

## 3. Banco de dados — não existe

**Não há banco de dados, nem back-end, nem API.** Isto é deliberado: o
ambiente da empresa bloqueia CDN e serviços externos, e o app precisa
rodar como página estática.

A persistência é toda no navegador:

| Onde | O quê | Chave |
|---|---|---|
| **IndexedDB** (via `localforage`, instância `equalizacao_elevadores` / store `dados_v1`) | A importação inteira: componentes, ações, divergências, fotos | `importacao` |
| IndexedDB | Histórico de medições (um marco por importação, máx. 60) | `historico` |
| IndexedDB | Reclassificações manuais de divergência | `ajustes_responsavel` |

Histórico e ajustes ficam em chaves **separadas** da importação de
propósito: trocar a planilha do mês não pode apagar o que já foi medido
nem a apuração já feita sobre uma entrega.

Datas viram string no IndexedDB e precisam ser reidratadas na leitura.
Campos novos precisam de valor padrão explícito ao reidratar — importação
antiga não os tem.

Se a gravação falhar (janela anônima, armazenamento bloqueado), o app
**continua funcionando na sessão** e avisa que os dados não ficam salvos.
Mostrar a planilha nunca pode depender de conseguir gravar.

---

## 4. Fonte de dados: uma planilha XLSX

O usuário importa um arquivo `.xlsx` pela tela de Importação. Bibliotecas:
`xlsx-js-style`, sempre com `cellDates: true`.

### 4.1 Abas lidas

```ts
export const ABAS_UTEIS = ['Multiplos', 'Projeto', 'Divergencias SAC', 'Divergências SAC'];
```

**Só estas são passadas para `XLSX.read({ sheets })`.** A planilha real tem
abas `EstoqueAtual` e `Cadastros` com centenas de milhares de linhas que
travam a leitura. Ler tudo e filtrar depois **não funciona** — é preciso
limitar no `read`.

A tabela de divergências também pode chegar exportada sozinha, e nesse
caso vem numa aba chamada `Export` — há fallback para ela.

### 4.2 Aba `Multiplos` — estrutura dos kits

**Cabeçalho na linha 3 (índice 2), não na 1.**

| Coluna | Uso |
|---|---|
| `Item Vol.Multiplo` | código do item pai (o elevador) |
| `Nome Item Vol.Multiplo` | descrição do item pai |
| `Item Componente` | código do componente |
| `Nome Item Componente` | descrição do componente |
| `Quantidade` | **quantas unidades deste componente cada kit consome** |
| `in interface` | `S` / `N` — onde está o valor do kit |
| `Peso` | peso |
| `Linha do Produto` | linha |
| `Marca` | marca |
| `Componente BASE/COLUNA` | tipo: 14 valores distintos, só `BASE` e `COLUNA` entram no par |
| `Filtrar ?` | filtro auxiliar |
| `CD` | saldo no CD |
| `REVERSA` | saldo em reversa |
| `DS`, `OUTROS` | outros saldos |
| `Chave` | Marca + Fabricante + Tonelada (agrupa "conjuntos") |
| `Tonelada FIXA` | ex.: `4 t` |
| `Fabricante` | fabricante |

### 4.3 Aba `Projeto` — plano de ação

**Cabeçalho na linha 1 (índice 0).**

`N° PLAN ACTION`, `PROPOSTA`, `O QUE FAZER?`, `POR QUÊ?`,
`COMO SOLUCIONAR?`, `QUEM? (RESPONSAVEL)`, `ÍNICIO`, `FIM`,
`REAGENDAMENTO`, `SITUAÇÃO`, `DATA CONCLUSÃO`, `DURAÇÃO`, `STATUS`, `OBS`,
`ESFORÇO`, `IMPACTO`, e cinco colunas de ganho com `SIM`/`NÃO`:
`REDUZ ERRO ?`, `MELHORA PRODUTIVIDADE ?`, `MELHORA P/ CLIENTE ?`,
`REDUZ CUSTO ?`, `AUMENTA SEGURANÇA ?`.

O leitor precisa aceitar variação de acento e pontuação nos cabeçalhos
(`ÍNICIO` está escrito assim na planilha real, com o acento no lugar errado).

### 4.4 Aba `Divergencias SAC` (tabela `f_divergenciasSAC`) — devoluções

| Coluna | Uso |
|---|---|
| `Pedido` | número do pedido |
| `Id Entrega` | identifica o caso; nem toda devolução virou entrega |
| `Filial Envio` | de onde saiu — separa CD de loja |
| `Produto` | vem como `"929051 - RAMPA PARA..."`, código e descrição juntos |
| `Motivo`, `Submotivo` | classificação do SAC |
| `Comentário` | **texto livre; é dele que sai a causa e o responsável** |
| `Transportadora`, `Estado`, `Canal_Agrupado` | contexto |
| `Valor Devolução` | **vem negativo na planilha**; guardar o módulo |
| `Data Saída` | data que manda no corte por ano/mês |
| `Data Emissão Pedido` | usada só como reserva quando não há saída |
| `Considerar ?` | `Sim` / `Não` — `Não` tira o caso do painel |

---

## 5. Regras de negócio

Esta seção é a mais importante. Cada regra abaixo foi corrigida **depois**
de o painel mostrar número errado para o usuário. Reimplementar da forma
"óbvia" reproduz os mesmos defeitos.

### 5.1 Montagem do kit — pela composição, nunca pela tonelada

**Regra errada, que parece razoável e não é:** somar todas as `BASE` de um
lado, todas as `COLUNA` do outro, e usar a tonelada para saber quantas
colunas cada base pede (até 3,2 t → 1; de 4 t → 2).

Isso quebra em dois casos reais:

- **Kit com duas colunas diferentes.** O item `2031433` tem 1 base
  (`2032019`), 1 coluna com acionador (`2032020`) e 1 coluna sem acionador
  (`2032021`) — uma de cada por elevador. Saldos 32, 31 e 32. Somando as
  colunas dá 63 e "31 pares", mas o certo é: **montam-se 31 elevadores, e
  falta 1 unidade do `2032020` especificamente**, não "1 coluna" qualquer.
- **Produto de 4 t com uma coluna só.** A rampa `2031441` leva 1 base e 1
  coluna. A tonelada 4000 fazia a conta exigir 2 colunas por base e acusar
  falta em um kit completo.

**Regra correta:** a composição já está na planilha, na coluna
`Quantidade` de cada componente. Para cada item pai:

```
porKit(c)          = c.Quantidade > 0 ? c.Quantidade : 1
kitsQueSustenta(c) = floor(c.CD / porKit(c))
par                = componentes com tipo BASE ou COLUNA
kits               = min(kitsQueSustenta) sobre o par
alvo               = max(kitsQueSustenta) sobre o par
faltam(c)          = max(0, alvo * porKit(c) - c.CD)
casado             = kits === alvo
```

`alvo` usa o **máximo**, não o mínimo: equaliza-se por cima. A compra é o
que falta para todo componente chegar ao alvo.

Componentes fora do par (BOMBA, COMANDO, MOTOR) entram na montagem, mas
**não mandam no casamento** — eles limitam quantos kits dá para *expedir*
(`kitsCompletos`), que é outra leitura.

**Nunca inventar componente que o kit não tem.** O item `4570344` leva
coluna e bomba, nenhuma base. Criar uma linha sintética de "base ausente"
com saldo zero fazia o painel acusar descasamento e mandar comprar uma
peça que o produto não usa.

O `ratioDaTonelada` continua existindo e é exibido como referência, mas
**não manda em nenhuma conta**.

### 5.2 Conjunto (agrupamento por `Chave`)

Um conjunto reúne vários itens pai. A conta é **por item pai, somando os
resultados** — nunca somando as bases de todos contra as colunas de todos,
que é o mesmo erro de 5.1 num nível acima.

Status: `SEM ESTOQUE` (tudo zerado) · `REVERSA` (fecha, mas há saldo em
reversa sem lastro) · `CASADO` · `DESCASADO`.

O status **não pode** sair de `deficit === 0`: um conjunto pode precisar de
base num item e de coluna em outro, o déficit líquido se anula e ele
apareceria como casado. Use `comprarBase + comprarColuna > 0`.

### 5.3 Saúde do estoque por fornecedor

Por unidade, não por SKU. Com 100 elevadores possíveis e 10 travados:
90% OK, 10% descasado.

```
completos  = Σ montagem.kits
potencial  = Σ montagem.alvo
descasados = potencial - completos
pctCompleto = completos / potencial
peçasParadas = Σ max(0, saldo - completos * porKit)
```

Usa **só o saldo do CD**. Reversa fica de fora: peça em reversa não está
disponível para montar nem para vender.

`0 de 0` não é 0% nem 100% — é ausência de estoque. Fornecedor sem nada
no CD sai da tabela (e o cartão diz quantos saíram).

### 5.4 Valoração ("in interface")

O valor do kit fica na **COLUNA**. Diagnóstico por item pai:

| S na base | S na coluna | Diagnóstico |
|---|---|---|
| não | sim | `OK` |
| sim | não | `CORRIGIR` |
| sim | sim | `DUPLICADO` |
| não | não | `SEM S` |

O painel mostra em porcentagem: `% já valoram na coluna` e `% falta
ajustar`, separando "S preso na base" (tirar de um lado e pôr no outro) de
"sem S nenhum" (cadastro incompleto) — são trabalhos diferentes.

### 5.5 Score do projeto

Quatro pilares ponderados, resultado 0–100:

```
entrega       = concluídas / total            × 100   peso 0,40
prazo         = (1 - atrasadas / total)       × 100   peso 0,25
estabilidade  = (1 - reagendadas / total)     × 100   peso 0,20
retorno       = impNorm × (1 - esfNorm × 0,5) × 100   peso 0,15
   impNorm = médiaImpacto / 5
   esfNorm = min(médiaEsforço / 15, 1)
```

Saúde: `saudável` ≥ 70 com atraso ≤ 10% · `atenção` ≥ 50 com atraso ≤ 30% ·
`crítico` abaixo disso.

Matriz Impacto × Esforço: cortes em esforço 8 e impacto 3; eixos até 16 e 6;
escala Fibonacci `[3, 5, 7, 8, 15]`. Quadrantes: ganhos rápidos (alto
impacto, baixo esforço), estratégicos, incrementais, baixa prioridade.

**Cores da matriz são fixas e não negociáveis:** verde = concluído,
amarelo = em andamento, vermelho = não iniciado.

### 5.6 Divergências do SAC — o que conta

Um caso entra no painel se passar por **três** filtros, nesta ordem:

1. `Motivo` **não** contém `arrependimento`, `defeito` nem `avaria`.
   O CD responde por separar e expedir, não pelo que acontece depois.
2. O produto é elevador, base ou coluna — testado por **`startsWith`** na
   descrição, não por `includes`. `"BORRACHA PARA SAPATA U PARA ELEVADOR"`
   cita elevador e é borracha.
3. O texto (`Submotivo` + `Comentário`, sem acento, minúsculo) aponta uma
   das duas causas:
   - **INVERSÃO** — `invertid`, `invers`, `base trocada`, `etiqueta
     trocada`, `base no tamanho incorreto`, `furacao errada`, `nao
     encaixa`, `incompativel`, `divergencia operacional cd`…
   - **FALTA** — `faltou a base`, `sem a base`, `faltou volume`,
     `falta peca`…

### 5.7 Divergências — de quem foi

Causa diz **o quê**; não diz **de quem**. Cinco gavetas, decididas nesta
precedência:

1. Texto contém `operacional cd` → **CD**. É o SAC dizendo que apurou.
2. Termos de fábrica (`fabricante`, `de fabrica`, `lubrificacao`,
   `nao conformidade de fabrica`…) → **FORNECEDOR**.
3. Termos de anúncio (`divergencia de anuncio`, `ficha tecnica`,
   `foto do produto`…) → **ANÚNCIO / CADASTRO**.
4. Termos de cliente (`comprou errado`, `desistiu`, `endereco errado`…)
   → **CLIENTE**.
5. Comentário vazio (só `-`, espaços) → **A APURAR**.
6. Caso contrário → **CD**.

Duas decisões que importam:

- **Nunca culpar o CD por omissão.** Comentário sem apuração vai para "a
  apurar", não para o CD. Indicador que culpa por omissão perde a
  confiança de quem é cobrado por ele.
- **Anúncio tem gaveta própria.** Ele já caiu em FORNECEDOR e estava
  errado: o produto entregue é o que foi pedido, quem prometeu outra coisa
  foi a página. Sem critério para dividir, o certo é deixar visível em vez
  de inflar o número de uma área que não errou.

### 5.8 Divergências — data e exclusão

**Data que manda: `Data Saída`.** É quando a mercadoria deixou o CD. A
emissão do pedido é quando o cliente comprou — para medir erro de
expedição, a data certa é a da saída. Quando não há saída, cai na emissão,
mas a linha fica **marcada** e o cartão conta quantas são: as duas datas
não significam a mesma coisa.

**Data zero do Excel.** Campo em branco não chega vazio — chega como
`00/01/1900`. Em texto o conversor recusa (dia 0 não existe), mas em
serial vira `30/12/1899`, uma data válida, que entraria como informação e
criaria um ano "1899" no seletor. Qualquer data anterior a 2000 é campo em
branco.

**Coluna `Considerar ?`.** Só um `Não` explícito exclui. Vazio, zero,
fórmula não resolvida e texto inesperado contam como `Sim` — a coluna é
preenchida à mão e vai ter lacuna; sumir com devolução por célula em
branco é apagar o indicador em silêncio.

A marcação vale para a **entrega inteira**, não para a linha. Um despacho
com dois produtos divergentes gera duas linhas; excluir uma e deixar a
irmã contando deixaria o total sem fechar com a planilha.

Identificação do caso: `Id Entrega` quando existe, senão `Pedido`.

### 5.9 Ajuste manual

O usuário pode, na própria tabela, **trocar o responsável** de um caso ou
**desconsiderá-lo**. Grava `{ caso, decisao, motivo, em }` no IndexedDB.

- Vale para a entrega inteira.
- Reajustar o mesmo caso substitui, não empilha.
- Desconsiderado sai de **tudo**: total, CD, lojas, gráfico por mês,
  transportadoras, causas, gavetas e tabela. Filtrar só a tabela e deixar o
  gráfico contando é pior do que não ter a função — parece resolvido.
- Nunca em silêncio: linha marcada, motivo visível, contagem no subtítulo,
  e uma lista dos excluídos com botão de desfazer.
- Quando planilha e ajuste discordam, **a planilha manda** (é o registro
  compartilhado) e a tela diz para corrigir lá.

### 5.10 Evolução das divergências

Mede o resultado do projeto, não o andamento do plano.

- **Mês que ainda não aconteceu fica fora de tudo.** Sem isso, o painel
  contaria jul–dez como meses zerados e anunciaria "seis meses sem
  divergência" em junho.
- **A curva basta; não repita a mesma coisa em tabela.** Cada ponto do
  gráfico já traz o valor e a quantidade escritos. Uma tabela de mês a mês
  existiu embaixo do gráfico e foi retirada: dizia o mesmo, e a coluna de
  variação ficava ilegível justamente nos meses bons (ver a regra do mês
  zerado abaixo). A variação que importa está na manchete.
- **A manchete usa o último mês fechado**, não o corrente: comparar um mês
  pela metade com um mês inteiro pinta uma queda que não aconteceu.
- **Mês zerado depois de outro zerado** não compara com o anterior (daria
  0% e leria "estável" bem quando o resultado está melhor). Compara com a
  última vez que houve divergência e vale −100%.

---

## 6. Telas

### 6.1 Dashboard Geral

1. **Saúde do estoque por fornecedor** — 3 KPIs (% completos, % descasados, peças paradas) + tabela por fornecedor
2. **4 KPIs** — Colunas a comprar · Bases a comprar · Travado na reversa (%) · Conjuntos casados (%)
3. **Colunas × bases a comprar** — barras horizontais, top 12, ordenado com desempate por nome
4. **Itens por fornecedor** — árvore fornecedor → tonelada → item, com foto
5. **Inversões e faltas apontadas pelo SAC** (ver 6.2)
6. **Plano de ação — equalização** — tabela por conjunto
7. **Auditoria de valoração** — 2 % grandes + barra, 4 KPIs, concentração por marca, correções prontas para o Bseller
8. **Base mestre** — só exportação

### 6.2 Dentro do cartão do SAC

Seletor de ano → 3 números grandes (CD · Lojas · Total) → **Responsável
apurado** (5 caixas) → **O que aconteceu** (Inversão · Peça faltando) →
gráfico mensal de barras CD × Lojas com R$ no eixo → índice por
transportadora → tabela caso a caso (com o editor de responsável) → lista
de desconsiderados.

### 6.3 Status do Projeto *(esta tela vira o boletim)*

| # | Bloco | No boletim |
|---|---|---|
| 1 | Filtros | ❌ |
| 2 | Status do projeto — rosca de %, 3 números, variação vs. medição anterior | ✅ |
| 3 | Entregas por semana — área SVG | ✅ |
| 4 | **Evolução das divergências** — manchete + 4 números + linha | ✅ |
| 5 | Ganhos do projeto — 5 barras | ❌ |
| 6 | Matriz Impacto × Esforço | ✅ |
| 7 | Plano de ação — por PLAN ACTION | ✅ |
| 8 | Gantt | ✅ |
| 9 | Ritmo de entrega — BurnDown + BurnUp | ✅ |
| 10 | Saúde do estoque | ✅ **só no boletim** |
| 11 | Plano de ação — linha a linha + exportações | ❌ |

Blocos 2 e 3 dividem a linha; do 4 em diante, largura total.

### 6.4 Elevadores

Grade de cartões. Ordem fixa dentro do cartão: **foto → nome → quantidade
→ código → peças no CD → fornecedor → selos**. Nada escrito por cima da
imagem.

### 6.5 Importação

Upload do XLSX (+ opcional planilha de fotos `DE_PARA_LINK_FOTO`).

---

## 7. Design

```
laranja  #FA4616 (base)  #C83812 (escuro)  #F8592D (claro)
navy     #001A72 (base)  #00155B (escuro)  #1A3180 (claro)
verde    #1F7A4C     âmbar #B8860B     cinza #5B5E6B
linha    #E4E6EE     fundo da página #E7E9EF
```

Títulos e números em **Poppins**; texto em **Inter**. Nunca usar preto
puro como fundo.

Status de conjunto: CASADO verde · REVERSA âmbar · DESCASADO laranja ·
SEM ESTOQUE cinza.

**Tema claro por padrão.** O atributo `data-theme="light"` precisa estar no
`<html>` do próprio `index.html`, não só no React: o CSS tem um bloco
`prefers-color-scheme` que pinta escuro antes de o `useEffect` rodar, e a
página nascia escura em máquina configurada assim.

**Menu lateral** azul, recolhível para um trilho de ícones, com rodapé:
"Voltar para a Central" → "Alternar tema" → carimbo de versão (data e hora
do build, sem hash — o hash fica sempre uma entrega atrasado porque o build
acontece antes do commit existir).

---

## 8. Stack

```
React 18 · TypeScript 5.7 · Vite 6 · Tailwind 3.4
Chart.js 4 + chartjs-plugin-datalabels
xlsx-js-style · pptxgenjs · html2canvas · localforage
Vitest (node) · Playwright (verificação em navegador)
```

**Nenhuma dependência por CDN.** Tudo empacotado no bundle: o firewall da
empresa bloqueia.

Organização:

```
src/config/    regras.ts (constantes de negócio)  tokens.ts (cores)
src/parsers/   leitura da planilha, um arquivo por aba
src/domain/    regras puras e testáveis, sem DOM
src/components/ cartões reutilizáveis
src/pages/     as quatro telas
src/export/    Excel, PowerPoint, boletim PNG
src/store/     useDados.ts — IndexedDB e estado global
```

Domínio e UI **separados**: as regras ficam em funções puras, testadas sem
navegador; canvas e DOM ficam isolados.

---

## 9. Exportações

- **Excel** (`xlsx-js-style`) — plano de equalização, base completa
  (18 colunas originais da aba Multiplos, na mesma ordem, mais colunas de
  análise ao final), correções de valoração, plano do projeto.
- **PowerPoint** (`pptxgenjs`) — apresentação com recortes (executivo, etc.).
- **Boletim PNG** (`html2canvas`) — imagem do próprio painel para colar no
  e-mail.

### O boletim, em detalhe

Captura a tela do Status do Projeto. Mecanismo:

- `CLASSE_FORA = 'fora-do-boletim'` — o bloco é removido do clone.
- `CLASSE_SO_BOLETIM = 'so-no-boletim'` — `display:none` na tela; a classe
  é retirada no clone e o bloco aparece só na imagem.
- No `onclone`: injeta faixa da marca (logo, título, data), adiciona rodapé,
  fixa largura em 1180px.

**Armadilha que já quebrou em produção:** o html2canvas desenha o clone num
iframe e copia o `<head>`, inclusive o `<link>` do CSS — mas o iframe
busca esse arquivo de novo e a captura não espera. Se a resposta demorar,
sai a imagem **sem estilo nenhum**. Em servidor local o CSS chega rápido
demais para o problema aparecer, então passa em toda verificação.

Correção: no `onclone`, ler `document.styleSheets` e copiar as regras para
um `<style>` dentro do clone. Folha de outra origem (Google Fonts) lança ao
acessar `cssRules` — capturar a exceção **por folha**, senão a leitura para
e o clone fica sem estilo, que é justamente o defeito. Também esperar
`document.fonts.ready` antes de capturar.

---

## 10. Testes e verificação

**276 testes** em Vitest (`npm test`), ambiente node, sobre o domínio puro.
`npm run typecheck` roda `tsc --noEmit`.

Além disso, scripts Playwright em `/scripts` que abrem o app com
`?exemplo`, interagem e conferem o resultado:

| Script | Confere |
|---|---|
| `verificarBoletim.mjs` | a captura sai com marca, com cartões e a página viva fica intacta |
| `verificarGantt.mjs` | ficha ao passar o cursor, cartões removidos, ordem, porcentagem |
| `verificarAjusteSAC.mjs` | reclassificar e desconsiderar saem de todos os números, persistem e desfazem |
| `verificarFornecedores.mjs` | agrupamento, foto no cursor, mensagem de compra |
| `verificarMenuLateral.mjs` | menu recolhe sem texto cortado e sempre volta |

**Lição sobre verificação:** o teste do boletim conferia se havia navy na
imagem — e a faixa da marca é navy mesmo sem CSS, então aprovava a imagem
quebrada. Passou a medir a **área branca**: o painel é feito de cartões
brancos sobre fundo cinza, então pouco branco significa captura sem estilo.
Ao escrever uma verificação, pergunte o que ela deixaria passar.

---

## 11. Armadilhas conhecidas

1. **Ler a planilha inteira trava.** Limitar `sheets` no `XLSX.read`.
2. **Cabeçalho da aba Multiplos está na linha 3**, não na 1.
3. **`Valor Devolução` vem negativo.** Guardar o módulo.
4. **Data em branco do Excel vira 30/12/1899** quando chega como serial.
5. **`startsWith`, não `includes`,** para classificar o tipo de produto.
6. **Publicar apaga a pasta do site.** Nada editado à mão lá sobrevive.
7. **`base: './'` no Vite** — o app vive em subpasta.
8. **Tema no `index.html`**, não só no React.
9. **Rótulo de gráfico precisa de fundo sólido.** Alinhamento não dá conta:
   em vale a curva atravessa o texto, na ponta ele cai sobre o eixo, entre
   meses próximos um encosta no outro.
10. **Duas linhas com dados correlacionados poluem.** Custo e quantidade de
    divergência andam juntos: a segunda linha repetia a forma e cruzava os
    rótulos. Virou número dentro do próprio rótulo.
11. **`0 de 0` não é 0% nem 100%.** Toda porcentagem precisa do caso vazio.
12. **Percentual sobre mês zerado é divisão por zero.** Devolver nulo, não
    zero: "não mudou nada" é outra afirmação.

---

## 12. Princípios que orientaram as decisões

- **Todo número escrito na tela.** O painel é projetado em reunião; ninguém
  passa o cursor. Tooltip é complemento, nunca a única via.
- **Nada corrigido em silêncio.** Ajuste manual, caso excluído, dado
  faltando — tudo com marca visível e contagem. Número corrigido sem rastro
  é indistinguível de número errado.
- **Errar para menos é pior.** Lacuna de preenchimento não pode apagar
  registro do indicador: alguém seria cobrado por um número que não existe.
- **Não inventar resultado.** Mês futuro não é mês zerado; mês pela metade
  não se compara com mês inteiro; sem ritmo não se projeta data.
- **Medir resultado, não esforço.** Quantas ações fecharam diz que o time
  trabalhou; a divergência caindo a zero diz que a operação melhorou.
