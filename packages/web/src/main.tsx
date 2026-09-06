import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@markup/renderer/document.css';
import './app/styles/app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
