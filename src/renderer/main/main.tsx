import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Шрифты встроены в программу: работают без интернета.
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/literata/400.css';
import '@fontsource/literata/400-italic.css';
import '@fontsource/literata/600.css';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Нет элемента #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
