import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from '@/App';
import { initI18n } from '@/i18n';
import '@/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root is missing from index.html');

/**
 * Wait for the reader's language before the first render.
 *
 * For an English reader this settles immediately and costs nothing — no fetch is
 * made. For everyone else it is one request for their locale's files, and it
 * buys the difference between arriving on the page they asked for and arriving
 * on an English one that changes under them a moment later.
 */
void initI18n().then(() => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
});
