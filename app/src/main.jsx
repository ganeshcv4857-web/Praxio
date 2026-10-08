import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import LinkHandoff from './components/LinkHandoff.jsx';
import './theme-palette.css';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* /link?code=…: where a phone camera lands after scanning "Connect your phone". */}
    {window.location.pathname.replace(/\/+$/, '') === '/link' ? <LinkHandoff /> : <App />}
  </React.StrictMode>
);
