import i18n from '../i18n'
import type {
  AssetLiabilityEvent,
  CareerEvent,
  FinancialEvent,
  InvestmentEvent,
  LifeImpactEvent,
  MacroEnvironmentEvent,
} from './types'

/** i18n keys used for default event names (see `en.json` / `pt-BR.json` `defaults`). */
export const DEFAULT_EVENT_NAME_KEY: Record<FinancialEvent['kind'], string> = {
  career: 'defaults.career',
  asset_liability: 'defaults.asset',
  investment: 'defaults.investment',
  life: 'defaults.life',
  macro: 'defaults.macro',
}

export function defaultEventNameI18nKey(kind: FinancialEvent['kind']): string {
  return DEFAULT_EVENT_NAME_KEY[kind]
}

let idCounter = 0
export function nextEventId(prefix = 'evt'): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

export function createDefaultCareerEvent(startMonth = 0): CareerEvent {
  return {
    kind: 'career',
    id: nextEventId('career'),
    startMonth,
    endMonth: null,
    name: i18n.t(DEFAULT_EVENT_NAME_KEY.career),
    monthlyGrossIncome: 8000,
    savingsRate: 0.15,
    effectiveTaxRate: 0.22,
    durationMonths: null,
  }
}

export function createDefaultAssetLiabilityEvent(startMonth = 0): AssetLiabilityEvent {
  return {
    kind: 'asset_liability',
    id: nextEventId('home'),
    startMonth,
    endMonth: null,
    name: i18n.t(DEFAULT_EVENT_NAME_KEY.asset_liability),
    mode: 'asset',
    principal: 400_000,
    downPayment: 80_000,
    amortizationSystem: 'price',
    installmentSource: 'expenses',
    annualApr: 0.065,
    termYears: 30,
    monthlyPaymentOverride: null,
    annualValueChangeRate: 0.03,
  }
}

export function createDefaultInvestmentEvent(startMonth = 0): InvestmentEvent {
  return {
    kind: 'investment',
    id: nextEventId('inv'),
    startMonth,
    endMonth: null,
    name: i18n.t(DEFAULT_EVENT_NAME_KEY.investment),
    contributionKind: 'recurring',
    initialAmount: 0,
    monthlyContribution: 500,
    expectedAnnualReturn: 0.07,
    assetClass: 'stocks',
    showVolatilityCone: false,
    durationYears: null,
  }
}

export function createDefaultLifeEvent(startMonth = 0): LifeImpactEvent {
  return {
    kind: 'life',
    id: nextEventId('life'),
    startMonth,
    endMonth: null,
    name: i18n.t(DEFAULT_EVENT_NAME_KEY.life),
    lifeKind: 'custom',
    monthlyExpenseChange: 0,
    oneTimeCost: 0,
    durationYears: null,
    incomeImpactPercent: 100,
  }
}

export function createDefaultMacroEvent(startMonth = 0): MacroEnvironmentEvent {
  return {
    kind: 'macro',
    id: nextEventId('macro'),
    startMonth,
    endMonth: startMonth + 12 * 3 - 1,
    name: i18n.t(DEFAULT_EVENT_NAME_KEY.macro),
    annualInflationRate: 0.04,
    marketReturnModifierAnnual: 0,
    interestRateEnvironmentAnnual: 0.05,
    durationYears: 3,
    severity: 5,
  }
}

export function createDefaultEventForType(
  type: FinancialEvent['kind'],
  startMonth = 0,
): FinancialEvent {
  switch (type) {
    case 'career':
      return createDefaultCareerEvent(startMonth)
    case 'asset_liability':
      return createDefaultAssetLiabilityEvent(startMonth)
    case 'investment':
      return createDefaultInvestmentEvent(startMonth)
    case 'life':
      return createDefaultLifeEvent(startMonth)
    case 'macro':
      return createDefaultMacroEvent(startMonth)
  }
}
