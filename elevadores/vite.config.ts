/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/* Carimbo da versao publicada. Sem ele nao da para saber, olhando a
   tela, se o navegador esta servindo o build novo ou um em cache -
   que foi exatamente o que atrapalhou o acompanhamento das entregas.

   So a data e a hora. O hash do commit ficava sempre uma entrega
   atrasada, porque o build acontece antes do commit que o carrega
   existir - e um carimbo errado engana mais do que carimbo nenhum. */
function versao(): string {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// Chart.js e PptxGenJS ficam empacotados no bundle (sem CDN), evitando
// bloqueio de firewall da empresa. Ver secao 4 do brief.
export default defineConfig({
  /* Caminho relativo: o site publicado fica em uma subpasta
     (central-estoque/equalizacao-elevadores), entao os arquivos nao
     podem ser buscados a partir da raiz do dominio. */
  base: './',
  define: {
    __VERSAO__: JSON.stringify(versao()),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
