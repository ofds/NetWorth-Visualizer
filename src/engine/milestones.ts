import type { Milestone, MonthSnapshot } from './types'

/** Fixed net-worth rungs (USD nominal; display layer applies locale). */
export const NET_WORTH_MILESTONE_THRESHOLDS = [
  100_000, 200_000, 500_000, 1_000_000, 10_000_000,
] as const

function detectCrossingsForField(
  snapshots: MonthSnapshot[],
  field: 'netWorth' | 'realNetWorth',
): Map<number, { month: number; date: Date }> {
  const found = new Map<number, { month: number; date: Date }>()
  if (snapshots.length === 0) return found

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1]![field]
    const cur = snapshots[i]![field]
    const achievedAt = snapshots[i]!.date
    for (const value of NET_WORTH_MILESTONE_THRESHOLDS) {
      if (found.has(value)) continue
      if (prev < value && cur >= value) {
        found.set(value, { month: i, date: achievedAt })
      }
    }
  }
  return found
}

/**
 * First month each threshold is crossed for nominal and real net worth (strictly from below).
 */
export function detectMilestones(snapshots: MonthSnapshot[]): Milestone[] {
  if (snapshots.length === 0) return []

  const nom = detectCrossingsForField(snapshots, 'netWorth')
  const real = detectCrossingsForField(snapshots, 'realNetWorth')
  const out: Milestone[] = []

  for (const value of NET_WORTH_MILESTONE_THRESHOLDS) {
    const n = nom.get(value)
    const r = real.get(value)
    if (!n && !r) continue

    const nominalMonth = n?.month ?? null
    const realMonth = r?.month ?? null
    const achievedAtNominal = n?.date ?? null
    const achievedAtReal = r?.date ?? null
    const month = nominalMonth ?? realMonth ?? 0
    const achievedAt = achievedAtNominal ?? achievedAtReal!

    out.push({
      id: `milestone-${value}-n${nominalMonth ?? 'x'}-r${realMonth ?? 'x'}`,
      month,
      value,
      achievedAt,
      nominalMonth,
      realMonth,
      achievedAtNominal,
      achievedAtReal,
    })
  }

  return out.sort((a, b) => a.month - b.month || a.value - b.value)
}
