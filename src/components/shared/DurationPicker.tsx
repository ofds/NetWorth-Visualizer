import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  /** Months until end, or null = indefinite */
  valueMonths: number | null
  onChangeMonths: (months: number | null) => void
  className?: string
}

export function DurationPicker({ valueMonths, onChangeMonths, className = '' }: Props) {
  const { t } = useTranslation()
  const presets = useMemo(
    () => [
      { label: t('duration.ongoing'), months: null as number | null },
      { label: t('duration.m12'), months: 12 },
      { label: t('duration.m24'), months: 24 },
      { label: t('duration.m60'), months: 60 },
    ],
    [t],
  )

  const presetKey =
    valueMonths === null
      ? 'null'
      : presets.some((p) => p.months === valueMonths)
        ? String(valueMonths)
        : 'custom'

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <select
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
        value={presetKey}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'null') onChangeMonths(null)
          else if (v === 'custom') return
          else onChangeMonths(Number(v))
        }}
      >
        {presets.map((p) => (
          <option key={String(p.months)} value={p.months === null ? 'null' : String(p.months)}>
            {p.label}
          </option>
        ))}
        <option value="custom">{t('duration.custom')}</option>
      </select>
      {presetKey === 'custom' && (
        <input
          type="number"
          min={1}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm tabular-nums text-slate-100"
          value={valueMonths ?? ''}
          placeholder={t('duration.placeholderMonths')}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return
            onChangeMonths(Math.max(1, Number(raw) || 1))
          }}
        />
      )}
    </div>
  )
}

type YearProps = {
  valueYears: number | null
  onChangeYears: (years: number | null) => void
  className?: string
}

export function DurationYearPicker({ valueYears, onChangeYears, className = '' }: YearProps) {
  const { t } = useTranslation()
  const yearPresets = useMemo(
    () => [
      { label: t('duration.ongoing'), years: null as number | null },
      { label: t('duration.y5'), years: 5 },
      { label: t('duration.y10'), years: 10 },
      { label: t('duration.y20'), years: 20 },
    ],
    [t],
  )

  const presetKey =
    valueYears === null
      ? 'null'
      : yearPresets.some((p) => p.years === valueYears)
        ? String(valueYears)
        : 'custom'

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <select
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
        value={presetKey}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'null') onChangeYears(null)
          else if (v === 'custom') return
          else onChangeYears(Number(v))
        }}
      >
        {yearPresets.map((p) => (
          <option key={String(p.years)} value={p.years === null ? 'null' : String(p.years)}>
            {p.label}
          </option>
        ))}
        <option value="custom">{t('duration.custom')}</option>
      </select>
      {presetKey === 'custom' && (
        <input
          type="number"
          min={1}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm tabular-nums text-slate-100"
          value={valueYears ?? ''}
          placeholder={t('duration.placeholderYears')}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return
            onChangeYears(Math.max(1, Number(raw) || 1))
          }}
        />
      )}
    </div>
  )
}
