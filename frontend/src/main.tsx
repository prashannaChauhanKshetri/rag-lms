import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './contexts/ToastContext.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import ToastContainer from './components/ToastContainer.tsx'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
        <ToastContainer />
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
