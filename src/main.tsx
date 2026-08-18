import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import { hydrateStoreFromStorage } from './lib/persistStorage'
import { simulationStats } from './engine/simulate'
import './index.css'
import App from './App.tsx'

// Expose the simulation counter to benchmark harnesses (dev server and preview builds).
;(window as unknown as { __NWV_SIM_STATS__?: typeof simulationStats }).__NWV_SIM_STATS__ =
  simulationStats

hydrateStoreFromStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
