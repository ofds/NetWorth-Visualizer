/** Discriminator for event families — architecture §3 */
export type EventType =
  | 'career'
  | 'asset_liability'
  | 'investment'
  | 'life'
  | 'macro'
  | 'windfall'

export type FinancialEventBase = {
  id: string
  /** Months from simulation start (0 = first month) */
  startMonth: number
  /** Inclusive end month, or `null` if indefinite / open-ended */
  endMonth: number | null
}

/** §3.1 Career — income change */
export type CareerEvent = FinancialEventBase & {
  kind: 'career'
  name: string
  monthlyGrossIncome: number
  /** 0–1 portion of net income allocated to investments */
  savingsRate: number
  /** 0–1 effective tax rate */
  effectiveTaxRate: number
  /** Duration in months; `null` = indefinite */
  durationMonths: number | null
}

/** §3.2 Major asset / liability */
export type AssetLiabilityEvent = FinancialEventBase & {
  kind: 'asset_liability'
  name: string
  mode: 'asset' | 'liability'
  principal: number
  downPayment: number
  /** PRICE (fixed installment) or SAC (decreasing installments). */
  amortizationSystem?: 'price' | 'sac'
  /** Where monthly installments are paid from. */
  installmentSource?: 'expenses' | 'reserve'
  annualApr: number
  termYears: number
  /** If set, overrides amortized payment */
  monthlyPaymentOverride: number | null
  /** Nominal annual appreciation (assets) or depreciation (negative for cars, etc.) */
  annualValueChangeRate: number
}

/** §3.3 Investment */
export type InvestmentContributionKind = 'lump_sum' | 'recurring'

export type InvestmentAssetClass =
  | 'stocks'
  | 'bonds'
  | 'real_estate'
  | 'crypto'
  | 'custom'

export type InvestmentEvent = FinancialEventBase & {
  kind: 'investment'
  name: string
  contributionKind: InvestmentContributionKind
  initialAmount: number
  monthlyContribution: number
  expectedAnnualReturn: number
  assetClass: InvestmentAssetClass
  showVolatilityCone: boolean
  durationYears: number | null
}

/** §3.4 Life impact */
export type LifeImpactKind =
  | 'marriage'
  | 'child'
  | 'retirement'
  | 'education'
  | 'custom'

export type LifeImpactEvent = FinancialEventBase & {
  kind: 'life'
  name: string
  lifeKind: LifeImpactKind
  monthlyExpenseChange: number
  oneTimeCost: number
  durationYears: number | null
  /** 0–100; e.g. retirement may set income to 0% of prior salary */
  incomeImpactPercent: number
}

/** §3.5 Macro environment */
export type MacroEnvironmentEvent = FinancialEventBase & {
  kind: 'macro'
  name: string
  annualInflationRate: number
  /** Added to investment annual returns (e.g. -0.2 for a crash) */
  marketReturnModifierAnnual: number
  /** Environment nominal rate affecting new loans / savings */
  interestRateEnvironmentAnnual: number
  durationYears: number
  severity: number
}

/** One-time cash to the savings pool (reserve) — inheritance, gift, legal settlement, etc. */
export type WindfallEvent = FinancialEventBase & {
  kind: 'windfall'
  name: string
  /** Nominal amount credited to the pool in `startMonth` (same month as placement). */
  amount: number
}

export type FinancialEvent =
  | CareerEvent
  | AssetLiabilityEvent
  | InvestmentEvent
  | LifeImpactEvent
  | MacroEnvironmentEvent
  | WindfallEvent

export function eventTypeFromKind(kind: FinancialEvent['kind']): EventType {
  if (kind === 'asset_liability') return 'asset_liability'
  return kind
}
