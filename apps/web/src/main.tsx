// React single-page app with the PixiJS village renderer (spec section
// 8-10, 14). Served as static files by the server; Vite proxies the API
// in development.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './index.css';

const queryClient = new QueryClient();

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root element missing from index.html');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
