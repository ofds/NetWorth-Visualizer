import type { TFunction } from 'i18next'
import type { MonthSnapshot } from '../../engine/types'
import { LEDGER_RESIDUAL_EVENT_ID } from '../../engine/types'
import { pickYValue, scaledSavingsPool, snapshotInflationScale } from '../../engine/snapshotDisplay'
import type { FinancialEvent } from '../../events/types'
import { eventColorFor } from '../../utils/colors'

export function axisMoney(v: number, translate: TFunction): string {
  const a = Math.abs(v)
  if (a >= 1_000_000)
    return translate('graph.axisMillions', { n: (v / 1_000_000).toFixed(1) })
  if (a >= 1_000) return translate('graph.axisThousands', { n: (v / 1_000).toFixed(0) })
  return translate('graph.axisPlain', { n: v.toFixed(0) })
}

export function kindShortLabel(kind: FinancialEvent['kind'], translate: TFunction): string {
  switch (kind) {
    case 'career':
      return translate('kind.career')
    case 'investment':
      return translate('kind.investment')
    case 'life':
      return translate('kind.life')
    case 'macro':
      return translate('kind.macro')
    case 'windfall':
      return translate('kind.windfall')
    case 'asset_liability':
      return translate('kind.assetLiability')
  }
}

export type ActiveEventRow = {
  id: string
  name: string
  kind: string
  color: string
  /** True when this event’s `startMonth` equals the tooltip month index. */
  startsThisMonth: boolean
}

export function activeRowsForSnapshot(
  snapshot: MonthSnapshot,
  monthIndex: number,
  eventList: FinancialEvent[],
  translate: TFunction,
): ActiveEventRow[] {
  const byId = new Map(eventList.map((e) => [e.id, e]))
  const rows: ActiveEventRow[] = []
  for (const id of snapshot.activeEvents) {
    const e = byId.get(id)
    if (!e) continue
    rows.push({
      id,
      name: e.name,
      kind: kindShortLabel(e.kind, translate),
      color: eventColorFor(e),
      startsThisMonth: e.startMonth === monthIndex,
    })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return rows
}

export type ContributionRow = {
  eventId: string
  name: string
  kind: string
  color: string
  /** This month’s attributed $ (display). */
  amount: number
  /** Change vs same line’s attributed $ in the prior month; null for month 0. */
  deltaVsPriorMonth: number | null
}

/** Loan balances in display $ (same scale as hover `liabilities`). */
export function totalLiabilitiesDisplay(s: MonthSnapshot, useReal: boolean): number {
  return s.totalLiabilities * snapshotInflationScale(s, useReal)
}

/** Keys for reserve in/out lines in the graph tooltip (display $). */
export type PoolFlowLineKey =
  | 'interest'
  | 'incomeDeposit'
  | 'windfall'
  | 'fundingInvestments'
  | 'assetDownPayment'
  | 'loanPayments'
  | 'deficitCover'

export type PoolFlowLine = { kind: 'in' | 'out'; lineKey: PoolFlowLineKey; amount: number }

export const POOL_FLOW_LINE_I18N: Record<PoolFlowLineKey, string> = {
  interest: 'graph.poolFlowInterest',
  incomeDeposit: 'graph.poolFlowIncomeDeposit',
  windfall: 'graph.poolFlowWindfall',
  fundingInvestments: 'graph.poolFlowFundingInvestments',
  assetDownPayment: 'graph.poolFlowAssetDownPayment',
  loanPayments: 'graph.poolFlowLoanPayments',
  deficitCover: 'graph.poolFlowDeficitCover',
}

const POOL_FLOW_IN_ORDER: PoolFlowLineKey[] = ['interest', 'incomeDeposit', 'windfall']
const POOL_FLOW_OUT_ORDER: PoolFlowLineKey[] = [
  'fundingInvestments',
  'assetDownPayment',
  'loanPayments',
  'deficitCover',
]

export function sortPoolFlowLines(lines: PoolFlowLine[]): PoolFlowLine[] {
  const rank = (k: PoolFlowLineKey, kind: 'in' | 'out') => {
    const ord = kind === 'in' ? POOL_FLOW_IN_ORDER : POOL_FLOW_OUT_ORDER
    const i = ord.indexOf(k)
    return i === -1 ? 999 : i
  }
  return [...lines].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'in' ? -1 : 1
    return rank(a.lineKey, a.kind) - rank(b.lineKey, b.kind)
  })
}

export type GraphHoverState = {
  month: number
  netWorth: number
  /** vs prior month (same real/nominal mode); null for month 0. */
  netWorthDelta: number | null
  /** This month’s ΔNW minus last month’s ΔNW; null when month index is 0 or 1. */
  netWorthDeltaVarianceVsPrior: number | null
  /** Loan balances (display $); net worth = gross assets − liabilities. */
  liabilities: number
  liquid: number
  savingsPool: number
  /** vs prior month’s ending pool (display $); null for month 0. */
  savingsPoolDeltaVsPrior: number | null
  /** Non-zero reserve flows for the expanded breakdown (display $). */
  poolFlowLines: PoolFlowLine[]
  /** Portion of this month’s pool income deposit not consumed by investment pulls (≥0; excess pulls use saved pool). Excludes pool interest. */
  poolNetAfterInvestmentFunding: number
  investmentShortfall: number
  investment: number
  physical: number
  activeRows: ActiveEventRow[]
  contributionRows: ContributionRow[]
}

export function hoverStateForMonth(
  series: MonthSnapshot[],
  monthIndex: number,
  eventList: FinancialEvent[],
  useReal: boolean,
  translate: TFunction,
): GraphHoverState | null {
  if (series.length === 0) return null
  const i = Math.min(Math.max(0, monthIndex), series.length - 1)
  const s = series[i]!
  const nw = pickYValue(s, useReal)
  const prevNw = i > 0 ? pickYValue(series[i - 1]!, useReal) : null
  const netWorthDelta = prevNw !== null ? nw - prevNw : null
  const priorMonthNetWorthDelta =
    i >= 2 ? pickYValue(series[i - 1]!, useReal) - pickYValue(series[i - 2]!, useReal) : null
  const netWorthDeltaVarianceVsPrior =
    netWorthDelta !== null && priorMonthNetWorthDelta !== null
      ? netWorthDelta - priorMonthNetWorthDelta
      : null
  const k = snapshotInflationScale(s, useReal)
  const byId = new Map(eventList.map((e) => [e.id, e]))
  const prevS = i > 0 ? series[i - 1]! : null
  const prevK = prevS ? snapshotInflationScale(prevS, useReal) : 1
  const prevAmtById = new Map<string, number>()
  if (prevS) {
    for (const c of prevS.eventMonthContributions) {
      prevAmtById.set(c.eventId, c.amount * prevK)
    }
  }
  const contributionRows: ContributionRow[] = s.eventMonthContributions
    .map((c) => {
      const amount = c.amount * k
      const prevAmt = prevAmtById.get(c.eventId) ?? 0
      const deltaVsPriorMonth = i === 0 ? null : amount - prevAmt
      if (c.eventId === LEDGER_RESIDUAL_EVENT_ID) {
        return {
          eventId: c.eventId,
          name: translate('graph.ledgerResidual'),
          kind: '',
          color: '#64748b',
          amount,
          deltaVsPriorMonth,
        }
      }
      const e = byId.get(c.eventId)
      if (!e) {
        return {
          eventId: c.eventId,
          name: c.eventId,
          kind: '',
          color: '#64748b',
          amount,
          deltaVsPriorMonth,
        }
      }
      return {
        eventId: c.eventId,
        name: e.name,
        kind: kindShortLabel(e.kind, translate),
        color: eventColorFor(e),
        amount,
        deltaVsPriorMonth,
      }
    })
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))

  const poolScaled = scaledSavingsPool(s, useReal)
  const prevPoolScaled = i > 0 ? scaledSavingsPool(series[i - 1]!, useReal) : null
  const savingsPoolDeltaVsPrior = prevPoolScaled !== null ? poolScaled - prevPoolScaled : null

  const eps = 1e-6
  const poolFlowLines: PoolFlowLine[] = []
  const addIn = (lineKey: PoolFlowLineKey, amt: number) => {
    if (amt > eps) poolFlowLines.push({ kind: 'in', lineKey, amount: amt })
  }
  const addOut = (lineKey: PoolFlowLineKey, amt: number) => {
    if (amt > eps) poolFlowLines.push({ kind: 'out', lineKey, amount: amt })
  }
  addIn('interest', s.poolInterestEarned * k)
  addIn('incomeDeposit', s.poolIncomeDeposit * k)
  addIn('windfall', s.poolWindfallTotal * k)
  addOut('fundingInvestments', s.poolFundingToInvestmentsTotal * k)
  addOut('assetDownPayment', s.poolAssetDownPaymentsTotal * k)
  addOut('loanPayments', s.poolLoanPaymentsTotal * k)
  addOut('deficitCover', s.poolDeficitCoverTotal * k)

  return {
    month: i,
    netWorth: nw,
    netWorthDelta,
    netWorthDeltaVarianceVsPrior,
    liabilities: totalLiabilitiesDisplay(s, useReal),
    liquid: s.liquidAssets * k,
    savingsPool: poolScaled,
    savingsPoolDeltaVsPrior,
    poolFlowLines: sortPoolFlowLines(poolFlowLines),
    /** Same as EventForm: cannot go negative — excess funding came from pool balance, not “missing” income. */
    poolNetAfterInvestmentFunding:
      Math.max(0, s.poolIncomeDeposit - s.poolFundingToInvestmentsTotal) * k,
    investmentShortfall: s.investmentShortfall,
    investment: s.investmentAssets * k,
    physical: s.physicalAssets * k,
    activeRows: activeRowsForSnapshot(s, i, eventList, translate),
    contributionRows,
  }
}

/** Unscaled gross asset slices (display $) — stack sum = total assets before subtracting liabilities. */
export function assetSlicesGross(s: MonthSnapshot, useReal: boolean) {
  const k = snapshotInflationScale(s, useReal)
  return {
    cash: s.liquidAssets * k,
    pool: scaledSavingsPool(s, useReal),
    inv: s.investmentAssets * k,
    phys: s.physicalAssets * k,
  }
}

export function totalGrossAssetsDisplay(s: MonthSnapshot, useReal: boolean): number {
  const g = assetSlicesGross(s, useReal)
  return g.cash + g.pool + g.inv + g.phys
}

/**
 * Display-$ slices that stack to the net worth curve: same mix as cash / pool / investments / physical,
 * scaled so the stacked total matches pickYValue (e.g. after liabilities in nominal terms).
 */
export function assetSlicesScaledToNetWorth(s: MonthSnapshot, useReal: boolean) {
  const target = pickYValue(s, useReal)
  const k = snapshotInflationScale(s, useReal)
  const cash = s.liquidAssets * k
  const pool = scaledSavingsPool(s, useReal)
  const inv = s.investmentAssets * k
  const phys = s.physicalAssets * k
  const sumv = cash + pool + inv + phys
  if (target <= 0 || sumv <= 1e-9 || cash < -1e-9 || inv < -1e-9 || phys < -1e-9) {
    return { cash: 0, pool: 0, inv: 0, phys: 0 }
  }
  const f = target / sumv
  return { cash: cash * f, pool: pool * f, inv: inv * f, phys: phys * f }
}

/** Prefix for per-investment keys in the asset stack (`splitInv` mode). */
export const ASSET_STACK_INV_PREFIX = 'i:'

export function investmentIdsOrderedForAssetStack(
  snapshots: MonthSnapshot[],
  eventList: FinancialEvent[],
): string[] {
  const invEvents = eventList.filter(
    (e): e is Extract<FinancialEvent, { kind: 'investment' }> => e.kind === 'investment',
  )
  const strength = new Map<string, number>()
  for (const s of snapshots) {
    const by = s.investmentAssetsByEventId
    for (const ev of invEvents) {
      const v = Math.abs(by[ev.id] ?? 0)
      strength.set(ev.id, (strength.get(ev.id) ?? 0) + v)
    }
  }
  return invEvents
    .map((e) => e.id)
    .filter((id) => (strength.get(id) ?? 0) > 1e-9)
    .sort((a, b) => (strength.get(b)! - strength.get(a)!) || a.localeCompare(b))
}

export function assetStackRowKeys(splitInv: boolean, invIds: string[]): string[] {
  const base = ['cash', 'poolPos', 'poolNeg'] as const
  if (splitInv && invIds.length > 0) {
    return [...base, ...invIds.map((id) => `${ASSET_STACK_INV_PREFIX}${id}`), 'phys']
  }
  return [...base, 'inv', 'phys']
}

export function buildAssetStackRowsForChart(
  snapshots: MonthSnapshot[],
  useReal: boolean,
  splitInv: boolean,
  invIds: string[],
): Record<string, number>[] {
  const keys = assetStackRowKeys(splitInv, invIds)
  return snapshots.map((d) => {
    const sl = assetSlicesScaledToNetWorth(d, useReal)
    const pool = sl.pool
    const row: Record<string, number> = {}
    for (const key of keys) {
      row[key] = 0
    }
    row.cash = sl.cash
    row.poolPos = Math.max(0, pool)
    row.poolNeg = Math.min(0, pool)
    row.phys = sl.phys
    if (!splitInv || invIds.length === 0) {
      row.inv = sl.inv
    } else {
      const k = snapshotInflationScale(d, useReal)
      const nominals = invIds.map((id) => (d.investmentAssetsByEventId[id] ?? 0) * k)
      const sumNom = nominals.reduce((a, b) => a + b, 0)
      for (let i = 0; i < invIds.length; i++) {
        row[`${ASSET_STACK_INV_PREFIX}${invIds[i]}`] =
          sumNom > 1e-12 ? sl.inv * (nominals[i]! / sumNom) : 0
      }
    }
    return row
  })
}
