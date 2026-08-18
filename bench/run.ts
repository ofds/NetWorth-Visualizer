/**
 * Deterministic engine benchmark runner.
 *
 * Usage: `npm run bench` (runs `vite-node bench/run.ts`)
 *
 * Measures median / p95 wall time for the hot engine functions over the
 * representative scenario set (small / medium / large / stress). Output is a
 * compact table so before/after runs can be diffed.
 */
import { performance } from 'node:perf_hooks'
import { detectMilestones } from '../src/engine/milestones'
import {
  eventTimelineSegment,
  referenceCareerGrossAtMonth,
  simulate,
} from '../src/engine/simulate'
import { BENCH_SCENARIOS } from './scenarios'

const WARMUP = 5
const ITERATIONS = 30

function medianSorted(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function runTimed(fn: () => void, iterations: number): { median: number; p95: number } {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    fn()
    const t1 = performance.now()
    times.push(t1 - t0)
  }
  const sorted = [...times].sort((a, b) => a - b)
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!
  return { median: medianSorted(sorted), p95 }
}

function fmtMs(ms: number): string {
  return `${ms.toFixed(2)}ms`
}

function main() {
  const start = new Date(2024, 0, 1)
  const rows: string[][] = []
  const header = ['scenario', 'events', 'months', 'sim median', 'sim p95', 'milestones', 'ruler(1ev)', 'ruler(all)']

  for (const sc of BENCH_SCENARIOS) {
    const { events, months } = sc
    const run = () => simulate(events, start, months)
    for (let i = 0; i < WARMUP; i++) run()

    const sim = runTimed(run, ITERATIONS)
    const snaps = run()
    const miles = runTimed(() => detectMilestones(snaps), ITERATIONS)

    // eventTimelineSegment is called once per event by the LifeTimelineRuler; each
    // call re-computes the career effective-end map (O(E log E) per event).
    const rulerAll = runTimed(
      () => {
        for (const e of events) eventTimelineSegment(e, events, months)
      },
      Math.max(3, Math.floor(ITERATIONS / 3)),
    )
    const rulerOne = runTimed(
      () => {
        const e = events[0]!
        eventTimelineSegment(e, events, months)
      },
      ITERATIONS,
    )

    rows.push([
      sc.name,
      String(events.length),
      String(months),
      fmtMs(sim.median),
      fmtMs(sim.p95),
      fmtMs(miles.median),
      fmtMs(rulerOne.median),
      fmtMs(rulerAll.median),
    ])

    // Warm sanity: referenceCareerGrossAtMonth cost (used by the life-event form).
    runTimed(() => referenceCareerGrossAtMonth(events, 120), Math.max(3, Math.floor(ITERATIONS / 3)))
  }

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length)),
  )
  const pad = (s: string, w: number) => s.padEnd(w)
  console.log('\n=== Engine benchmark (median / p95 over runs) ===\n')
  console.log(header.map((h, i) => pad(h, widths[i]!)).join(' | '))
  console.log(widths.map((w) => '-'.repeat(w)).join('-+-'))
  for (const r of rows) {
    console.log(r.map((c, i) => pad(c, widths[i]!)).join(' | '))
  }
  console.log('\n')
}

main()
