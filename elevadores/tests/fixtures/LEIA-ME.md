# Fixtures dos testes

Os testes de regra de negocio rodam com uma planilha sintetica gerada em
memoria (`tests/helpers/planilhaSintetica.ts`), entao a suite passa sem
nenhum arquivo aqui.

A validacao dos numeros exatos da secao 9 do brief roda em
`tests/equalizacao.real.test.ts` e so e executada quando a planilha real
estiver presente. Enquanto ela nao existir, esses testes ficam **pulados**
(skipped), nao falham.

Para ativar a validacao contra os dados reais, coloque nesta pasta:

- `08. Equalização de Elevadores CD CAJAMAR.xlsx` (obrigatorio)
- `DE_PARA_LINK_FOTO.xlsx` (opcional, apenas para o teste das fotos)

Esses arquivos contem dados do negocio e **nao entram no repositorio**
(estao ignorados no `.gitignore`).

Depois de coloca-los, rode:

```bash
npm test
```

Os sete testes da secao 9 deixam de ser pulados e passam a validar:
parser (467 linhas, 190 pais, 21 conjuntos), equalizacao (comprar ~48
colunas e 21 bases, 3 casados, fechamento em deficit zero), valoracao
(44 a corrigir, 11 sem S, 135 corretos) e projeto (32 acoes, score 66-67,
saude Atencao, matriz com 9 pontos).
