import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ProvedorSessao } from '@/estado/sessao';
import './estilos/base.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorSessao>
      <App />
    </ProvedorSessao>
  </StrictMode>
);
