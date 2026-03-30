import { useTranslation } from 'react-i18next'
import { useAppStore, type AppLang } from '../../store/useAppStore'

export function LanguageIconButton({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)

  const nextLang: AppLang = lang === 'en' ? 'pt-BR' : 'en'
  const nextLabel = nextLang === 'en' ? t('lang.en') : t('lang.ptBR')

  const flag = lang === 'pt-BR' ? '🇧🇷' : '🇺🇸'

  return (
    <button
      type="button"
      onClick={() => setLang(nextLang)}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/90 bg-slate-900/80 text-lg leading-none transition-colors hover:border-teal-500/40 hover:bg-slate-800 ${className}`}
      title={t('lang.iconTitle', { next: nextLabel })}
      aria-label={t('lang.iconAria', { next: nextLabel, current: i18n.language === 'pt-BR' ? t('lang.ptBR') : t('lang.en') })}
    >
      <span aria-hidden className="select-none">
        {flag}
      </span>
    </button>
  )
}
