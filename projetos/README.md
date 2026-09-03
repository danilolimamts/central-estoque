# Módulo de Projetos — Central de Estoque

Acompanhamento de projetos e iniciativas do CD Cajamar: carteira, marcos,
tarefas, histórico de acompanhamento, painel e cronograma.

Diferente dos outros módulos da Central, os dados **não** ficam no navegador:
são compartilhados por toda a equipe em um banco Supabase. O acesso é aberto,
igual ao restante da Central — quem abre o link do hub já entra.

- Fonte: `projetos/` (React + Vite + TypeScript + Tailwind)
- Publicado em: `acompanhamento-projetos/` (servido pelo GitHub Pages)
- Endereço: https://danilolimamts.github.io/central-estoque/acompanhamento-projetos/

## Comandos

```bash
npm install
npm run dev            # desenvolvimento
npm test               # regras de prazo, saúde e indicadores
npm run typecheck
npm run build
npm run publicar       # build + cópia para ../acompanhamento-projetos
npm run verificar:tela  # build + smoke test da tela inicial (precisa de um servidor local)
npm run verificar:telas # idem, com a API simulada: painel, carteira, cronograma e detalhe
```

## Banco de dados

Projeto Supabase: **Estoque Project** (`jfvnswafpeshyfweoadg`), região `sa-east-1`.
As tabelas ficam no schema `projetos`, separadas dos demais módulos do mesmo
banco. As migrations aplicadas estão em `supabase/migrations/`.

| Tabela | Papel |
|---|---|
| `pessoas` | quem tem acesso, com papel (`admin`, `editor`, `leitor`) |
| `projetos` | a carteira: datas previstas/reais, situação, prioridade, avanço |
| `marcos` | etapas com data prevista e data real |
| `tarefas` | itens de execução, com responsável e prazo |
| `atualizacoes` | histórico de acompanhamento; nunca sobrescrito |
| `anexos` | fotos e documentos, com o par antes/depois |
| `paginas` | documentação do projeto em blocos de texto e fluxograma |
| `paginas_versoes` | versão anterior de cada página, gravada a cada salvamento |
| `documentos` | Propostas de Melhoria Sistêmica, com as 15 seções em jsonb |

### Anexos

Arquivos ficam no bucket `anexos-projetos` do Storage (público na leitura,
15 MB por arquivo, imagens e documentos de escritório). A tabela `anexos`
guarda só o caminho — a URL pública é derivada dele, então trocar de projeto
Supabase não quebra os links.

Antes de subir, imagem maior que 1600 px é redimensionada e recomprimida no
próprio navegador; foto de celular cai de alguns MB para algumas centenas de
KB. O plano free dá 1 GB de armazenamento.

O campo `momento` classifica cada anexo em **antes**, **depois**, **evidência**
ou **documento**; o campo `par` nomeia a cena e é o que liga um antes ao seu
depois na galeria comparativa. Anexo lançado junto com um acompanhamento fica
preso a ele (`atualizacao_id`) e aparece dentro do próprio reporte.

### Projeto e atividades

Abrir um projeto mostra **a lista do que há para fazer dentro dele**, não o
trabalho em si. Cada linha é uma atividade, com responsável, situação,
prioridade, prazo, saúde e avanço editáveis ali mesmo; abrir a atividade leva à
tela cheia, onde vivem marcos, tarefas, páginas, anexos e o documento em Word.

Isso é uma coluna `projeto_pai_id` na própria tabela de projetos: a atividade é
um projeto filho e herda tudo o que o projeto já sabe fazer, sem uma entidade
nova pela metade. Não há configuração: projeto de topo é sempre a pasta,
atividade é sempre o trabalho.

O nome das atividades vem do campo `rotulo_filhos` do projeto: "Melhorias" no
Bseller, "Frentes" ou "Etapas" em outro, "Atividades" quando ninguém escolhe. O
singular e o gênero saem do plural, para o botão sair "+ Nova melhoria", não
"+ Novo melhoria".

Consequências no resto do módulo:

- a **carteira** lista só os projetos de topo, com o número de atividades ao lado
  do nome (a caixa *Incluir melhorias* abre a lista plana);
- **painel** e **cronograma** contam apenas as folhas, para o projeto e as
  atividades dentro dele não contarem o mesmo trabalho duas vezes;
- o projeto mostra o **avanço médio** das atividades, ignorando as canceladas;
- projeto antigo que tinha marcos ou tarefas próprios continua mostrando o que
  já tinha, para nada se perder.

### Quadro (arrastar e soltar)

As melhorias de um grupo e as tarefas de um projeto aparecem em colunas por
situação, e o cartão muda de situação ao ser arrastado — no espírito do Jira.
Usa a API de arrastar do próprio navegador, sem biblioteca. No celular não há
arrastar, por isso todo cartão continua tendo o seletor de situação na visão em
lista, que é o caminho garantido.

### Páginas

Cada projeto tem páginas próprias — a folha onde se descreve o comportamento de
uma tela, com print no meio do texto e fluxograma logo abaixo.

Uma página é uma lista ordenada de blocos, guardada inteira em um `jsonb`: o
salvamento fica atômico e reordenar bloco não vira várias escritas que podem
falhar pela metade. Dois tipos de bloco:

- **texto** — editor rico (TipTap): títulos, listas, citação, código, link,
  tabela e imagem. Print colado com Ctrl+V é enviado para o Storage e entra como
  URL, nunca como base64 dentro do HTML.
- **fluxo** — fluxograma escrito em texto e desenhado pelo Mermaid
  (`flowchart TD`, `A --> B`, `B{Decisão}`). O desenho é atualizado enquanto se
  digita; erro de sintaxe mantém o último desenho válido e avisa embaixo.

Cada página tem **situação** própria: rascunho, em revisão, aprovada, concluída
ou cancelada. O seletor fica no canto superior direito da página e grava na hora,
sem passar pelo modo de edição; a lista da esquerda mostra o selo colorido de
cada uma, para saber o que já vale sem precisar abrir.

Cada salvamento grava a versão anterior em `paginas_versoes`, e o botão
*Histórico* restaura qualquer uma delas (a restauração só preenche o editor — o
salvamento continua explícito).

O HTML é limpo na hora de exibir (`src/lib/html.ts`), não só ao salvar: como o
módulo é aberto, alguém poderia gravar `<script>` direto pela API.

O editor e o Mermaid somam alguns MB e entram por carregamento sob demanda —
quem só consulta o painel não baixa nada disso.

### Documentos (Proposta de Melhoria Sistêmica)

O botão **Criar documento**, no detalhe do projeto, monta a proposta no padrão
Bseller e baixa o `.docx`: capa, 15 seções, cabeçalho com logo, rodapé com
"Página X de Y" e nome de arquivo `NN__Proposta_Melhoria_Sistemica_[Nome].docx`.
A geração é feita no próprio navegador com a biblioteca `docx`, sem servidor.

O formulário nasce preenchido com o que o projeto já sabe: título, categoria
(a área), prioridade e as fases de implantação (os marcos). Prints dos anexos
entram nas seções AS IS, TO BE ou nos anexos do fim, e os fluxogramas das
páginas viram imagem na seção 7.

**Gerar rascunho.** Preenchidos objetivo, dor atual, o que muda e problema
central, o botão escreve as demais seções recombinando esses textos e o que o
projeto já tem: ganhos, impactos, riscos, critérios de aceite, KPIs, rollout,
ROI e resumo executivo. Não é IA e não inventa conteúdo: onde não há base, deixa
a marcação de pendência, porque uma frase bonita e falsa é pior do que um "a
definir" honesto. Campo já escrito nunca é sobrescrito.

**Ponte com o chat (opcional).** O site é estático e não guarda chave de IA, então ele não
escreve o texto das seções. O botão *Copiar briefing* monta um texto com o
objetivo mais todo o contexto do projeto (marcos, tarefas, anexos, páginas) e o
JSON esperado de volta; cola-se no chat e o retorno entra pelo *Colar conteúdo*.
Número, imagens e fluxogramas nunca vêm de fora: são decididos no formulário.

Listas e tabelas são editadas como texto, uma linha por item e colunas separadas
por barra (`Dimensão | Ganho`). Travessão é trocado na geração, porque a
especificação o proíbe no conteúdo.

O índice geral (documento `00`) ainda não é gerado.

### Acesso

O módulo é aberto: sem login, como os demais da Central. Na prática, quem tiver
o endereço lê, cria, edita e apaga qualquer projeto — a chave publicável do
Supabase vai no bundle e o papel `anon` recebeu policy liberada em todas as
tabelas (`003_acesso_aberto.sql`).

O cadastro de **Pessoas** existe para atribuir responsáveis e filtrar a
carteira, não para controlar acesso. No histórico de acompanhamento, quem
reporta se identifica escolhendo o próprio nome (`autor_nome`).

#### Como religar o login depois

As regras por papel continuam no banco, intactas (`002_rls_e_gatilhos.sql`):
ler exige cadastro ativo vinculado ao login, criar exige `admin`/`editor`,
editar exige `admin` ou ser o responsável, e um gatilho impede autopromoção.
Para voltar a exigir login basta derrubar as policies de `anon` e restaurar a
tela de acesso:

```sql
drop policy pessoas_aberto on projetos.pessoas;
drop policy projetos_aberto on projetos.projetos;
drop policy marcos_aberto on projetos.marcos;
drop policy tarefas_aberto on projetos.tarefas;
drop policy atualizacoes_aberto on projetos.atualizacoes;
revoke select, insert, update, delete on all tables in schema projetos from anon;
```

## Configuração no painel do Supabase (uma vez só)

1. **Settings → API → Exposed schemas**: adicionar `projetos` à lista (o padrão
   traz só `public`). Sem isso o app recebe erro de schema inexistente.
2. **Authentication → URL Configuration**: só importa se o login voltar a ser
   exigido. Já está preenchido com o endereço publicado.

## Apontar para outro projeto Supabase

`src/lib/supabase.ts` traz URL e chave padrão embutidas, mas ambas podem ser
trocadas por variáveis de ambiente na hora do build:

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co VITE_SUPABASE_ANON_KEY=sb_publishable_xxx npm run publicar
```

## Como as regras de prazo funcionam

- **Atraso**: dias passados do fim previsto, contados só para projeto não encerrado.
- **Avanço esperado**: quanto do prazo já correu. Aparece como marca cinza na
  barra de progresso — o avanço informado abaixo dessa marca significa ritmo
  atrasado mesmo sem estourar a data.
- **Saúde**: `crítico` quando está em risco ou passou do prazo; `atenção` quando
  está 20 pontos ou mais atrás do esperado, pausado, ou vence em até 7 dias;
  `no prazo` no restante; `encerrado` para concluído e cancelado.

As cores de situação passaram pelo validador de daltonismo do guia de dataviz
(faixa de luminosidade, piso de croma e separação entre vizinhos). Nenhum
gráfico usa cor como código único: sempre há rótulo e valor.
