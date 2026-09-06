import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './renderer/styles/document.css';
import './app/styles/app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
