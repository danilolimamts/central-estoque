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
