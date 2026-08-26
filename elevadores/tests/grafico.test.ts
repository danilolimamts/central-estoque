/* A resolucao em que o canvas e desenhado.

   O motivo de existir: o zoom da pagina e CSS zoom, e canvas e imagem.
   O navegador estica o desenho em vez de refaze-lo, e o grafico sai
   borrado enquanto o texto ao lado continua nitido. */
import { describe, it, expect } from 'vitest';
import { resolucaoDoDesenho } from '../src/components/charts/Grafico';

describe('resolução do desenho do gráfico', () => {
  it('desenha no dobro mesmo em tela comum sem zoom', () => {
    /* O painel é projetado em reunião: o piso de 2 melhora rótulo e
       linha fina mesmo quando não há zoom nenhum. */
    expect(resolucaoDoDesenho(1, 1)).toBe(2);
  });

  it('multiplica o zoom da página pela densidade da tela', () => {
    /* 2 × 1,5 = 3: é essa a resolução que evita o borrão. */
    expect(resolucaoDoDesenho(2, 1.5)).toBe(3);
  });

  it('o piso vale para a densidade final, não para o número cru', () => {
    /* Esta é a conta que estava errada e que a medição pegou.

       Aplicando o piso DEPOIS da multiplicação, 1 × 1,2 = 1,2 subiria
       para 2, e a densidade na tela seria 2/1,2 = 1,67 — pior do que
       sem zoom nenhum. O piso entra no dpr, e o zoom multiplica. */
    expect(resolucaoDoDesenho(1, 1.2)).toBeCloseTo(2.4, 5);
    expect(resolucaoDoDesenho(1, 1.2) / 1.2).toBeCloseTo(2, 5);
  });

  it('não passa do teto, porque a memória cresce ao quadrado', () => {
    expect(resolucaoDoDesenho(3, 2.5)).toBe(4);
    expect(resolucaoDoDesenho(4, 4)).toBe(4);
  });

  it('valor inválido não quebra o desenho', () => {
    /* devicePixelRatio ausente em ambiente sem tela, e fator zero
       enquanto o elemento ainda não foi medido. */
    expect(resolucaoDoDesenho(Number.NaN, 1)).toBe(2);
    expect(resolucaoDoDesenho(0, 1)).toBe(2);
    expect(resolucaoDoDesenho(2, 0)).toBe(2);
  });
});
