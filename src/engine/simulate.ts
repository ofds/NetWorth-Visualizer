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

const DAYS_IN_MONTH: number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Calendar month arithmetic without JS `setMonth` overflow (e.g. Jan 31 + 1 mo → March).
 * Clips the day to the last day of the target month when needed (Jan 31 + 1 → Feb 28/29).
 * Optimized to a single `Date` allocation via integer month math + a leap-year table
 * (the previous implementation allocated 3 Dates per call; this is a hot path —
 * `simulate` calls it once per month).
 */
export function addMonths(start: Date, months: number): Date {
  const totalMonthIndex = start.getFullYear() * 12 + start.getMonth() + months
  const year = Math.floor(totalMonthIndex / 12)
  const monthIndex = ((totalMonthIndex % 12) + 12) % 12
  let lastDay = DAYS_IN_MONTH[monthIndex]!
  if (monthIndex === 1 && isLeapYear(year)) lastDay = 29
  const day = start.getDate()
  return new Date(year, monthIndex, Math.min(day, lastDay))
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
 *
 * `careerEff` may be passed precomputed (e.g. once per ruler render) to avoid
 * re-sorting the career list for every event — the previous implementation paid
 * O(events × careers × log careers) per ruler draw.
 */
export function eventTimelineSegment(
  e: FinancialEvent,
  allEvents: FinancialEvent[],
  horizonMonths: number,
  careerEff?: Map<string, number | null>,
): { start: number; end: number } {
  const xMax = Math.max(0, horizonMonths - 1)
  const effMap = careerEff ?? computeCareerEffectiveEndById(allEvents)

  let end: number
  if (e.kind === 'career') {
    const eff = effMap.get(e.id)
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

const INFINITE = Number.POSITIVE_INFINITY

/**
 * Simulation call counter for benchmark harnesses (browser or node). `calls` counts
 * `simulate` invocations, `months` accumulates simulated months. Two integer adds per
 * call — negligible; read via `window.__NWV_SIM_STATS__` on the dev server.
 */
export const simulationStats = {
  calls: 0,
  months: 0,
}

type LifeImpactEventLike = Extract<FinancialEvent, { kind: 'life' }>
type MacroEventLike = Extract<FinancialEvent, { kind: 'macro' }>
type CareerEventLike = Extract<FinancialEvent, { kind: 'career' }>
type InvestmentEventLike = Extract<FinancialEvent, { kind: 'investment' }>

/**
 * Immutable plan compiled once per `simulate` call. Replaces the previous
 * per-month O(events) scans:
 *
 *  - `additionsByMonth` / `removalsByMonth`: indexed activation/deactivation
 *    schedules (previously the loop re-filtered the full event list every month);
 *  - `investmentRows`: pre-built in engine order with the source event attached
 *    (previously every investment did a linear `sorted.find` every month);
 *  - `careerEff`, `macroIntervals`, life segments: activation schedules so the
 *    monthly body only touches what actually changed.
 *
 * All numeric behavior is preserved exactly (same operations, same order).
 */
type SimulationPlan = {
  /** Active-schedule (start ≤ m ≤ effectiveEnd): added/removed from the incremental active lists. */
  additionsByMonth: Map<number, FinancialEvent[]>
  removalsByMonth: Map<number, FinancialEvent[]>
  /** Start-month activations that are NOT activity-gated (matches the reference's `sorted` scans):
   * investment rows, liability loans, zero-down-payment assets. */
  startMonthActivationsByMonth: Map<number, FinancialEvent[]>
  investmentRows: (InvestmentRow & { ev: InvestmentEventLike })[]
  /** StartMonth-indexed events, for windfall / down-payment processing (previously a full scan). */
  windfallsByMonth: Map<number, Extract<FinancialEvent, { kind: 'windfall' }>[]>
  assetDownPaymentsByMonth: Map<number, Extract<FinancialEvent, { kind: 'asset_liability' }>[]>
  /** Active (start ≤ m ≤ effectiveEnd) event ids in engine order, maintained incrementally. */
  active: FinancialEvent[]
  activeLife: LifeImpactEventLike[]
  activeMacros: MacroEventLike[]
  activeCareers: CareerEventLike[]
  /** Per-investment growth multiplier cache: index by market modifier bucket. */
  investmentMultiplierCache: Map<number, Float64Array>
  /** Per-physical-asset fixed growth multiplier (rate is invariant per asset). */
  physicalMultipliers: number[]
}

function compileSimulationPlan(events: FinancialEvent[], months: number): SimulationPlan {
  const sorted = sortEventsForSimulation(events)
  const careerEff = computeCareerEffectiveEndById(events)

  const additionsByMonth = new Map<number, FinancialEvent[]>()
  const removalsByMonth = new Map<number, FinancialEvent[]>()
  const startMonthActivationsByMonth = new Map<number, FinancialEvent[]>()
  const windfallsByMonth = new Map<number, Extract<FinancialEvent, { kind: 'windfall' }>[]>()
  const assetDownPaymentsByMonth = new Map<
    number,
    Extract<FinancialEvent, { kind: 'asset_liability' }>[]
  >()
  const investmentRows: (InvestmentRow & { ev: InvestmentEventLike })[] = []

  // The reference resolves each row's funding event with `sorted.find(e => e.id === row.eventId
  // && e.kind === 'investment')`, which returns the FIRST investment with that id. Replicate
  // that exactly with an O(1) index (duplicate ids are impossible via the UI, but persisted
  // state could contain them and the reference defines their behavior).
  const firstInvestmentById = new Map<string, InvestmentEventLike>()
  for (const e of sorted) {
    if (e.kind === 'investment' && !firstInvestmentById.has(e.id)) {
      firstInvestmentById.set(e.id, e)
    }
  }

  const pushMap = <T>(map: Map<number, T[]>, key: number, value: T) => {
    let list = map.get(key)
    if (!list) {
      list = []
      map.set(key, list)
    }
    list.push(value)
  }

  for (const e of sorted) {
    if (e.startMonth >= months) continue

    // —— Activations that run on `startMonth` regardless of activity window (mirrors the
    // reference's three `sorted` scans: rows, windfalls, down payments). ——
    if (e.kind === 'investment') {
      const ev = firstInvestmentById.get(e.id) ?? e
      investmentRows.push({
        id: e.id,
        eventId: e.id,
        ev,
        value: 0,
        annualReturn: ev.expectedAnnualReturn,
        monthlyContribution: ev.contributionKind === 'recurring' ? ev.monthlyContribution : 0,
      })
    } else if (e.kind === 'windfall') {
      pushMap(windfallsByMonth, e.startMonth, e)
    } else if (e.kind === 'asset_liability' && e.mode === 'asset') {
      const downPaymentNominal = Math.min(Math.max(0, e.downPayment), Math.max(0, e.principal))
      if (downPaymentNominal > 0) {
        pushMap(assetDownPaymentsByMonth, e.startMonth, e)
      } else {
        pushMap(startMonthActivationsByMonth, e.startMonth, e)
      }
    } else if (e.kind === 'asset_liability' && e.mode === 'liability') {
      pushMap(startMonthActivationsByMonth, e.startMonth, e)
    }

    // —— Active-schedule (start ≤ m ≤ effectiveEnd). Events that can never be active
    // (e.g. end before start) never join the active lists, matching
    // `isEventActiveForSimulation` (month < startMonth → false). ——
    let effEnd: number
    if (e.kind === 'career') {
      const eff = careerEff.get(e.id)
      effEnd = eff === null || eff === undefined ? INFINITE : eff
    } else {
      effEnd = e.endMonth === null ? INFINITE : e.endMonth
    }
    if (effEnd < e.startMonth) continue

    pushMap(additionsByMonth, e.startMonth, e)
    if (effEnd < months - 1) {
      // Deactivation happens the month AFTER the effective end (inclusive end).
      pushMap(removalsByMonth, effEnd + 1, e)
    }
  }

  return {
    additionsByMonth,
    removalsByMonth,
    startMonthActivationsByMonth,
    investmentRows,
    windfallsByMonth,
    assetDownPaymentsByMonth,
    active: [],
    activeLife: [],
    activeMacros: [],
    activeCareers: [],
    investmentMultiplierCache: new Map<number, Float64Array>(),
    physicalMultipliers: [],
  }
}

function removeFromList<T>(list: T[], value: T): void {
  const idx = list.indexOf(value)
  if (idx >= 0) list.splice(idx, 1)
}

export function simulate(
  events: FinancialEvent[],
  startDate: Date,
  months: number,
  options: SimulateRunOptions = {},
): MonthSnapshot[] {
  simulationStats.calls += 1
  simulationStats.months += months
  const { onInvestmentShortfall, onAssetDownPaymentShortfall, ...optsRest } = options
  const opts: SimulateOptions = { ...DEFAULT_SIMULATE_OPTIONS, ...optsRest }
  const plan = compileSimulationPlan(events, months)

  let liquid = opts.initialLiquid
  let savingsPool = opts.initialSavingsPool
  const loans: LoanState[] = []
  const physical: PhysicalAssetState[] = []
  const {
    additionsByMonth,
    removalsByMonth,
    startMonthActivationsByMonth,
    investmentRows,
    windfallsByMonth,
    assetDownPaymentsByMonth,
    active,
    activeLife,
    activeMacros,
    activeCareers,
    investmentMultiplierCache,
    physicalMultipliers,
  } = plan

  let cumulativeInflation = 1
  const snapshots: MonthSnapshot[] = []
  let currentMarketModifier = Number.NaN // sentinel: never equal to any real modifier
  let currentMultipliers: Float64Array | null = null
  let lifeExpenseExtra = 0
  let incomeMultiplier = 1
  /** Rows activated so far (reference builds `investments` incrementally at startMonth). */
  let visibleRowCount = 0

  for (let m = 0; m < months; m++) {
    const ledger = new Map<string, number>()

    // —— Activity boundaries for month m (removals first; additions at startMonth) ——
    let lifeChanged = false
    const removals = removalsByMonth.get(m)
    if (removals) {
      for (const e of removals) {
        if (e.kind === 'life') lifeChanged = true
        removeFromList(active, e)
        if (e.kind === 'life') removeFromList(activeLife, e)
        else if (e.kind === 'macro') removeFromList(activeMacros, e)
        else if (e.kind === 'career') removeFromList(activeCareers, e)
      }
    }
    const additions = additionsByMonth.get(m)
    if (additions) {
      for (const e of additions) {
        if (e.kind === 'life') lifeChanged = true
        active.push(e)
        if (e.kind === 'life') activeLife.push(e)
        else if (e.kind === 'macro') activeMacros.push(e)
        else if (e.kind === 'career') activeCareers.push(e)
      }
    }
    // Life running sums only change at boundaries; recompute exactly like the
    // reference (same iteration order) so the product/sum are bit-identical.
    if (lifeChanged) {
      lifeExpenseExtra = 0
      incomeMultiplier = 1
      for (const e of activeLife) {
        lifeExpenseExtra += e.monthlyExpenseChange
        incomeMultiplier *= e.incomeImpactPercent / 100
      }
    }

    // —— Activations at start of month m (investment rows + liability-only loans) ——
    // Investments rows are pre-built in the plan; liability loans and zero-down-payment
    // assets activate here (NOT activity-gated, matching the reference's `sorted` scan).
    let poolAssetDownPaymentsTotal = 0
    const startMonthActivations = startMonthActivationsByMonth.get(m)
    if (startMonthActivations) {
      for (const e of startMonthActivations) {
        if (e.kind === 'investment') {
          continue
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
          physicalMultipliers.push(monthlyRateFromAnnual(e.annualValueChangeRate) + 1)
        }
      }
    }

    // —— Macro (most recently started active macro wins) ——
    const macro = activeMacros[activeMacros.length - 1]
    const annualInflation = macro?.annualInflationRate ?? opts.defaultAnnualInflation
    const marketModifier = macro?.marketReturnModifierAnnual ?? 0
    const currentPoolRate =
      macro?.interestRateEnvironmentAnnual ?? DEFAULT_POOL_YIELD_ANNUAL_WITHOUT_MACRO

    const monthlyInfl = monthlyRateFromAnnual(annualInflation)
    cumulativeInflation *= 1 + monthlyInfl

    // —— Career (single segment per month; latest start among chain-active careers wins) ——
    const career = activeCareers[activeCareers.length - 1]
    const grossIncomeBase = career?.monthlyGrossIncome ?? 0
    const taxRate = career?.effectiveTaxRate ?? 0
    const savingsRate = career?.savingsRate ?? 0

    // —— Life: expenses + income scale + one-time ——
    for (const e of activeLife) {
      if (e.startMonth === m && e.oneTimeCost !== 0) {
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

    for (const e of activeLife) {
      if (e.monthlyExpenseChange !== 0) {
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
    const windfalls = windfallsByMonth.get(m)
    if (windfalls) {
      for (const e of windfalls) {
        const amt = Math.max(0, e.amount)
        if (amt <= 0) continue
        savingsPool += amt
        poolWindfallTotal += amt
        mergeLedger(ledger, e.id, amt)
      }
    }

    // —— Asset down payment (>0): after this month’s surplus → pool (same month’s income is
    // available before debiting reserve). Down payment 0 is handled at month start so the loan
    // exists before scheduled-payment math for month m.
    const assetDownPayments = assetDownPaymentsByMonth.get(m)
    if (assetDownPayments) {
      for (const e of assetDownPayments) {
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
        physicalMultipliers.push(monthlyRateFromAnnual(e.annualValueChangeRate) + 1)
      }
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
    // Growth multipliers are cached per market-modifier value; the modifier only
    // changes when the active macro changes (few per scenario), so `Math.pow` runs
    // once per row per macro regime instead of once per row per month. The cached
    // value is the same double the reference computes every month.
    while (visibleRowCount < investmentRows.length && investmentRows[visibleRowCount]!.ev.startMonth <= m) {
      visibleRowCount += 1
    }
    if (currentMarketModifier !== marketModifier) {
      currentMarketModifier = marketModifier
      currentMultipliers = investmentMultiplierCache.get(marketModifier) ?? null
      if (!currentMultipliers) {
        currentMultipliers = new Float64Array(investmentRows.length)
        for (let i = 0; i < investmentRows.length; i++) {
          const row = investmentRows[i]!
          currentMultipliers[i] = monthlyRateFromAnnual(
            row.annualReturn + marketModifier,
          ) + 1
        }
        investmentMultiplierCache.set(marketModifier, currentMultipliers)
      }
    }
    let poolFundingToInvestmentsTotal = 0
    for (let i = 0; i < investmentRows.length; i++) {
      const row = investmentRows[i]!
      const ev = row.ev
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
      const multiplier = currentMultipliers![i]!
      const beforeReturn = row.value
      row.value *= multiplier
      mergeLedger(ledger, row.eventId, row.value - beforeReturn)
    }

    // —— Physical assets ——
    for (let i = 0; i < physical.length; i++) {
      const p = physical[i]!
      const v0 = p.currentValue
      p.currentValue *= physicalMultipliers[i]!
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

    const investmentAssetsByEventId: Record<string, number> = {}
    let investmentAssets = 0
    for (let i = 0; i < visibleRowCount; i++) {
      const r = investmentRows[i]!
      investmentAssetsByEventId[r.eventId] = r.value
      investmentAssets += r.value
    }
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
    let ledgerSum = 0
    for (const v of ledger.values()) ledgerSum += v
    const residual = deltaNw - ledgerSum
    if (Math.abs(residual) > 1e-3) {
      mergeLedger(ledger, LEDGER_RESIDUAL_EVENT_ID, residual)
    }

    const activeIds = new Array<string>(active.length)
    for (let i = 0; i < active.length; i++) activeIds[i] = active[i]!.id

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
