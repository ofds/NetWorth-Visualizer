import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import { hydrateStoreFromStorage } from './lib/persistStorage'
import './index.css'
import App from './App.tsx'

hydrateStoreFromStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
