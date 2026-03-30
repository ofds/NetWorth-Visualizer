/** Synthetic id for ΔNW not attributed to a user event (base spend, savings cap, rounding). */
export const LEDGER_RESIDUAL_EVENT_ID = '__residual__'

export type AssetBreakdownSliceKind = 'liquid' | 'savingsPool' | 'investments' | 'physical'

export type AssetBreakdownRow = {
  kind: AssetBreakdownSliceKind
  value: number
}

export type EventMonthContribution = {
  eventId: string
  /** Signed nominal USD impact this month (see simulate ledger rules + residual). */
  amount: number
}

/** Month-level projection row — architecture §5.2 */
export type MonthSnapshot = {
  month: number
  date: Date
  grossIncome: number
  netIncome: number
  totalExpenses: number
  /** Nominal sum of loan payments this month (included in totalExpenses; reduces surplus before reserve deposit). */
  loanPaymentsTotal: number
  monthlySavings: number
  /** Nominal amount added to the savings pool from income this month (min(monthlySavings, saveCap)); 0 if deficit. */
  poolIncomeDeposit: number
  /** Nominal pool debits from asset purchases activated this month (`downPayment`). */
  poolAssetDownPaymentsTotal: number
  /** Nominal amount drawn from the pool to cover a monthly cash-flow deficit (before interest). */
  poolDeficitCoverTotal: number
  /** Nominal amount of loan installments paid directly from reserve this month. */
  poolLoanPaymentsTotal: number
  liquidAssets: number
  savingsPool: number
  poolInterestEarned: number
  investmentShortfall: number
  /** Nominal shortfall per investment event id (sums to investmentShortfall). */
  investmentShortfallByEvent: Record<string, number>
  /** Nominal down-payment shortfall per asset event id (when DP exceeds reserve at activation). */
  assetDownPaymentShortfallByEvent: Record<string, number>
  /** Total pool debits used to fund investments this month (initial + recurring takes). */
  poolFundingToInvestmentsTotal: number
  /** Nominal investment balance per investment event id (sums to `investmentAssets`). */
  investmentAssetsByEventId: Record<string, number>
  investmentAssets: number
  physicalAssets: number
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  realNetWorth: number
  /** Stacked asset slices for diagnostics / future UI; labels are semantic kinds, not translated copy. */
  assetBreakdown: AssetBreakdownRow[]
  activeEvents: string[]
  /** Per-event signed nominal flows/impacts; sorted by |amount| then id. Includes `LEDGER_RESIDUAL_EVENT_ID` when needed. */
  eventMonthContributions: EventMonthContribution[]
}

export type Milestone = {
  id: string
  /** Primary sort key: nominal crossing month, or real if nominal missing. */
  month: number
  value: number
  /** Legacy single date (nominal crossing when present). */
  achievedAt: Date
  nominalMonth: number | null
  realMonth: number | null
  achievedAtNominal: Date | null
  achievedAtReal: Date | null
}

/** Single loan balance tracked inside the monthly loop — architecture §5.3 */
export type LoanState = {
  id: string
  eventId: string
  balance: number
  initialPrincipal: number
  annualApr: number
  amortizationSystem: 'price' | 'sac'
  installmentSource: 'expenses' | 'reserve'
  firstPaymentMonth: number
  originalTermMonths: number
  termMonthsRemaining: number
  monthlyPayment: number
}

export type InvestmentHoldingState = {
  id: string
  value: number
  annualReturn: number
  monthlyContribution: number
}

export type PhysicalAssetState = {
  id: string
  currentValue: number
  annualRate: number
}

/** Mutable accumulator used by `simulate` (Stage 2+) */
export type SimulationRuntimeState = {
  activeIncome: number
  effectiveTaxRate: number
  baseExpenses: number
  savingsRate: number
  liquidAssets: number
  savingsPool: number
  activeLoans: LoanState[]
  activeInvestments: InvestmentHoldingState[]
  physicalAssets: PhysicalAssetState[]
  activeEventIds: string[]
}
