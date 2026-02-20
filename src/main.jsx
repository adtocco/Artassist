import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { NotificationProvider } from './components/Notifications'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </StrictMode>,
)
