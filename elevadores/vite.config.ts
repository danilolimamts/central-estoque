/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Chart.js e PptxGenJS ficam empacotados no bundle (sem CDN), evitando
// bloqueio de firewall da empresa. Ver secao 4 do brief.
export default defineConfig({
  /* Caminho relativo: o site publicado fica em uma subpasta
     (central-estoque/equalizacao-elevadores), entao os arquivos nao
     podem ser buscados a partir da raiz do dominio. */
  base: './',
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
