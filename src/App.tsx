import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from './components/Layout/AppShell'

export default function App() {
  const { t, i18n } = useTranslation()

  useEffect(() => {
    document.title = t('app.title')
    document.documentElement.lang = i18n.language === 'pt-BR' ? 'pt-BR' : 'en'
  }, [t, i18n.language])

  return (
    <div className="h-full max-h-[100dvh] min-h-0 overflow-hidden">
      <AppShell />
    </div>
  )
}
