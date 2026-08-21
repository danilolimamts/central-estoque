# Modelo de e-mail — status do projeto

Copie o texto abaixo, troque o que está entre `[ ]` pelos números da tela e
cole a imagem do boletim no corpo do e-mail (botão **Gerar boletim** →
**Copiar boletim**).

Cada lacuna traz, em cinza, de onde ela sai no painel. Apague essas
indicações antes de enviar.

---

## Assunto

```
Equalização de Elevadores — status do projeto · CD Cajamar · [mês/ano]
```

---

## Corpo

```
Boa tarde,

Segue o status do projeto de Equalização de Elevadores no CD Cajamar.
O painel completo está na imagem abaixo.


ONDE ESTAMOS

O plano tem [total] ações. [concluídas] estão concluídas ([%]),
[andamento] em andamento e [pendentes] ainda não iniciadas.
[atrasadas] estão fora do prazo.

Ritmo médio: [média] ações concluídas por semana.


O QUE MUDOU NA OPERAÇÃO

O projeto existe para reduzir elevador voltando por erro do CD — item
trocado, peça faltando, conjunto incompleto.

  - [X] meses seguidos sem nenhuma divergência.
  - [Y] dos [Z] meses decorridos fecharam em zero.
  - [R$] devolvidos no ano, em [N] elevadores.

A curva mês a mês está no gráfico "Evolução das divergências", na imagem.


ESTOQUE

[%] dos conjuntos estão casados — [casados] de [total] — e prontos para
virar venda.

Para destravar o restante faltam [colunas] colunas e [bases] bases.
[%] do estoque está travado na reversa ([un] de [total] unidades), e
[n] conjuntos dependem só disso para fechar.


PRÓXIMOS PASSOS

  1. [ação]
  2. [ação]
  3. [ação]


UMA RESSALVA SOBRE OS NÚMEROS

A base de devoluções não tem padrão de preenchimento. O motivo de cada
caso vem em texto livre, escrito por quem atendeu, sem lista fechada de
opções. Por isso não é possível separar com 100% de precisão o que foi
sobra, falta, inversão de item, erro de transportadora, erro operacional
do CD ou problema de fornecedor — em vários casos o texto descreve o
sintoma e não a causa, e um mesmo caso poderia ser classificado de mais
de uma forma.

A classificação usada no painel é a melhor leitura possível desse texto.
Ela serve para mostrar ordem de grandeza e tendência, que é o que importa
para acompanhar o projeto. Ela não serve para atribuir responsabilidade a
uma área específica, e os números por responsável devem ser lidos com essa
reserva.

Padronizar o preenchimento na origem — uma lista fechada de motivos no
registro da devolução — é o que permitiria fechar essa distinção. Fica
como proposta.


Qualquer dúvida, estou à disposição.

[assinatura]
```

---

## De onde vem cada número

| Lacuna | Onde ler no painel |
|---|---|
| total, concluídas, em andamento, não iniciadas, atrasadas, % | Cartão **Status do projeto** (rosca) |
| média por semana | Subtítulo do cartão **Entregas por semana** |
| meses seguidos sem divergência, meses em zero, R$ no ano, N elevadores | Os 3 números do cartão **Evolução das divergências** |
| % casados, casados de total | KPI **Conjuntos casados** (Dashboard Geral) — o "de X" está na dica |
| colunas e bases a comprar | KPIs **Colunas a comprar** e **Bases a comprar** |
| % da reversa, unidades, conjuntos travados | KPI **Travado na reversa** — a dica traz as unidades e quantos conjuntos só esperam por ela |
| próximos passos | Botão **Copiar texto** no boletim — ele já lista os 4 primeiros |

O botão **Copiar texto** gera automaticamente a parte de "Onde estamos" e
os próximos passos, com os números já preenchidos. O resto é preenchido à
mão.

---

## Por que a ressalva fica no fim, e não no começo

Ela é uma limitação real e precisa estar escrita — se um gerente perguntar
"esse número de erro do CD é confiável?", a resposta já está no e-mail e
não parece defesa improvisada.

Mas ela não é a notícia. Abrir o e-mail com a ressalva faz o leitor
duvidar de tudo que vem depois, inclusive do que está bem medido: o
andamento do plano e o total devolvido não dependem dessa classificação.
Só a divisão por responsável depende. Por isso a ressalva vem depois dos
números, delimitando o que ela afeta.
