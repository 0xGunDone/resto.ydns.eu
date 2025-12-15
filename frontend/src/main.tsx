import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerServiceWorker } from './utils/pushNotifications'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Регистрируем Service Worker для push-уведомлений
if ('serviceWorker' in navigator) {
  registerServiceWorker().catch(console.error);
}

