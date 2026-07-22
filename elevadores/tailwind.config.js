/** @type {import('tailwindcss').Config} */
// Espelha src/config/tokens.ts (secao 10 do brief). Os mesmos valores hex
// vivem la como fonte da verdade para o codigo TypeScript; aqui ficam
// expostos como utilitarios do Tailwind. Manter os dois em sincronia.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        laranja: {
          DEFAULT: '#FA4616',
          escuro: '#C83812',
          medio: '#E13F14',
          claro: '#F8592D',
          suave: '#FB6B45',
        },
        navy: {
          DEFAULT: '#001A72',
          escuro: '#00155B',
          medio: '#001767',
          claro: '#1A3180',
          suave: '#33488E',
        },
        dark: {
          DEFAULT: '#1D1F2A',
          d2: '#171922',
          d3: '#1A1C26',
          d4: '#34353F',
          d5: '#4C4A55',
        },
        fundo: {
          profundo: '#0A0B23',
          azulProfundo: '#0B1934',
        },
        verde: '#1F7A4C',
        ambar: '#B8860B',
        cinzaTexto: '#5B5E6B',
        linha: '#E4E6EE',
      },
      fontFamily: {
        titulo: ['Poppins', 'sans-serif'],
        texto: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        cardHover: '0 6px 16px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
};
