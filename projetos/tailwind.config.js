/** @type {import('tailwindcss').Config} */
// Espelha src/config/tokens.ts. Os mesmos valores hex vivem la como
// fonte da verdade para o TypeScript; aqui viram utilitarios.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        roxo: { DEFAULT: '#8B5CF6', escuro: '#6D28D9', medio: '#7C3AED', claro: '#C4B5FD', suave: '#F1EAFE' },
        navy: { DEFAULT: '#0A0E3D', medio: '#161933', claro: '#2A3AA8' },
        laranja: '#FA4616',
        tinta: { DEFAULT: '#161933', suave: '#6A6F94' },
        linha: '#E7E8F5',
        papel: '#F3F4FB',
        verde: '#2E8B57',
        ambar: '#C79212',
        vermelho: '#D2453A',
      },
      /* A tela usa a largura do monitor: em 1240 px sobrava um terco de
         cinza dos dois lados num monitor de escritorio, e o quadro de
         atividades ficava com duas colunas visiveis. O teto existe para
         a linha da tabela nao virar uma faixa perdida em monitor
         ultralargo. */
      maxWidth: { tela: '1760px' },
      fontFamily: { titulo: ['Poppins', 'Inter', 'sans-serif'], texto: ['Inter', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 3px rgba(20,24,60,.08), 0 1px 2px rgba(20,24,60,.04)',
        alto: '0 14px 30px -20px rgba(20,24,60,.35)',
      },
    },
  },
  plugins: [],
};
