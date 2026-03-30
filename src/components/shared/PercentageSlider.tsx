import { useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import {
  currencyAffixes,
  formatCurrency,
  formatLocaleForLang,
  formatPlainInteger,
} from '../../utils/formatting'
import {
  defaultStep,
  focusPercentSeed,
  focusSeedText,
  formatPercentDisplay,
  parseAmount,
  parsePercentInput,
  roundPercent,
} from './percentageSliderMath'

export type PercentEditConfig = {
  /** Displayed percentage (e.g. 22.5 for 22.5%) */
  value: number
  onChange: (nextPercent: number) => void
  min: number
  max: number
  decimals: number
  /** i18n fragment after the % sign (leading space where needed) */
  suffix: string
}

export type AmountPercentSliderProps = {
  currency: string
  amount: number
  amountMin: number
  /** Upper end of the slider track (e.g. total monthly pool deposit). */
  amountMax: number
  /**
   * When set, the amount is clamped to this max (e.g. untied pool left for this investment).
   * Can be below or above `amountMax`; the track still spans `amountMin`..`amountMax`.
   */
  amountClampMax?: number
  amountStep?: number
  onAmountChange: (amount: number) => void
  /** Shown when `percentEdit` is absent, or when disabled with `percentEdit` as read-only fallback */
  percentLabel?: string
  /** When set (and not disabled), the % line is editable next to the suffix */
  percentEdit?: PercentEditConfig
  amountSuffix?: string
  hint?: string | null
  className?: string
  disabled?: boolean
}

function EditablePercentLine({
  config,
  disabled,
}: {
  config: PercentEditConfig
  disabled: boolean
}) {
  const { value, onChange, min, max, decimals, suffix } = config
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState('')
  const skipCommitRef = useRef(false)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [inputPx, setInputPx] = useState(24)

  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const clamped = Math.min(hi, Math.max(lo, value))

  const commit = () => {
    setEditing(false)
    const n = parsePercentInput(local)
    if (!Number.isFinite(n)) {
      onChange(clamped)
      return
    }
    const r = roundPercent(n, decimals)
    onChange(Math.min(hi, Math.max(lo, r)))
  }

  const onBlur = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false
      setEditing(false)
      setLocal('')
      return
    }
    commit()
  }

  const shown = editing ? local : formatPercentDisplay(clamped, decimals)
  const measureText =
    editing && local.trim() !== '' ? local : formatPercentDisplay(clamped, decimals) || '0'

  const pctTypography = 'px-0.5 py-0 text-[11px] font-figures tabular-nums text-slate-400'

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    setInputPx(Math.max(16, Math.ceil(el.getBoundingClientRect().width) + 2))
  }, [measureText])

  if (disabled) {
    return (
      <div className={`mt-0.5 text-[11px] text-slate-400 ${pctTypography}`}>
        <span className="tabular-nums">{formatPercentDisplay(clamped, decimals)}</span>
        <span>%</span>
        <span>{suffix}</span>
      </div>
    )
  }

  return (
    <div className="mt-0.5 flex flex-wrap items-baseline justify-end gap-0.5 text-[11px] text-slate-400">
      <div className="relative inline-flex justify-end align-baseline">
        <span
          ref={measureRef}
          className={`invisible absolute left-0 top-0 -z-10 whitespace-pre ${pctTypography}`}
          aria-hidden
        >
          {measureText}
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label="Percent"
          style={{ width: inputPx }}
          className={`box-border max-w-[min(100%,6rem)] cursor-text rounded border border-transparent bg-transparent text-right text-slate-400 outline-none ring-offset-0 transition-[box-shadow] focus:border-teal-500/40 focus:text-slate-200 focus:ring-1 focus:ring-teal-500/50 ${pctTypography}`}
          value={shown}
          onFocus={() => {
            setEditing(true)
            setLocal(focusPercentSeed(clamped, decimals))
          }}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              skipCommitRef.current = true
              setEditing(false)
              setLocal('')
              e.currentTarget.blur()
            }
          }}
        />
      </div>
      <span className="select-none">%</span>
      <span className="text-left">{suffix}</span>
    </div>
  )
}

/**
 * Slider moves a **continuous dollar (or unit) amount**; optional editable % line below.
 */
export function AmountPercentSlider({
  currency,
  amount,
  amountMin,
  amountMax,
  amountClampMax,
  amountStep,
  onAmountChange,
  percentLabel,
  percentEdit,
  amountSuffix = '',
  hint,
  className = '',
  disabled = false,
}: AmountPercentSliderProps) {
  const lang = useAppStore((s) => s.lang)
  const lo = Math.min(amountMin, amountMax)
  const trackHi = Math.max(amountMin, amountMax)
  const rawCap = amountClampMax !== undefined ? Math.max(lo, amountClampMax) : trackHi
  const valueCap = Number.isFinite(rawCap) ? rawCap : trackHi
  const step = amountStep ?? defaultStep(lo, trackHi)
  const clamped = Math.min(Math.max(lo, amount), valueCap)
  /** Thumb position on 0…trackHi: never past the track even if engine cap exceeds nominal max. */
  const sliderValue = Math.min(clamped, trackHi)
  const off = disabled || trackHi <= lo

  const locale = formatLocaleForLang(lang)
  const { prefix, suffix } = currencyAffixes(currency, locale, lang)

  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState('')
  const skipCommitRef = useRef(false)

  const commitLocal = () => {
    setEditing(false)
    const n = parseAmount(local)
    if (!Number.isFinite(n)) {
      onAmountChange(clamped)
      return
    }
    const rounded = step >= 1 ? Math.round(n) : Math.round(n / step) * step
    onAmountChange(Math.min(valueCap, Math.max(lo, rounded)))
  }

  const onAmountBlur = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false
      setEditing(false)
      setLocal('')
      return
    }
    commitLocal()
  }

  const numberShown = editing
    ? local
    : formatPlainInteger(off ? 0 : clamped, locale)

  const numberForMeasure =
    editing && local.trim() !== ''
      ? local
      : editing
        ? formatPlainInteger(0, locale)
        : formatPlainInteger(off ? 0 : clamped, locale)

  const numMeasureRef = useRef<HTMLSpanElement>(null)
  const minColMeasureRef = useRef<HTMLSpanElement>(null)
  const [numberInputPx, setNumberInputPx] = useState(8)
  const [minAmountColPx, setMinAmountColPx] = useState(0)

  const amountTypography =
    'px-1 py-0.5 text-xs font-figures tabular-nums text-slate-200'

  useLayoutEffect(() => {
    const el = numMeasureRef.current
    if (!el) return
    const w = el.getBoundingClientRect().width
    setNumberInputPx(Math.max(8, Math.ceil(w) + 2))
  }, [numberForMeasure])

  useLayoutEffect(() => {
    const el = minColMeasureRef.current
    if (!el) return
    setMinAmountColPx(Math.ceil(el.getBoundingClientRect().width))
  }, [trackHi, currency, amountSuffix, locale, off])

  const minColStyle =
    !off && minAmountColPx > 0 ? ({ minWidth: minAmountColPx } as const) : undefined

  const percentRow =
    percentEdit != null ? (
      <EditablePercentLine config={percentEdit} disabled={off} />
    ) : percentLabel != null ? (
      <div className="mt-0.5 text-[11px] text-slate-400">{percentLabel}</div>
    ) : null

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-start gap-3">
        <input
          type="range"
          min={lo}
          max={trackHi}
          step={step}
          value={off ? lo : sliderValue}
          disabled={off}
          onChange={(e) => {
            setEditing(false)
            setLocal('')
            const v = Number(e.target.value)
            onAmountChange(Math.min(valueCap, Math.max(lo, v)))
          }}
          className="mt-1 h-2 min-w-0 flex-1 cursor-pointer accent-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <div
          className="relative w-max shrink-0 text-right font-figures text-xs tabular-nums"
          style={minColStyle}
        >
          <span
            ref={minColMeasureRef}
            className={`pointer-events-none invisible absolute left-0 top-0 -z-10 whitespace-pre ${amountTypography}`}
            aria-hidden
          >
            {off ? '\u2007' : `${formatCurrency(trackHi, currency, lang)}${amountSuffix}`}
          </span>
          <div className="flex flex-wrap items-baseline justify-end gap-x-0.5">
            {prefix ? (
              <span className="shrink-0 select-none text-slate-200" aria-hidden>
                {prefix}
              </span>
            ) : null}
            <div className="relative inline-flex max-w-full justify-end align-baseline">
              <span
                ref={numMeasureRef}
                className={`invisible absolute left-0 top-0 -z-10 whitespace-pre ${amountTypography}`}
                aria-hidden
              >
                {numberForMeasure || '\u2007'}
              </span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                aria-label="Amount"
                disabled={off}
                style={{ width: numberInputPx }}
                className={`box-border max-w-[min(100%,18rem)] cursor-text rounded border border-transparent bg-transparent text-right outline-none ring-offset-0 transition-[box-shadow] focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/50 disabled:cursor-not-allowed disabled:opacity-40 ${amountTypography}`}
                value={numberShown}
                onFocus={() => {
                  if (off) return
                  setEditing(true)
                  setLocal(focusSeedText(clamped, step))
                }}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={onAmountBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur()
                  }
                  if (e.key === 'Escape') {
                    skipCommitRef.current = true
                    setEditing(false)
                    setLocal('')
                    e.currentTarget.blur()
                  }
                }}
              />
            </div>
            {suffix ? (
              <span className="shrink-0 select-none text-slate-200" aria-hidden>
                {suffix}
              </span>
            ) : null}
            {amountSuffix ? (
              <span className="font-normal text-slate-500">{amountSuffix}</span>
            ) : null}
          </div>
          {percentRow}
          {hint ? (
            <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{hint}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
