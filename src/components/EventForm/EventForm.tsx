import type { TFunction } from 'i18next'
import { motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  poolCapBeforeInitialLumpForInvestment,
  poolCapBeforeRecurringForInvestment,
  remainingDepositForRecurringAfterPriorInvestments,
} from '../../engine/investmentPoolRemaining'
import { assetPlacementShortfallAtMonth } from '../../engine/assetPlacement'
import {
  referenceCareerGrossAtMonth,
  simulate,
  simulationHorizonMonths,
} from '../../engine/simulate'
import { loanMonthlyPayment, sacMonthlyPayment } from '../../engine/formulas'
import type {
  AssetLiabilityEvent,
  CareerEvent,
  FinancialEvent,
  InvestmentEvent,
  LifeImpactEvent,
  MacroEnvironmentEvent,
  WindfallEvent,
} from '../../events/types'
import { defaultEventNameI18nKey } from '../../events/defaults'
import { editorReferenceStartMonth } from '../../events/editorReferenceMonth'
import { syncEndFromDuration } from '../../events/syncEventWindow'
import { useAppStore, type AppLang } from '../../store/useAppStore'
import { eventColorFor, eventTintHex, graphAssetColors } from '../../utils/colors'
import { formatCurrency } from '../../utils/formatting'
import { pickYValue, scaledSavingsPool } from '../../engine/snapshotDisplay'
import { CurrencyInput } from '../shared/CurrencyInput'
import { DurationPicker, DurationYearPicker } from '../shared/DurationPicker'
import { FieldHint } from '../shared/FieldHint'
import { AmountPercentSlider } from '../shared/PercentageSlider'

type Props = {
  draft: FinancialEvent | null
  onChange: (e: FinancialEvent) => void
}

function num(v: string, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Rough portfolio size for macro hints: sum of initial + 12× monthly per investment. */
function investmentPortfolioNotional(events: FinancialEvent[]): number {
  let s = 0
  for (const ev of events) {
    if (ev.kind === 'investment') s += ev.initialAmount + ev.monthlyContribution * 12
  }
  return s
}

/** Timeline + current editor draft, for live simulation (includes not-yet-placed drafts). */
function mergedEventsForLiveSim(
  draft: FinancialEvent,
  events: FinancialEvent[],
  editingEventId: string | null,
): FinancialEvent[] {
  if (editingEventId !== null) {
    return events.map((x) =>
      x.id === editingEventId ? ({ ...draft, id: editingEventId } as FinancialEvent) : x,
    )
  }
  if (events.some((x) => x.id === draft.id)) return events
  return [...events, draft]
}

function FormSection({
  title,
  children,
  tint,
}: {
  title: string
  children: ReactNode
  tint?: string
}) {
  return (
    <div
      className="mb-3 rounded-lg border border-slate-800/90 p-3 last:mb-0"
      style={tint ? { backgroundColor: tint } : { backgroundColor: 'rgba(15,23,42,0.35)' }}
    >
      <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function HorizonPreviewLine({ draft, t }: { draft: FinancialEvent; t: TFunction }) {
  const events = useAppStore((s) => s.events)
  const editingEventId = useAppStore((s) => s.editingEventId)
  const projectionYears = useAppStore((s) => s.projectionYears)
  const currency = useAppStore((s) => s.currency)
  const showReal = useAppStore((s) => s.graphSettings.showRealValues)
  const graphPinnedMonth = useAppStore((s) => s.graphPinnedMonth)
  const isDragging = useAppStore((s) => s.isDragging)
  const dragPreviewMonth = useAppStore((s) => s.dragPreviewMonth)
  const draggingDraft = useAppStore((s) => s.draggingDraft)
  const simulation = useAppStore((s) => s.simulation)
  const lang = useAppStore((s) => s.lang)

  const months = useMemo(() => simulationHorizonMonths(projectionYears), [projectionYears])
  const baseSim = useMemo(() => {
    if (simulation.length === months && months > 0) return simulation
    return simulate(events, new Date(), months)
  }, [events, projectionYears, simulation, months])

  const line = useMemo(() => {
    const simLen = Math.max(months, simulation.length, 1)
    const refM = editorReferenceStartMonth({
      draft,
      graphPinnedMonth,
      isDragging,
      dragPreviewMonth,
      draggingDraft,
      simulationLength: simLen,
    })
    const draftAtRef = syncEndFromDuration({ ...draft, startMonth: refM } as FinancialEvent)
    const merged: FinancialEvent[] =
      editingEventId !== null
        ? events.map((e) =>
            e.id === editingEventId
              ? ({ ...draftAtRef, id: editingEventId } as FinancialEvent)
              : e,
          )
        : [...events.filter((e) => e.id !== draft.id), draftAtRef]

    const nextSim = simulate(merged, new Date(), months)
    if (nextSim.length === 0) return null
    const end = nextSim[nextSim.length - 1]!
    const endVal = pickYValue(end, showReal)
    if (events.length === 0 && editingEventId === null) {
      return t('form.horizon.only', { amount: formatCurrency(endVal, currency, lang) })
    }
    if (baseSim.length === 0) return t('form.horizon.only', { amount: formatCurrency(endVal, currency, lang) })
    const b = pickYValue(baseSim[baseSim.length - 1]!, showReal)
    const d = endVal - b
    if (Math.abs(d) < 1)
      return t('form.horizon.negligible', { amount: formatCurrency(endVal, currency, lang) })
    const arrow = d >= 0 ? '↑' : '↓'
    return t('form.horizon.delta', {
      arrow,
      delta: formatCurrency(Math.abs(d), currency, lang),
      total: formatCurrency(endVal, currency, lang),
    })
  }, [
    draft,
    events,
    editingEventId,
    projectionYears,
    currency,
    showReal,
    t,
    graphPinnedMonth,
    isDragging,
    dragPreviewMonth,
    draggingDraft,
    simulation.length,
    lang,
    baseSim,
    months,
  ])

  if (!line) return null
  return (
    <p className="font-figures rounded-md border border-teal-500/20 bg-teal-500/5 px-2.5 py-2 text-[11px] leading-snug text-teal-200/90 tabular-nums">
      {line}
    </p>
  )
}

export function EventForm({ draft, onChange }: Props) {
  const { t, i18n } = useTranslation()
  const currency = useAppStore((s) => s.currency)
  const lang = useAppStore((s) => s.lang)
  const allEvents = useAppStore((s) => s.events)
  const prevLangRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const prev = prevLangRef.current
    prevLangRef.current = i18n.language
    if (!draft) return
    if (prev === undefined || prev === i18n.language) return
    const key = defaultEventNameI18nKey(draft.kind)
    const prevDefault = i18n.t(key, { lng: prev })
    if (draft.name !== prevDefault) return
    const next = i18n.t(key)
    if (next !== draft.name) {
      onChange({ ...draft, name: next } as FinancialEvent)
    }
  }, [draft, i18n.language, onChange])

  if (!draft) {
    return (
      <p className="text-sm leading-relaxed text-slate-500">
        <Trans
          i18nKey="form.empty"
          components={[<strong key="ed" className="text-slate-400" />]}
        />
      </p>
    )
  }

  const labelCls = 'mb-1 flex items-center text-xs font-medium text-slate-400'
  const inputCls =
    'w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100'
  const tint = eventTintHex(eventColorFor(draft))

  return (
    <motion.div layout className="min-h-0 w-full space-y-1 pb-4 text-[11px]" key={draft.id}>
      <HorizonPreviewLine draft={draft} t={t} />

      <FormSection title={t('form.sections.basics')} tint={tint}>
        <div>
          <label className={labelCls} htmlFor="ev-name">
            {t('form.name')}
          </label>
          <input
            id="ev-name"
            className={inputCls}
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value } as FinancialEvent)}
          />
        </div>
      </FormSection>

      {draft.kind === 'career' && (
        <CareerFields
          e={draft}
          currency={currency}
          lang={lang}
          onChange={onChange}
          labelCls={labelCls}
          inputCls={inputCls}
          tint={tint}
          t={t}
        />
      )}
      {draft.kind === 'asset_liability' && (
        <AssetFields
          e={draft}
          currency={currency}
          lang={lang}
          onChange={onChange}
          labelCls={labelCls}
          inputCls={inputCls}
          tint={tint}
          t={t}
        />
      )}
      {draft.kind === 'investment' && (
        <InvestmentFields
          e={draft}
          currency={currency}
          lang={lang}
          onChange={onChange}
          labelCls={labelCls}
          inputCls={inputCls}
          tint={tint}
          t={t}
        />
      )}
      {draft.kind === 'life' && (
        <LifeFields
          e={draft}
          currency={currency}
          lang={lang}
          allEvents={allEvents}
          onChange={onChange}
          labelCls={labelCls}
          inputCls={inputCls}
          tint={tint}
          t={t}
        />
      )}
      {draft.kind === 'windfall' && (
        <WindfallFields e={draft} onChange={onChange} labelCls={labelCls} inputCls={inputCls} tint={tint} t={t} />
      )}
      {draft.kind === 'macro' && (
        <MacroFields
          e={draft}
          currency={currency}
          lang={lang}
          allEvents={allEvents}
          onChange={onChange}
          labelCls={labelCls}
          inputCls={inputCls}
          tint={tint}
          t={t}
        />
      )}
    </motion.div>
  )
}

function CareerFields({
  e,
  currency,
  lang,
  onChange,
  labelCls,
  inputCls,
  tint,
  t,
}: {
  e: CareerEvent
  currency: string
  lang: AppLang
  onChange: (x: FinancialEvent) => void
  labelCls: string
  inputCls: string
  tint?: string
  t: TFunction
}) {
  const gross = e.monthlyGrossIncome
  const netMonthly = gross * (1 - e.effectiveTaxRate)
  const taxMonthly = gross * e.effectiveTaxRate
  const savingsCapMonthly = netMonthly * e.savingsRate

  return (
    <>
      <FormSection title={t('form.sections.income')} tint={tint}>
        <div>
          <label className={labelCls}>
            {t('form.career.monthlyGross')}
            <FieldHint text={t('form.career.hintGross')} />
          </label>
          <CurrencyInput
            className={inputCls}
            value={e.monthlyGrossIncome}
            onChange={(monthlyGrossIncome) => onChange({ ...e, monthlyGrossIncome })}
            min={0}
          />
        </div>
      </FormSection>
      <FormSection title={t('form.sections.taxSavings')} tint={tint}>
        <div>
          <label className={labelCls}>
            {t('form.career.savingsRate')}
            <FieldHint text={t('form.career.hintSavings')} />
          </label>
          <AmountPercentSlider
            currency={currency}
            amount={savingsCapMonthly}
            amountMin={0}
            amountMax={Math.max(netMonthly, 1)}
            onAmountChange={(a) =>
              onChange({
                ...e,
                savingsRate: netMonthly > 0 ? Math.min(1, Math.max(0, a / netMonthly)) : 0,
              })
            }
            percentEdit={{
              value: e.savingsRate * 100,
              onChange: (p) =>
                onChange({
                  ...e,
                  savingsRate: netMonthly > 0 ? Math.min(1, Math.max(0, p / 100)) : 0,
                }),
              min: 0,
              max: 100,
              decimals: 1,
              suffix: t('form.career.percentOfNetSuffix'),
            }}
            amountSuffix={t('form.suffix.perMo')}
            hint={t('form.career.netAfterTax', { amount: formatCurrency(netMonthly, currency, lang) })}
            disabled={netMonthly <= 0}
          />
        </div>
        <div>
          <label className={labelCls}>
            {t('form.career.effectiveTax')}
            <FieldHint text={t('form.career.hintTax')} />
          </label>
          <AmountPercentSlider
            currency={currency}
            amount={taxMonthly}
            amountMin={0}
            amountMax={Math.max(gross, 1)}
            onAmountChange={(a) =>
              onChange({
                ...e,
                effectiveTaxRate: gross > 0 ? Math.min(1, Math.max(0, a / gross)) : 0,
              })
            }
            percentEdit={{
              value: e.effectiveTaxRate * 100,
              onChange: (p) =>
                onChange({
                  ...e,
                  effectiveTaxRate: gross > 0 ? Math.min(1, Math.max(0, p / 100)) : 0,
                }),
              min: 0,
              max: 100,
              decimals: 1,
              suffix: t('form.career.percentOfGrossSuffix'),
            }}
            amountSuffix={t('form.suffix.perMoTax')}
            hint={
              gross > 0
                ? t('form.career.grossPerMo', { amount: formatCurrency(gross, currency, lang) })
                : undefined
            }
            disabled={gross <= 0}
          />
        </div>
      </FormSection>
      <FormSection title={t('form.sections.duration')} tint={tint}>
        <DurationPicker
          valueMonths={e.durationMonths}
          onChangeMonths={(durationMonths) => {
            let next: CareerEvent = { ...e, durationMonths }
            if (durationMonths !== null) {
              next = { ...next, endMonth: next.startMonth + durationMonths - 1 }
            } else {
              next = { ...next, endMonth: null }
            }
            onChange(next)
          }}
        />
      </FormSection>
    </>
  )
}

function AssetFields({
  e,
  currency,
  lang,
  onChange,
  labelCls,
  inputCls,
  tint,
  t,
}: {
  e: AssetLiabilityEvent
  currency: string
  lang: AppLang
  onChange: (x: FinancialEvent) => void
  labelCls: string
  inputCls: string
  tint?: string
  t: TFunction
}) {
  const events = useAppStore((s) => s.events)
  const editingEventId = useAppStore((s) => s.editingEventId)
  const graphPinnedMonth = useAppStore((s) => s.graphPinnedMonth)
  const isDragging = useAppStore((s) => s.isDragging)
  const dragPreviewMonth = useAppStore((s) => s.dragPreviewMonth)
  const draggingDraft = useAppStore((s) => s.draggingDraft)
  const simulation = useAppStore((s) => s.simulation)
  const projectionYears = useAppStore((s) => s.projectionYears)
  const amortizationSystem = e.amortizationSystem ?? 'price'
  const installmentSource = e.installmentSource ?? 'expenses'
  const toggleWrapCls = 'grid grid-cols-2 gap-1 rounded-md border border-slate-700 bg-slate-900 p-1'
  const toggleBtnCls =
    'rounded px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:ring-1 focus-visible:ring-teal-500/45'
  const financed =
    e.mode === 'asset' ? Math.max(0, e.principal - e.downPayment) : e.principal
  const approxInterestMonthly = financed * (e.annualApr / 12)
  const termMonths = Math.max(1, Math.round(e.termYears * 12))
  const approxMonthlyPayment =
    financed > 0
      ? e.monthlyPaymentOverride ??
        (amortizationSystem === 'sac'
          ? sacMonthlyPayment(financed, financed, e.annualApr, termMonths)
          : loanMonthlyPayment(financed, e.annualApr, termMonths))
      : 0
  const valueChangeAnnual = e.principal * e.annualValueChangeRate
  const referenceMonth = useMemo(
    () =>
      editorReferenceStartMonth({
        draft: e,
        graphPinnedMonth,
        isDragging,
        dragPreviewMonth,
        draggingDraft,
        simulationLength: Math.max(1, simulation.length, simulationHorizonMonths(projectionYears)),
      }),
    [
      e,
      graphPinnedMonth,
      isDragging,
      dragPreviewMonth,
      draggingDraft,
      simulation.length,
      projectionYears,
    ],
  )
  const assetPlacementShortfall = useMemo(
    () =>
      assetPlacementShortfallAtMonth(
        events,
        e,
        referenceMonth,
        editingEventId,
        projectionYears,
      ),
    [events, e, referenceMonth, editingEventId, projectionYears],
  )

  return (
    <FormSection title={t('form.sections.assetLoan')} tint={tint}>
      <div>
        <label className={labelCls}>{t('form.asset.mode')}</label>
        <select
          className={inputCls}
          value={e.mode}
          onChange={(ev) =>
            onChange({
              ...e,
              mode: ev.target.value as AssetLiabilityEvent['mode'],
            })
          }
        >
          <option value="asset">{t('form.asset.asset')}</option>
          <option value="liability">{t('form.asset.liability')}</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>{t('form.asset.principal')}</label>
        <CurrencyInput
          className={inputCls}
          value={e.principal}
          onChange={(principal) =>
            onChange({
              ...e,
              principal,
              downPayment: e.mode === 'asset' ? Math.min(e.downPayment, principal) : e.downPayment,
            })
          }
          min={0}
        />
      </div>
      {e.mode === 'asset' && (
        <div>
          <label className={labelCls}>{t('form.asset.downPayment')}</label>
          <CurrencyInput
            className={inputCls}
            value={e.downPayment}
            onChange={(downPayment) =>
              onChange({ ...e, downPayment: Math.min(downPayment, e.principal) })
            }
            min={0}
          />
          {assetPlacementShortfall > 0.5 && (
            <p className="mt-1 text-[10px] font-medium text-amber-300/95">
              {t('form.asset.reserveShortfallAtMonth', {
                month: referenceMonth,
                amount: formatCurrency(assetPlacementShortfall, currency, lang),
              })}
            </p>
          )}
        </div>
      )}
      <div>
        <label className={labelCls}>
          {t('form.asset.apr')}
          <FieldHint text={t('form.asset.hintApr')} />
        </label>
        <AmountPercentSlider
          currency={currency}
          amount={approxInterestMonthly}
          amountMin={0}
          amountMax={Math.max(financed * (0.12 / 12), 1)}
          onAmountChange={(a) =>
            onChange({
              ...e,
              annualApr:
                financed > 0 ? Math.min(0.12, Math.max(0, (a * 12) / financed)) : 0,
            })
          }
          percentEdit={{
            value: e.annualApr * 100,
            onChange: (p) =>
              onChange({
                ...e,
                annualApr: financed > 0 ? Math.min(0.12, Math.max(0, p / 100)) : 0,
              }),
            min: 0,
            max: 12,
            decimals: 2,
            suffix: t('form.asset.aprPctSuffix'),
          }}
          amountSuffix={t('form.suffix.perMoInterest')}
          hint={
            financed > 0
              ? t('form.asset.onFinanced', { amount: formatCurrency(financed, currency, lang) })
              : t('form.asset.noFinanced')
          }
          disabled={financed <= 0}
        />
        <div className="mt-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              {t('form.asset.paymentPerMonth')}
            </span>
            <span className="font-figures tabular-nums text-sm text-slate-100">
              {formatCurrency(approxMonthlyPayment, currency, lang)}
              <span className="ml-1 text-xs text-slate-500">{t('form.suffix.perMo')}</span>
            </span>
          </div>
          {amortizationSystem === 'sac' && financed > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">{t('form.asset.sacPaymentHint')}</p>
          )}
        </div>
      </div>
      <div>
        <label className={labelCls}>{t('form.asset.termYears')}</label>
        <input
          type="number"
          min={1}
          className={`${inputCls} tabular-nums`}
          value={e.termYears}
          onChange={(ev) => onChange({ ...e, termYears: Math.max(1, num(ev.target.value, 1)) })}
        />
      </div>
      <div>
        <label className={labelCls}>{t('form.asset.amortizationSystem')}</label>
        <div className={toggleWrapCls} role="group" aria-label={t('form.asset.amortizationSystem')}>
          <button
            type="button"
            className={`${toggleBtnCls} ${
              amortizationSystem === 'price'
                ? 'bg-teal-600/25 text-teal-200'
                : 'text-slate-300 hover:bg-slate-800/80'
            }`}
            aria-pressed={amortizationSystem === 'price'}
            onClick={() => onChange({ ...e, amortizationSystem: 'price' })}
          >
            {t('form.asset.amortizationPrice')}
          </button>
          <button
            type="button"
            className={`${toggleBtnCls} ${
              amortizationSystem === 'sac'
                ? 'bg-teal-600/25 text-teal-200'
                : 'text-slate-300 hover:bg-slate-800/80'
            }`}
            aria-pressed={amortizationSystem === 'sac'}
            onClick={() => onChange({ ...e, amortizationSystem: 'sac' })}
          >
            {t('form.asset.amortizationSac')}
          </button>
        </div>
      </div>
      {e.mode === 'asset' && (
        <div>
          <label className={labelCls}>{t('form.asset.installmentSource')}</label>
          <div className={toggleWrapCls} role="group" aria-label={t('form.asset.installmentSource')}>
            <button
              type="button"
              className={`${toggleBtnCls} ${
                installmentSource === 'expenses'
                  ? 'bg-teal-600/25 text-teal-200'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
              aria-pressed={installmentSource === 'expenses'}
              onClick={() => onChange({ ...e, installmentSource: 'expenses' })}
            >
              {t('form.asset.installmentFromExpenses')}
            </button>
            <button
              type="button"
              className={`${toggleBtnCls} ${
                installmentSource === 'reserve'
                  ? 'bg-teal-600/25 text-teal-200'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
              aria-pressed={installmentSource === 'reserve'}
              onClick={() => onChange({ ...e, installmentSource: 'reserve' })}
            >
              {t('form.asset.installmentFromReserve')}
            </button>
          </div>
        </div>
      )}
      <div>
        <label className={labelCls}>
          {t('form.asset.valueChangeYr')}
          <FieldHint text={t('form.asset.hintValueChange')} />
        </label>
        <AmountPercentSlider
          currency={currency}
          amount={valueChangeAnnual}
          amountMin={e.principal > 0 ? -0.1 * e.principal : 0}
          amountMax={Math.max(e.principal * 0.15, 1)}
          onAmountChange={(a) =>
            onChange({
              ...e,
              annualValueChangeRate:
                e.principal > 0
                  ? Math.min(0.15, Math.max(-0.1, a / e.principal))
                  : 0,
            })
          }
          percentEdit={{
            value: e.annualValueChangeRate * 100,
            onChange: (p) =>
              onChange({
                ...e,
                annualValueChangeRate:
                  e.principal > 0 ? Math.min(0.15, Math.max(-0.1, p / 100)) : 0,
              }),
            min: -10,
            max: 15,
            decimals: 1,
            suffix: t('form.asset.pctPerYrSuffix'),
          }}
          amountSuffix={t('form.suffix.perYrOnValue')}
          hint={t('form.asset.principalHint', { amount: formatCurrency(e.principal, currency, lang) })}
          disabled={e.principal <= 0}
        />
      </div>
    </FormSection>
  )
}

function InvestmentPoolCallout({
  e,
  referenceMonth,
  currency,
  lang,
  t,
}: {
  e: InvestmentEvent
  referenceMonth: number
  currency: string
  lang: AppLang
  t: TFunction
}) {
  const events = useAppStore((s) => s.events)
  const editingEventId = useAppStore((s) => s.editingEventId)
  const projectionYears = useAppStore((s) => s.projectionYears)
  const showReal = useAppStore((s) => s.graphSettings.showRealValues)

  const hypothetical = useMemo(
    () => syncEndFromDuration({ ...e, startMonth: referenceMonth } as InvestmentEvent),
    [e, referenceMonth],
  )

  const snapshots = useMemo(() => {
    const months = simulationHorizonMonths(projectionYears)
    const merged = mergedEventsForLiveSim(hypothetical, events, editingEventId)
    return simulate(merged, new Date(), months)
  }, [hypothetical, events, editingEventId, projectionYears])

  if (snapshots.length === 0) return null

  const m = Math.min(Math.max(0, referenceMonth), snapshots.length - 1)
  const snapM = snapshots[m]!
  const poolAfter = scaledSavingsPool(snapM, showReal)
  const poolEntering =
    m > 0 ? scaledSavingsPool(snapshots[m - 1]!, showReal) : null
  const shortfall = snapM.investmentShortfall
  const askLump = e.contributionKind === 'lump_sum' ? e.initialAmount : 0
  const askMo = e.contributionKind === 'recurring' ? e.monthlyContribution : 0

  const amountCol =
    'inline-block min-w-[12ch] text-right font-figures tabular-nums [font-variant-numeric:tabular-nums] sm:min-w-[14ch]'

  return (
    <div
      className="w-full min-w-0 rounded-md border border-amber-600/30 bg-amber-950/25 px-2.5 py-2 text-[11px] leading-snug"
      role="status"
    >
      <p
        className="font-display text-[9px] font-semibold uppercase tracking-wider"
        style={{ color: graphAssetColors.savingsPool }}
      >
        {t('form.investment.poolTitle')}
      </p>
      {poolEntering !== null ? (
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="min-w-0 shrink text-slate-400">
            {t('form.investment.enteringMonthLabel', { m })}
          </span>
          <span className={`${amountCol} text-slate-300`}>
            {formatCurrency(poolEntering, currency, lang)}
          </span>
        </div>
      ) : (
        <p className="mt-1.5 text-[10px] text-slate-500">{t('form.investment.month0Pool')}</p>
      )}
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="min-w-0 shrink text-slate-400">{t('form.investment.afterMonthLabel', { m })}</span>
        <span className={amountCol}>
          <span className="font-semibold text-amber-200/90">
            {formatCurrency(poolAfter, currency, lang)}
          </span>
          <span className="font-normal text-slate-500"> {t('form.investment.planLabel')}</span>
        </span>
      </div>
      {(askLump > 0 || askMo > 0) && (
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          {t('form.investment.pullLead')}{' '}
          {askLump > 0 && (
            <span className="inline-block min-w-[13ch] font-figures tabular-nums text-slate-300">
              {formatCurrency(askLump, currency, lang)} {t('form.suffix.once')}
            </span>
          )}
          {askLump > 0 && askMo > 0 && ` ${t('form.suffix.and')} `}
          {askMo > 0 && (
            <span className="inline-block min-w-[13ch] font-figures tabular-nums text-slate-300">
              {formatCurrency(askMo, currency, lang)}
              {t('form.suffix.perMo')}
            </span>
          )}{' '}
          {t('form.investment.pullTail')}
        </p>
      )}
      {shortfall > 0.5 && (
        <p className="mt-1.5 font-medium text-amber-400/95">
          {t('form.investment.shortfall', {
            m,
            amount: formatCurrency(shortfall, currency, lang),
          })}
        </p>
      )}
    </div>
  )
}

function InvestmentFields({
  e,
  currency,
  lang,
  onChange,
  labelCls,
  inputCls,
  tint,
  t,
}: {
  e: InvestmentEvent
  currency: string
  lang: AppLang
  onChange: (x: FinancialEvent) => void
  labelCls: string
  inputCls: string
  tint?: string
  t: TFunction
}) {
  const graphPinnedMonth = useAppStore((s) => s.graphPinnedMonth)
  const isDragging = useAppStore((s) => s.isDragging)
  const dragPreviewMonth = useAppStore((s) => s.dragPreviewMonth)
  const draggingDraft = useAppStore((s) => s.draggingDraft)
  const simulation = useAppStore((s) => s.simulation)
  const events = useAppStore((s) => s.events)
  const editingEventId = useAppStore((s) => s.editingEventId)
  const projectionYears = useAppStore((s) => s.projectionYears)

  const referenceMonth = useMemo(
    () =>
      editorReferenceStartMonth({
        draft: e,
        graphPinnedMonth,
        isDragging,
        dragPreviewMonth,
        draggingDraft,
        simulationLength: Math.max(1, simulation.length, simulationHorizonMonths(projectionYears)),
      }),
    [
      e,
      graphPinnedMonth,
      isDragging,
      dragPreviewMonth,
      draggingDraft,
      simulation.length,
      projectionYears,
    ],
  )

  /** Merged timeline + draft (same as pool callout + graph tooltip rows). */
  const { mergedEventsForCap, snapshotRowForCap } = useMemo(() => {
    const months = simulationHorizonMonths(projectionYears)
    const hypothetical = syncEndFromDuration({ ...e, startMonth: referenceMonth } as InvestmentEvent)
    const merged = mergedEventsForLiveSim(hypothetical, events, editingEventId)
    const snaps = simulate(merged, new Date(), months)
    if (snaps.length === 0) return { mergedEventsForCap: merged, snapshotRowForCap: null as null }
    const idx = Math.min(Math.max(0, referenceMonth), snaps.length - 1)
    return { mergedEventsForCap: merged, snapshotRowForCap: snaps[idx]! }
  }, [e, events, editingEventId, projectionYears, referenceMonth])

  /** Same names as graph tooltip: pool deposit (income) — slider track length. */
  const monthlyPoolDeposit =
    snapshotRowForCap != null ? Math.max(0, snapshotRowForCap.poolIncomeDeposit) : 0
  /** Investments funded from pool this month (tied). */
  const poolFundingFromPool =
    snapshotRowForCap != null ? Math.max(0, snapshotRowForCap.poolFundingToInvestmentsTotal) : 0
  /** Income to pool minus investment funding this month (excludes pool interest; same line as graph tooltip). */
  const poolNetAfterFunding =
    snapshotRowForCap != null
      ? Math.max(
          0,
          snapshotRowForCap.poolIncomeDeposit - snapshotRowForCap.poolFundingToInvestmentsTotal,
        )
      : 0

  /**
   * Max recurring: min(liquidity headroom, remaining share of this month’s pool deposit).
   * Liquidity alone allows pulling from accumulated savings; deposit slice enforces e.g. 50%+50% of income.
   */
  const recurringContributionMax =
    snapshotRowForCap != null
      ? Math.min(
          poolCapBeforeRecurringForInvestment(
            mergedEventsForCap,
            referenceMonth,
            snapshotRowForCap,
            e.id,
          ),
          remainingDepositForRecurringAfterPriorInvestments(
            mergedEventsForCap,
            referenceMonth,
            monthlyPoolDeposit,
            e.id,
          ),
        )
      : 0

  /** Max initial lump: same order as `simulate` — prior investments’ lumps then recurring debits before this investment’s lump. */
  const initialLumpMaxStrict =
    snapshotRowForCap != null
      ? poolCapBeforeInitialLumpForInvestment(
          mergedEventsForCap,
          referenceMonth,
          snapshotRowForCap,
          e.id,
        )
      : 0

  const initialLumpClampMax = initialLumpMaxStrict

  /** Tracks last pool cap so we can bump lump up when the user was at max and the target month’s cap grows. */
  const prevLumpMaxRef = useRef<number | null>(null)

  /** Sync before paint so the range handle matches the cap immediately (useEffect runs too late). */
  useLayoutEffect(() => {
    if (e.contributionKind === 'lump_sum' && e.monthlyContribution !== 0) {
      onChange({ ...e, monthlyContribution: 0 })
    }
  }, [e, onChange])

  useLayoutEffect(() => {
    if (e.contributionKind !== 'recurring') return
    if (e.monthlyContribution > recurringContributionMax) {
      onChange({ ...e, monthlyContribution: recurringContributionMax })
    }
  }, [e, recurringContributionMax, onChange])

  useLayoutEffect(() => {
    if (e.contributionKind !== 'recurring') return
    if (e.initialAmount !== 0) {
      onChange({ ...e, initialAmount: 0 })
    }
  }, [e, onChange])

  useLayoutEffect(() => {
    if (e.contributionKind !== 'lump_sum') {
      prevLumpMaxRef.current = null
      return
    }
    const prev = prevLumpMaxRef.current
    const next = initialLumpClampMax
    if (
      prev !== null &&
      prev > 0 &&
      next > prev &&
      Math.abs(e.initialAmount - prev) < 0.51
    ) {
      onChange({ ...e, initialAmount: Math.round(next) })
    } else if (e.initialAmount > next) {
      onChange({ ...e, initialAmount: next })
    }
    prevLumpMaxRef.current = next
  }, [e, initialLumpClampMax, onChange])

  const recurringAmountForSlider = Math.min(
    e.monthlyContribution,
    Math.max(0, Number.isFinite(recurringContributionMax) ? recurringContributionMax : 0),
  )

  const referenceHint = useMemo(() => {
    if (isDragging && dragPreviewMonth !== null && draggingDraft?.id === e.id) {
      return t('form.investment.referenceDrag')
    }
    if (graphPinnedMonth !== null) {
      return t('form.investment.referencePinned', { month: referenceMonth })
    }
    return t('form.investment.referenceStart', { month: referenceMonth })
  }, [
    e.id,
    graphPinnedMonth,
    isDragging,
    dragPreviewMonth,
    draggingDraft?.id,
    referenceMonth,
    t,
  ])

  const notionalForReturn =
    e.contributionKind === 'recurring'
      ? Math.max(0, e.monthlyContribution * 12)
      : Math.max(
          e.initialAmount,
          e.monthlyContribution > 0 ? e.monthlyContribution * 12 : 0,
        )
  const returnAnnualEstimate = notionalForReturn * e.expectedAnnualReturn

  return (
    <>
      <FormSection title={t('form.sections.contributions')} tint={tint}>
        <InvestmentPoolCallout
          e={e}
          referenceMonth={referenceMonth}
          currency={currency}
          lang={lang}
          t={t}
        />
        <div>
          <label className={labelCls}>{t('form.investment.contribution')}</label>
          <select
            className={inputCls}
            value={e.contributionKind}
            onChange={(ev) => {
              const contributionKind = ev.target.value as InvestmentEvent['contributionKind']
              if (contributionKind === 'lump_sum') {
                const max =
                  snapshotRowForCap != null
                    ? poolCapBeforeInitialLumpForInvestment(
                        mergedEventsForCap,
                        referenceMonth,
                        snapshotRowForCap,
                        e.id,
                      )
                    : 0
                onChange({
                  ...e,
                  contributionKind: 'lump_sum',
                  monthlyContribution: 0,
                  initialAmount: max,
                })
              } else {
                onChange({ ...e, contributionKind: 'recurring', initialAmount: 0 })
              }
            }}
          >
            <option value="lump_sum">{t('form.investment.lumpSum')}</option>
            <option value="recurring">{t('form.investment.recurring')}</option>
          </select>
        </div>
        {e.contributionKind === 'lump_sum' && (
          <div>
            <label className={labelCls}>
              {t('form.investment.initialAmount')}
              <FieldHint text={t('form.investment.lumpSumInitialHint')} />
            </label>
            <CurrencyInput
              className={inputCls}
              value={e.initialAmount}
              onChange={(initialAmount) => onChange({ ...e, initialAmount })}
              min={0}
            />
          </div>
        )}
        {e.contributionKind === 'recurring' && (
          <div>
            <label className={labelCls}>
              {t('form.investment.monthlyContribution')}
              <FieldHint text={t('form.investment.monthlyPoolCapHint')} />
            </label>
            <p className="mb-1.5 text-[10px] leading-snug text-slate-500">{referenceHint}</p>
            {monthlyPoolDeposit > 0 ? (
              <>
                <div className="mb-1.5 space-y-0.5 text-[10px] leading-snug text-slate-500">
                  <p className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-0.5">
                    <span className="text-slate-400">{t('graph.poolIncomeThisMonth')}</span>
                    <span className="shrink-0 font-figures tabular-nums text-slate-300">
                      {formatCurrency(monthlyPoolDeposit, currency, lang)}
                    </span>
                  </p>
                  <p className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-0.5">
                    <span className="text-slate-400">{t('graph.poolFundingFromReserve')}</span>
                    <span className="shrink-0 font-figures tabular-nums text-slate-300">
                      {formatCurrency(poolFundingFromPool, currency, lang)}
                    </span>
                  </p>
                  <p className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-0.5">
                    <span className="text-slate-400">{t('graph.poolNetAfterFunding')}</span>
                    <span className="shrink-0 font-figures tabular-nums text-amber-200/90">
                      {formatCurrency(poolNetAfterFunding, currency, lang)}
                    </span>
                  </p>
                </div>
                <AmountPercentSlider
                  currency={currency}
                  amount={recurringAmountForSlider}
                  amountMin={0}
                  amountMax={Math.max(monthlyPoolDeposit, 1)}
                  amountClampMax={recurringContributionMax}
                  onAmountChange={(monthlyContribution) =>
                    onChange({
                      ...e,
                      monthlyContribution: Math.min(
                        monthlyContribution,
                        Math.max(
                          0,
                          Number.isFinite(recurringContributionMax) ? recurringContributionMax : 0,
                        ),
                      ),
                    })
                  }
                  percentEdit={{
                    value:
                      monthlyPoolDeposit > 0
                        ? (100 * recurringAmountForSlider) / monthlyPoolDeposit
                        : 0,
                    onChange: (p) => {
                      const pctMax =
                        monthlyPoolDeposit > 0
                          ? Math.min(
                              1000,
                              (100 * recurringContributionMax) / monthlyPoolDeposit,
                            )
                          : 100
                      const pct = Math.min(pctMax, Math.max(0, p))
                      onChange({
                        ...e,
                        monthlyContribution: Math.min(
                          recurringContributionMax,
                          (pct / 100) * monthlyPoolDeposit,
                        ),
                      })
                    },
                    min: 0,
                    max:
                      monthlyPoolDeposit > 0
                        ? Math.min(1000, (100 * recurringContributionMax) / monthlyPoolDeposit)
                        : 100,
                    decimals: 0,
                    suffix: t('form.investment.pctOfPoolDepositSuffix'),
                  }}
                  amountSuffix={t('form.suffix.perMo')}
                />
              </>
            ) : (
              <>
                <p className="mb-1.5 text-[10px] text-amber-200/90">{t('form.investment.noPoolDeposit')}</p>
                <p className="mb-1 text-[10px] text-slate-500">{t('form.investment.manualMonthlyHint')}</p>
                <CurrencyInput
                  className={inputCls}
                  value={e.monthlyContribution}
                  onChange={(monthlyContribution) => onChange({ ...e, monthlyContribution })}
                  min={0}
                />
              </>
            )}
          </div>
        )}
      </FormSection>
      <FormSection title={t('form.sections.growthHorizon')} tint={tint}>
        <div>
          <label className={labelCls}>
            {t('form.investment.expectedReturn')}
            <FieldHint text={t('form.investment.hintReturn')} />
          </label>
          <AmountPercentSlider
            currency={currency}
            amount={returnAnnualEstimate}
            amountMin={0}
            amountMax={Math.max(notionalForReturn * 0.2, 1)}
            onAmountChange={(a) =>
              onChange({
                ...e,
                expectedAnnualReturn:
                  notionalForReturn > 0
                    ? Math.min(0.2, Math.max(0, a / notionalForReturn))
                    : 0,
              })
            }
            percentEdit={{
              value: e.expectedAnnualReturn * 100,
              onChange: (p) =>
                onChange({
                  ...e,
                  expectedAnnualReturn:
                    notionalForReturn > 0 ? Math.min(0.2, Math.max(0, p / 100)) : 0,
                }),
              min: 0,
              max: 20,
              decimals: 1,
              suffix: t('form.investment.pctYrReturnSuffix'),
            }}
            amountSuffix={t('form.suffix.perYrGain')}
            hint={
              notionalForReturn > 0
                ? t('form.investment.notionalHint', {
                    amount: formatCurrency(notionalForReturn, currency, lang),
                  })
                : t('form.investment.setContributionHint')
            }
            disabled={notionalForReturn <= 0}
          />
        </div>
        <div>
          <label className={labelCls}>{t('form.investment.duration')}</label>
          <DurationYearPicker
            valueYears={e.durationYears}
            onChangeYears={(durationYears) => {
              let next: InvestmentEvent = { ...e, durationYears }
              if (durationYears !== null) {
                next = { ...next, endMonth: next.startMonth + durationYears * 12 - 1 }
              } else {
                next = { ...next, endMonth: null }
              }
              onChange(next)
            }}
          />
        </div>
      </FormSection>
    </>
  )
}

function LifeFields({
  e,
  currency,
  lang,
  allEvents,
  onChange,
  labelCls,
  inputCls,
  tint,
  t,
}: {
  e: LifeImpactEvent
  currency: string
  lang: AppLang
  allEvents: FinancialEvent[]
  onChange: (x: FinancialEvent) => void
  labelCls: string
  inputCls: string
  tint?: string
  t: TFunction
}) {
  const refGross = referenceCareerGrossAtMonth(allEvents, e.startMonth)
  const scaledGross = (refGross * e.incomeImpactPercent) / 100

  return (
    <FormSection title={t('form.sections.lifeImpact')} tint={tint}>
      <div>
        <label className={labelCls}>
          {t('form.life.monthlyExpenseDelta')}
          <FieldHint text={t('form.life.hintExpense')} />
        </label>
        <CurrencyInput
          className={inputCls}
          value={e.monthlyExpenseChange}
          onChange={(monthlyExpenseChange) => onChange({ ...e, monthlyExpenseChange })}
        />
      </div>
      <div>
        <label className={labelCls}>{t('form.life.oneTimeCost')}</label>
        <CurrencyInput
          className={inputCls}
          value={e.oneTimeCost}
          onChange={(oneTimeCost) => onChange({ ...e, oneTimeCost })}
          min={0}
        />
      </div>
      <div>
        <label className={labelCls}>
          {t('form.life.incomeImpact')}
          <FieldHint text={t('form.life.hintIncome')} />
        </label>
        <AmountPercentSlider
          currency={currency}
          amount={scaledGross}
          amountMin={0}
          amountMax={Math.max(refGross, 1)}
          onAmountChange={(a) =>
            onChange({
              ...e,
              incomeImpactPercent:
                refGross > 0 ? Math.min(100, Math.max(0, Math.round((a / refGross) * 100))) : e.incomeImpactPercent,
            })
          }
          percentEdit={{
            value: e.incomeImpactPercent,
            onChange: (p) =>
              onChange({
                ...e,
                incomeImpactPercent: Math.min(100, Math.max(0, Math.round(p))),
              }),
            min: 0,
            max: 100,
            decimals: 0,
            suffix: t('form.life.pctRefGrossSuffix'),
          }}
          amountSuffix={t('form.suffix.perMoGross')}
          hint={
            refGross > 0
              ? t('form.life.refGross', { amount: formatCurrency(refGross, currency, lang) })
              : t('form.life.addCareerHint')
          }
          disabled={refGross <= 0}
        />
      </div>
      <div>
        <label className={labelCls}>{t('form.life.duration')}</label>
        <DurationYearPicker
          valueYears={e.durationYears}
          onChangeYears={(durationYears) => {
            let next: LifeImpactEvent = { ...e, durationYears }
            if (durationYears !== null) {
              next = { ...next, endMonth: next.startMonth + durationYears * 12 - 1 }
            } else {
              next = { ...next, endMonth: null }
            }
            onChange(next)
          }}
        />
      </div>
    </FormSection>
  )
}

function WindfallFields({
  e,
  onChange,
  labelCls,
  inputCls,
  tint,
  t,
}: {
  e: WindfallEvent
  onChange: (x: FinancialEvent) => void
  labelCls: string
  inputCls: string
  tint?: string
  t: TFunction
}) {
  return (
    <FormSection title={t('form.sections.windfall')} tint={tint}>
      <div>
        <label className={labelCls} htmlFor="windfall-amt">
          {t('form.windfall.amount')}
          <FieldHint text={t('form.windfall.hint')} />
        </label>
        <CurrencyInput
          id="windfall-amt"
          className={inputCls}
          value={e.amount}
          onChange={(amount) => onChange({ ...e, amount: Math.max(0, amount) })}
          min={0}
        />
      </div>
    </FormSection>
  )
}

function MacroFields({
  e,
  currency,
  lang,
  allEvents,
  onChange,
  labelCls,
  inputCls,
  tint,
  t,
}: {
  e: MacroEnvironmentEvent
  currency: string
  lang: AppLang
  allEvents: FinancialEvent[]
  onChange: (x: FinancialEvent) => void
  labelCls: string
  inputCls: string
  tint?: string
  t: TFunction
}) {
  const baselineMonthlySpend = 1000
  const baselineAnnualSpend = baselineMonthlySpend * 12
  const inflationAnnualOnBaseline = baselineAnnualSpend * e.annualInflationRate
  const portfolioNotional = Math.max(investmentPortfolioNotional(allEvents), 50_000)
  const marketModAnnualOnPortfolio = portfolioNotional * e.marketReturnModifierAnnual
  const poolHintBalance = 10_000
  const poolYieldAnnualOnHint = poolHintBalance * e.interestRateEnvironmentAnnual

  return (
    <FormSection title={t('form.sections.macro')} tint={tint}>
      <div>
        <label className={labelCls}>
          {t('form.macro.inflationYr')}
          <FieldHint text={t('form.macro.hintInflation')} />
        </label>
        <AmountPercentSlider
          currency={currency}
          amount={inflationAnnualOnBaseline}
          amountMin={0}
          amountMax={baselineAnnualSpend * 0.15}
          onAmountChange={(a) =>
            onChange({
              ...e,
              annualInflationRate: Math.min(0.15, Math.max(0, a / baselineAnnualSpend)),
            })
          }
          percentEdit={{
            value: e.annualInflationRate * 100,
            onChange: (p) =>
              onChange({
                ...e,
                annualInflationRate: Math.min(0.15, Math.max(0, p / 100)),
              }),
            min: 0,
            max: 15,
            decimals: 1,
            suffix: t('form.asset.pctPerYrSuffix'),
          }}
          amountSuffix={t('form.suffix.perYr')}
          hint={t('form.macro.onBaseline', { amount: formatCurrency(baselineAnnualSpend, currency, lang) })}
        />
      </div>
      <div>
        <label className={labelCls}>
          {t('form.macro.marketModYr')}
          <FieldHint text={t('form.macro.hintMarket')} />
        </label>
        <AmountPercentSlider
          currency={currency}
          amount={marketModAnnualOnPortfolio}
          amountMin={portfolioNotional * -0.3}
          amountMax={portfolioNotional * 0.2}
          onAmountChange={(a) =>
            onChange({
              ...e,
              marketReturnModifierAnnual: Math.min(0.2, Math.max(-0.3, a / portfolioNotional)),
            })
          }
          percentEdit={{
            value: e.marketReturnModifierAnnual * 100,
            onChange: (p) =>
              onChange({
                ...e,
                marketReturnModifierAnnual: Math.min(0.2, Math.max(-0.3, p / 100)),
              }),
            min: -30,
            max: 20,
            decimals: 1,
            suffix: t('form.asset.pctPerYrSuffix'),
          }}
          amountSuffix={t('form.suffix.perYrEffect')}
          hint={t('form.macro.investedHint', { amount: formatCurrency(portfolioNotional, currency, lang) })}
        />
      </div>
      <div>
        <label className={labelCls}>
          {t('form.macro.poolYieldYr')}
          <FieldHint text={t('form.macro.hintPoolYield')} />
        </label>
        <AmountPercentSlider
          currency={currency}
          amount={poolYieldAnnualOnHint}
          amountMin={0}
          amountMax={poolHintBalance * 0.12}
          onAmountChange={(a) =>
            onChange({
              ...e,
              interestRateEnvironmentAnnual: Math.min(0.12, Math.max(0, a / poolHintBalance)),
            })
          }
          percentEdit={{
            value: e.interestRateEnvironmentAnnual * 100,
            onChange: (p) =>
              onChange({
                ...e,
                interestRateEnvironmentAnnual: Math.min(0.12, Math.max(0, p / 100)),
              }),
            min: 0,
            max: 12,
            decimals: 2,
            suffix: t('form.asset.pctPerYrSuffix'),
          }}
          amountSuffix={t('form.suffix.perYr')}
          hint={t('form.macro.refPool', { amount: formatCurrency(poolHintBalance, currency, lang) })}
        />
      </div>
      <div>
        <label className={labelCls}>{t('form.macro.durationYears')}</label>
        <input
          type="number"
          min={1}
          className={`${inputCls} tabular-nums`}
          value={e.durationYears}
          onChange={(ev) => {
            const durationYears = Math.max(1, num(ev.target.value, 1))
            onChange({
              ...e,
              durationYears,
              endMonth: e.startMonth + durationYears * 12 - 1,
            })
          }}
        />
      </div>
      <div>
        <label className={labelCls}>{t('form.macro.severity')}</label>
        <input
          type="number"
          min={1}
          max={10}
          className={`${inputCls} tabular-nums`}
          value={e.severity}
          onChange={(ev) =>
            onChange({ ...e, severity: Math.min(10, Math.max(1, num(ev.target.value, 5))) })
          }
        />
      </div>
    </FormSection>
  )
}
