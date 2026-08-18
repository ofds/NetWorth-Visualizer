/**
 * FROZEN REFERENCE IMPLEMENTATION — do not modify.
 *
 * Exact pre-optimization copy of `src/engine/simulate.ts` (git HEAD 980a164),
 * used only by the equivalence regression suite (`simulateEquivalence.test.ts`)
 * to prove the optimized engine preserves financial behavior bit-for-bit.
 */
import type { CareerEvent, FinancialEvent } from '../events/types'
import { amortizationStep, loanMonthlyPayment, sacMonthlyPayment } from './formulas'
import {
  LEDGER_RESIDUAL_EVENT_ID,
  type EventMonthContribution,
  type InvestmentHoldingState,
  type LoanState,
  type MonthSnapshot,
  type PhysicalAssetState,
} from './types'

/** When no macro event is active, pool yield uses 0% (conservative). */
export const DEFAULT_POOL_YIELD_ANNUAL_WITHOUT_MACRO = 0

export type SimulateOptions = {
  baseMonthlyExpenses: number
  initialLiquid: number
  /** Starting savings pool (deployable capital). */
  initialSavingsPool: number
  /** Annual inflation when no macro overrides (decimal) */
  defaultAnnualInflation: number
}

/** Baseline spend is 0 unless you add career/cash-flow or pass `baseMonthlyExpenses`. */
export const DEFAULT_SIMULATE_OPTIONS: SimulateOptions = {
  baseMonthlyExpenses: 0,
  initialLiquid: 0,
  initialSavingsPool: 0,
  defaultAnnualInflation: 0.025,
}

export type SimulateRunOptions = Partial<SimulateOptions> & {
  /** Fires when an investment could not take the full lump or recurring amount from the pool. */
  onInvestmentShortfall?: (month: number, eventId: string, amount: number) => void
  /** Fires when an asset down payment exceeds non-negative pool at activation month. */
  onAssetDownPaymentShortfall?: (month: number, eventId: string, amount: number) => void
}

/** Month count used by the engine and graph X-axis (must match drag-to-timeline mapping). */
export function simulationHorizonMonths(projectionYears: number): number {
  return Math.min(600, Math.max(12, Math.round(projectionYears * 12)))
}

/**
 * Calendar month arithmetic without JS `setMonth` overflow (e.g. Jan 31 + 1 mo → March).
 * Clips the day to the last day of the target month when needed (Jan 31 + 1 → Feb 28/29).
 */
export function addMonths(start: Date, months: number): Date {
  const day = start.getDate()
  const firstOfTarget = new Date(start.getFullYear(), start.getMonth() + months, 1)
  const lastDayOfTarget = new Date(
    firstOfTarget.getFullYear(),
    firstOfTarget.getMonth() + 1,
    0,
  ).getDate()
  return new Date(
    firstOfTarget.getFullYear(),
    firstOfTarget.getMonth(),
    Math.min(day, lastDayOfTarget),
  )
}

export function isEventActive(event: FinancialEvent, month: number): boolean {
  if (month < event.startMonth) return false
  if (event.endMonth === null) return true
  return month <= event.endMonth
}

/**
 * One income job at a time: each career is treated as a segment on the path. The next job
 * (later `startMonth`) ends the prior segment the month before it starts—whether the user
 * placed that job after (new role) or added an earlier segment (revised start of path).
 */
export function computeCareerEffectiveEndById(events: FinancialEvent[]): Map<string, number | null> {
  const careers: CareerEvent[] = events.filter((e): e is CareerEvent => e.kind === 'career')
  careers.sort((a, b) => a.startMonth - b.startMonth || a.id.localeCompare(b.id))
  const map = new Map<string, number | null>()
  for (let i = 0; i < careers.length; i++) {
    const c = careers[i]!
    const next = careers[i + 1]
    let eff = c.endMonth
    if (next && next.startMonth > c.startMonth) {
      const cap = next.startMonth - 1
      eff = eff === null ? cap : Math.min(eff, cap)
    }
    map.set(c.id, eff)
  }
  return map
}

/**
 * Inclusive [start, end] month indices for the life-timeline ruler, matching
 * `isEventActiveForSimulation` (careers use the chained effective end from the next role).
 */
export function eventTimelineSegment(
  e: FinancialEvent,
  allEvents: FinancialEvent[],
  horizonMonths: number,
): { start: number; end: number } {
  const xMax = Math.max(0, horizonMonths - 1)
  const careerEff = computeCareerEffectiveEndById(allEvents)

  let end: number
  if (e.kind === 'career') {
    const eff = careerEff.get(e.id)
    if (eff === undefined) {
      end = e.endMonth === null ? xMax : Math.min(e.endMonth, xMax)
    } else if (eff === null) {
      end = xMax
    } else {
      end = Math.min(eff, xMax)
    }
  } else {
    end = e.endMonth === null ? xMax : Math.min(e.endMonth, xMax)
  }

  const start = Math.min(Math.max(0, e.startMonth), xMax)
  const endClamped = Math.max(start, Math.min(end, xMax))
  return { start, end: endClamped }
}

function isCareerActiveWithEffectiveEnd(
  c: CareerEvent,
  month: number,
  effectiveEnd: number | null,
): boolean {
  if (month < c.startMonth) return false
  if (effectiveEnd !== null && month > effectiveEnd) return false
  return true
}

function isEventActiveForSimulation(
  e: FinancialEvent,
  month: number,
  careerEff: Map<string, number | null>,
): boolean {
  if (e.kind !== 'career') return isEventActive(e, month)
  const eff = careerEff.get(e.id)
  if (eff === undefined) return isEventActive(e, month)
  return isCareerActiveWithEffectiveEnd(e, month, eff)
}

/** Gross for the single career that drives income in `month` (after career-chain rules). */
export function referenceCareerGrossAtMonth(events: FinancialEvent[], month: number): number {
  const careerEff = computeCareerEffectiveEndById(events)
  const winners = events
    .filter((e): e is CareerEvent => e.kind === 'career')
    .filter((c) => isEventActiveForSimulation(c, month, careerEff))
    .sort((a, b) => a.startMonth - b.startMonth || a.id.localeCompare(b.id))
  const w = winners[winners.length - 1]
  return w?.monthlyGrossIncome ?? 0
}

function monthlyRateFromAnnual(annual: number): number {
  return (1 + annual) ** (1 / 12) - 1
}

function mergeLedger(map: Map<string, number>, id: string, amt: number): void {
  if (Math.abs(amt) < 1e-12) return
  map.set(id, (map.get(id) ?? 0) + amt)
}

function ledgerToContributions(ledger: Map<string, number>): EventMonthContribution[] {
  const arr: EventMonthContribution[] = []
  for (const [eventId, amount] of ledger) {
    if (Math.abs(amount) < 1e-9) continue
    arr.push({ eventId, amount })
  }
  arr.sort(
    (a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.eventId.localeCompare(b.eventId),
  )
  return arr
}

type InvestmentRow = InvestmentHoldingState & { eventId: string }

/**
 * Order events for the monthly loop: by `startMonth`, then **input array order** (not id).
 * Matches carousel order after `reorderEvents`, and puts `mergedEventsForLiveSim` drafts
 * after existing rows when they share the same start month — so a second investment
 * is funded after the first’s recurring when the user adds it later.
 */
export function sortEventsForSimulation(events: FinancialEvent[]): FinancialEvent[] {
  return [...events]
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      a.e.startMonth !== b.e.startMonth ? a.e.startMonth - b.e.startMonth : a.i - b.i,
    )
    .map((x) => x.e)
}

export function simulateReference(
  events: FinancialEvent[],
  startDate: Date,
  months: number,
  options: SimulateRunOptions = {},
): MonthSnapshot[] {
  const { onInvestmentShortfall, onAssetDownPaymentShortfall, ...optsRest } = options
  const opts: SimulateOptions = { ...DEFAULT_SIMULATE_OPTIONS, ...optsRest }
  const sorted = sortEventsForSimulation(events)
  const careerEffectiveEndById = computeCareerEffectiveEndById(events)

  let liquid = opts.initialLiquid
  let savingsPool = opts.initialSavingsPool
  const investments: InvestmentRow[] = []
  const loans: LoanState[] = []
  const physical: PhysicalAssetState[] = []

  let cumulativeInflation = 1
  const snapshots: MonthSnapshot[] = []

  for (let m = 0; m < months; m++) {
    const ledger = new Map<string, number>()
    const active = sorted.filter((e) => isEventActiveForSimulation(e, m, careerEffectiveEndById))
    const activeIds = active.map((e) => e.id)

    // —— Activations at start of month m (investment rows + liability-only loans) ——
    let poolAssetDownPaymentsTotal = 0
    for (const e of sorted) {
      if (e.startMonth !== m) continue
      if (e.kind === 'investment') {
        investments.push({
          id: e.id,
          eventId: e.id,
          value: 0,
          annualReturn: e.expectedAnnualReturn,
          monthlyContribution:
            e.contributionKind === 'recurring' ? e.monthlyContribution : 0,
        })
      } else if (e.kind === 'asset_liability' && e.mode === 'liability') {
        const amortizationSystem = e.amortizationSystem ?? 'price'
        const installmentSource = e.installmentSource ?? 'expenses'
        const termMonths = Math.max(1, Math.round(e.termYears * 12))
        const pmt =
          e.monthlyPaymentOverride ??
          loanMonthlyPayment(e.principal, e.annualApr, termMonths)
        loans.push({
          id: `${e.id}-loan`,
          eventId: e.id,
          balance: e.principal,
          initialPrincipal: e.principal,
          annualApr: e.annualApr,
          amortizationSystem,
          installmentSource,
          firstPaymentMonth: m,
          originalTermMonths: termMonths,
          termMonthsRemaining: termMonths,
          monthlyPayment: pmt,
        })
        mergeLedger(ledger, e.id, -e.principal)
      } else if (e.kind === 'asset_liability' && e.mode === 'asset') {
        const downPaymentNominal = Math.min(Math.max(0, e.downPayment), Math.max(0, e.principal))
        if (downPaymentNominal !== 0) continue
        const amortizationSystem = e.amortizationSystem ?? 'price'
        const installmentSource = e.installmentSource ?? 'expenses'
        const financed = Math.max(0, e.principal - downPaymentNominal)
        const termMonths = Math.max(1, Math.round(e.termYears * 12))
        const pmt =
          e.monthlyPaymentOverride ??
          loanMonthlyPayment(financed, e.annualApr, termMonths)
        if (financed > 0) {
          loans.push({
            id: `${e.id}-loan`,
            eventId: e.id,
            balance: financed,
            initialPrincipal: financed,
            annualApr: e.annualApr,
            amortizationSystem,
            installmentSource,
            firstPaymentMonth: m,
            originalTermMonths: termMonths,
            termMonthsRemaining: termMonths,
            monthlyPayment: pmt,
          })
        }
        physical.push({
          id: `${e.id}-asset`,
          currentValue: e.principal,
          annualRate: e.annualValueChangeRate,
        })
      }
    }

    // —— Macro (most recently started active macro wins) ——
    const macros = active
      .filter((e): e is Extract<FinancialEvent, { kind: 'macro' }> => e.kind === 'macro')
      .sort((a, b) => a.startMonth - b.startMonth)
    const macro = macros[macros.length - 1]
    const annualInflation =
      macro?.annualInflationRate ?? opts.defaultAnnualInflation
    const marketModifier = macro?.marketReturnModifierAnnual ?? 0
    const currentPoolRate =
      macro?.interestRateEnvironmentAnnual ?? DEFAULT_POOL_YIELD_ANNUAL_WITHOUT_MACRO

    const monthlyInfl = monthlyRateFromAnnual(annualInflation)
    cumulativeInflation *= 1 + monthlyInfl

    // —— Career (single segment per month; latest start among chain-active careers wins) ——
    const careers = active
      .filter((e): e is Extract<FinancialEvent, { kind: 'career' }> => e.kind === 'career')
      .sort((a, b) => a.startMonth - b.startMonth || a.id.localeCompare(b.id))
    const career = careers[careers.length - 1]
    const grossIncomeBase = career?.monthlyGrossIncome ?? 0
    const taxRate = career?.effectiveTaxRate ?? 0
    const savingsRate = career?.savingsRate ?? 0

    // —— Life: expenses + income scale + one-time ——
    let lifeExpenseExtra = 0
    let incomeMultiplier = 1
    for (const e of active) {
      if (e.kind === 'life') {
        lifeExpenseExtra += e.monthlyExpenseChange
        incomeMultiplier *= e.incomeImpactPercent / 100
      }
    }
    for (const e of active) {
      if (e.kind === 'life' && e.startMonth === m) {
        liquid -= e.oneTimeCost
        mergeLedger(ledger, e.id, -e.oneTimeCost)
      }
    }

    const grossIncome = grossIncomeBase * incomeMultiplier
    const netIncome = grossIncome * (1 - taxRate)

    const loanScheduledPaymentById = new Map<string, number>()
    let loanPaymentTotal = 0
    let poolLoanPaymentsTotal = 0
    for (const loan of loans) {
      if (loan.balance <= 0 || loan.termMonthsRemaining <= 0) continue
      if (m < loan.firstPaymentMonth) continue
      const scheduled =
        loan.amortizationSystem === 'sac'
          ? sacMonthlyPayment(
              loan.balance,
              loan.initialPrincipal,
              loan.annualApr,
              loan.originalTermMonths,
            )
          : loan.monthlyPayment
      loanScheduledPaymentById.set(loan.id, scheduled)
      if (loan.installmentSource === 'reserve') {
        poolLoanPaymentsTotal += scheduled
      } else {
        loanPaymentTotal += scheduled
      }
    }

    const inflatedBase = opts.baseMonthlyExpenses * cumulativeInflation
    const totalExpenses = inflatedBase + lifeExpenseExtra + loanPaymentTotal

    const monthlySavings = netIncome - totalExpenses
    let investmentShortfall = 0
    const investmentShortfallByEvent: Record<string, number> = {}
    const assetDownPaymentShortfallByEvent: Record<string, number> = {}
    let poolIncomeDeposit = 0
    let poolDeficitCoverTotal = 0
    let poolWindfallTotal = 0

    for (const e of active) {
      if (e.kind === 'life' && e.monthlyExpenseChange !== 0) {
        mergeLedger(ledger, e.id, -e.monthlyExpenseChange)
      }
    }

    // —— Pool: surplus (capped by savings rate), deficit (pool then liquid), then interest ——
    // Interest is applied on the balance after the monthly deposit/draw (SAVINGS_POOL_PLAN §4).
    if (monthlySavings > 0) {
      const saveCap = netIncome * Math.max(0, savingsRate)
      const surplus = Math.min(monthlySavings, saveCap)
      poolIncomeDeposit = surplus
      savingsPool += surplus
    } else if (monthlySavings < 0) {
      const deficit = -monthlySavings
      const priorPool = savingsPool
      if (priorPool >= 0) {
        const newPool = Math.max(0, priorPool - deficit)
        poolDeficitCoverTotal = priorPool - newPool
        savingsPool = newPool
        const remainder = Math.max(0, deficit - priorPool)
        liquid -= remainder
      } else {
        // Pool already negative (e.g. reserve borrowing after an asset down payment): shortfalls
        // deepen the negative pool instead of zeroing it out.
        poolDeficitCoverTotal = deficit
        savingsPool = priorPool - deficit
      }
    }

    // —— Windfall: one-time credit to reserve (inheritance, gift, etc.) — before asset down payments. ——
    for (const e of sorted) {
      if (e.kind !== 'windfall' || e.startMonth !== m) continue
      const amt = Math.max(0, e.amount)
      if (amt <= 0) continue
      savingsPool += amt
      poolWindfallTotal += amt
      mergeLedger(ledger, e.id, amt)
    }

    // —— Asset down payment (>0): after this month’s surplus → pool (same month’s income is
    // available before debiting reserve). Down payment 0 is handled at month start so the loan
    // exists before scheduled-payment math for month m.
    for (const e of sorted) {
      if (e.startMonth !== m) continue
      if (e.kind !== 'asset_liability' || e.mode !== 'asset') continue
      const amortizationSystem = e.amortizationSystem ?? 'price'
      const installmentSource = e.installmentSource ?? 'expenses'
      const downPaymentNominal = Math.min(Math.max(0, e.downPayment), Math.max(0, e.principal))
      if (downPaymentNominal === 0) continue
      const downPaymentShortfall = Math.max(0, downPaymentNominal - Math.max(0, savingsPool))
      if (downPaymentShortfall > 0) {
        onAssetDownPaymentShortfall?.(m, e.id, downPaymentShortfall)
        assetDownPaymentShortfallByEvent[e.id] =
          (assetDownPaymentShortfallByEvent[e.id] ?? 0) + downPaymentShortfall
      }
      savingsPool -= downPaymentNominal
      poolAssetDownPaymentsTotal += downPaymentNominal
      mergeLedger(ledger, e.id, -downPaymentNominal)
      const financed = Math.max(0, e.principal - downPaymentNominal)
      const termMonths = Math.max(1, Math.round(e.termYears * 12))
      const pmt =
        e.monthlyPaymentOverride ??
        loanMonthlyPayment(financed, e.annualApr, termMonths)
      if (financed > 0) {
        loans.push({
          id: `${e.id}-loan`,
          eventId: e.id,
          balance: financed,
          initialPrincipal: financed,
          annualApr: e.annualApr,
          amortizationSystem,
          installmentSource,
          firstPaymentMonth: e.downPayment > 0 ? m + 1 : m,
          originalTermMonths: termMonths,
          termMonthsRemaining: termMonths,
          monthlyPayment: pmt,
        })
      }
      physical.push({
        id: `${e.id}-asset`,
        currentValue: e.principal,
        annualRate: e.annualValueChangeRate,
      })
    }

    if (poolLoanPaymentsTotal > 0) {
      // Optional mode: service installments directly from reserve instead of monthly expenses.
      savingsPool -= poolLoanPaymentsTotal
    }

    const poolBeforeInterest = savingsPool
    savingsPool *= 1 + currentPoolRate / 12
    const poolInterestEarned = savingsPool - poolBeforeInterest
    mergeLedger(ledger, macro?.id ?? LEDGER_RESIDUAL_EVENT_ID, poolInterestEarned)

    if (career && poolIncomeDeposit > 0) {
      mergeLedger(ledger, career.id, poolIncomeDeposit)
    }

    // —— Fund investments from pool (capped to non‑negative pool), then apply returns ——
    let poolFundingToInvestmentsTotal = 0
    for (const row of investments) {
      const ev = sorted.find(
        (e): e is Extract<FinancialEvent, { kind: 'investment' }> =>
          e.id === row.eventId && e.kind === 'investment',
      )
      if (ev && isEventActive(ev, m)) {
        const poolCap = Math.max(0, savingsPool)
        if (m === ev.startMonth && ev.initialAmount > 0) {
          const take = Math.min(ev.initialAmount, poolCap)
          poolFundingToInvestmentsTotal += take
          savingsPool -= take
          row.value += take
          const sh = ev.initialAmount - take
          investmentShortfall += sh
          if (sh > 0) onInvestmentShortfall?.(m, ev.id, sh)
        }
        if (ev.contributionKind === 'recurring') {
          const poolCapR = Math.max(0, savingsPool)
          const take = Math.min(ev.monthlyContribution, poolCapR)
          poolFundingToInvestmentsTotal += take
          savingsPool -= take
          row.value += take
          const sh = ev.monthlyContribution - take
          investmentShortfall += sh
          if (sh > 1e-12) {
            investmentShortfallByEvent[ev.id] = (investmentShortfallByEvent[ev.id] ?? 0) + sh
          }
          if (sh > 0) onInvestmentShortfall?.(m, ev.id, sh)
        }
      }
      const annualReturn = ev?.expectedAnnualReturn ?? row.annualReturn
      const mr = monthlyRateFromAnnual(annualReturn + marketModifier)
      const beforeReturn = row.value
      row.value *= 1 + mr
      mergeLedger(ledger, row.eventId, row.value - beforeReturn)
    }

    // —— Physical assets ——
    for (const p of physical) {
      const mr = monthlyRateFromAnnual(p.annualRate)
      const v0 = p.currentValue
      p.currentValue *= 1 + mr
      const srcId = p.id.endsWith('-asset') ? p.id.slice(0, -'-asset'.length) : p.id
      mergeLedger(ledger, srcId, p.currentValue - v0)
    }

    // —— Amortize loans (installment source can be expenses or reserve) ——
    for (let i = 0; i < loans.length; i++) {
      const loan = loans[i]!
      if (loan.balance <= 0 || loan.termMonthsRemaining <= 0) continue
      if (m < loan.firstPaymentMonth) continue
      const scheduled = loanScheduledPaymentById.get(loan.id) ?? loan.monthlyPayment
      const pay = Math.min(scheduled, loan.balance + loan.balance * (loan.annualApr / 12))
      const bal0 = loan.balance
      const step = amortizationStep(loan.balance, loan.annualApr, pay)
      loan.balance = step.endingBalance
      loan.termMonthsRemaining -= 1
      const principalPaid = bal0 - loan.balance
      const srcId = loan.id.endsWith('-loan') ? loan.id.slice(0, -'-loan'.length) : loan.id
      mergeLedger(ledger, srcId, principalPaid)
    }

    const investmentAssetsByEventId = Object.fromEntries(
      investments.map((r) => [r.eventId, r.value] as const),
    )
    const investmentAssets = investments.reduce((s, r) => s + r.value, 0)
    const physicalAssets = physical.reduce((s, p) => s + p.currentValue, 0)
    const totalLiabilities = loans.reduce((s, l) => s + l.balance, 0)
    const totalAssets = liquid + savingsPool + investmentAssets + physicalAssets
    const netWorth = totalAssets - totalLiabilities
    const realNw = netWorth / cumulativeInflation

    const assetBreakdown = [
      { kind: 'liquid' as const, value: liquid },
      { kind: 'savingsPool' as const, value: savingsPool },
      { kind: 'investments' as const, value: investmentAssets },
      { kind: 'physical' as const, value: physicalAssets },
    ].filter((x, i) => Math.abs(x.value) > 0.01 || i === 0)

    const prevNetWorth =
      m === 0 ? opts.initialLiquid + opts.initialSavingsPool : snapshots[m - 1]!.netWorth
    const deltaNw = netWorth - prevNetWorth
    const ledgerSum = [...ledger.values()].reduce((a, b) => a + b, 0)
    const residual = deltaNw - ledgerSum
    if (Math.abs(residual) > 1e-3) {
      mergeLedger(ledger, LEDGER_RESIDUAL_EVENT_ID, residual)
    }

    snapshots.push({
      month: m,
      date: addMonths(startDate, m),
      grossIncome,
      netIncome,
      totalExpenses,
      loanPaymentsTotal: loanPaymentTotal,
      monthlySavings,
      poolIncomeDeposit,
      poolWindfallTotal,
      poolAssetDownPaymentsTotal,
      poolDeficitCoverTotal,
      poolLoanPaymentsTotal,
      liquidAssets: liquid,
      savingsPool,
      poolInterestEarned,
      investmentShortfall,
      investmentShortfallByEvent: { ...investmentShortfallByEvent },
      assetDownPaymentShortfallByEvent: { ...assetDownPaymentShortfallByEvent },
      poolFundingToInvestmentsTotal,
      investmentAssetsByEventId,
      investmentAssets,
      physicalAssets,
      totalAssets,
      totalLiabilities,
      netWorth,
      realNetWorth: realNw,
      assetBreakdown,
      activeEvents: activeIds,
      eventMonthContributions: ledgerToContributions(ledger),
    })
  }

  return snapshots
}
