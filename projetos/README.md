# Módulo de Projetos — Central de Estoque

Acompanhamento de projetos e iniciativas do CD Cajamar: carteira, marcos,
tarefas, histórico de acompanhamento, painel e cronograma.

Diferente dos outros módulos da Central, os dados **não** ficam no navegador:
são compartilhados por toda a equipe em um banco Supabase, com login e
permissões.

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
npm run verificar:tela # build + smoke test no navegador (precisa de um servidor local)
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

### Regras de acesso (RLS)

O site é público e a chave publicável do Supabase vai embutida no bundle — isso
é normal e esperado. Quem protege os dados é o RLS, não a chave:

- **Ler** exige cadastro ativo em `pessoas` vinculado ao login. Um e-mail que
  peça o link mágico sem estar cadastrado entra autenticado e não enxerga nada.
- **Criar projeto**: papel `admin` ou `editor`.
- **Editar projeto, marcos e tarefas**: `admin` ou a pessoa responsável pelo projeto.
- **Mudar o andamento da própria tarefa**: quem está como responsável dela.
- **Excluir projeto e gerenciar pessoas**: só `admin`.
- Ninguém muda o próprio papel: um gatilho bloqueia a autopromoção.
- O **primeiro** usuário que fizer login vira `admin` automaticamente — é ele que
  cadastra os demais em *Pessoas*. Depois disso o cadastro prévio passa a ser
  obrigatório.

## Configuração no painel do Supabase (uma vez só)

1. **Settings → API → Exposed schemas**: adicionar `projetos` à lista (o padrão
   traz só `public`). Sem isso o app recebe erro de schema inexistente.
2. **Authentication → URL Configuration**: incluir em *Redirect URLs* o endereço
   publicado (`https://danilolimamts.github.io/central-estoque/acompanhamento-projetos/`)
   e, para desenvolvimento, `http://localhost:5173/`. O link mágico só volta
   para URLs desta lista.
3. **Authentication → Providers → Email**: manter o provedor de e-mail ativo. O
   remetente padrão do Supabase tem limite baixo de envios; para uso diário da
   equipe vale configurar um SMTP próprio.

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
