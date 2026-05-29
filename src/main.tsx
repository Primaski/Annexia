import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Mount the React app into the <div id="root"> in index.html.
// StrictMode intentionally renders components twice in development
// to surface bugs caused by side effects — this is expected behavior.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
