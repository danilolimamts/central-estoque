/* Build alternativo para a pagina de visualizacao: junta todo o codigo
   num unico arquivo JS (sem divisao em chunks), que o script
   gerarPaginaUnica.mjs embute no HTML. O build normal (vite.config.ts)
   continua dividindo, que e melhor para o uso do dia a dia. */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist-pagina-unica',
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
