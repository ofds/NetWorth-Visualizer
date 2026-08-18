// Generates deterministic scenario fixtures for the Playwright perf spec.
import { writeFileSync } from 'node:fs'
import { BENCH_SCENARIOS } from './scenarios'

for (const sc of BENCH_SCENARIOS) {
  writeFileSync(
    new URL(`./fixtures/${sc.name}.json`, import.meta.url),
    JSON.stringify({ events: sc.events, months: sc.months }),
  )
}
console.log('fixtures written:', BENCH_SCENARIOS.map((s) => s.name).join(', '))
