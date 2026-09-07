import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from '@/App';
import { initI18n } from '@/i18n';
import '@/index.css';

initI18n();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root is missing from index.html');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
