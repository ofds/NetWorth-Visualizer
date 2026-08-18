# Performance Optimization Report

Measured, evidence-driven performance pass on NetWorth Visualizer. All financial
semantics are preserved — the optimized engine is verified **bit-for-bit identical**
to the frozen pre-optimization implementation across benchmark, fuzz and edge-case
scenarios.

---

## 1. Baseline (before any changes)

Engine (`simulate`, median of 30 runs, Node 22 / vite-node):

| Scenario | Events | Months | sim median | sim p95 |
|----------|-------:|-------:|-----------:|--------:|
| small    | 6      | 120    | 0.51 ms    | 0.70 ms |
| medium   | 26     | 360    | 2.38 ms    | 2.89 ms |
| large    | 101    | 600    | 6.09 ms    | 6.98 ms |
| stress   | 301    | 600    | 27.08 ms   | 30.10 ms |

Section profile of the stress case (instrumented re-implementation):

| Section             | Time  | Share |
|---------------------|------:|------:|
| investment funding  | 11.1 ms | 37% — `sorted.find` per row per month |
| snapshot assembly   |  6.2 ms | 20% — `Object.fromEntries`, reduces, 3× `Date` allocs/month |
| macro/career/life   |  3.4 ms | 11% — `filter`+`sort` of macros & careers every month |
| active-event filter |  3.3 ms | 11% — full event scan + closure calls every month |
| physical assets     |  1.3 ms |  4% |
| loan steps          |  0.9 ms |  3% |

Interaction (Playwright, dev server, deterministic 101- and 301-event scenarios,
24-step drag gestures):

| Gesture            | Scenario | Simulations | Wall time |
|--------------------|----------|------------:|----------:|
| Carousel drag      | medium   | 223         | 2.6 s     |
| Carousel drag      | large    | 233         | 4.9 s     |
| Carousel drag      | stress   | 225         | 10.8 s    |
| Marker drag        | stress   | 14          | 1.6 s (worst long task 552 ms) |

Bundle: single `index-*.js` 647.5 kB (200.6 kB gzip). Build warning: chunk > 500 kB.

---

## 2. Bottlenecks discovered (ranked by impact)

1. **`sorted.find` inside the monthly investment loop** — every investment did a
   linear scan of the full event list every month: O(months × investments × events).
   ~37% of stress-sim time.
2. **4 redundant simulations per drag pointer move** — the graph preview, the KPI
   strip, the drop-invalid check (`investmentCanPlaceAtMonth`/`assetCanPlaceAtMonth`
   each ran a *full* `simulate`) and the event form each recomputed the same merged
   timeline. ~225 sims per 24-step carousel drag (≈9 per step).
3. **Presentation-only state re-ran the engine** — `useSimulation` depended on
   `showReal` and `lang`, so toggling “Real $” or the UI language re-simulated the
   whole scenario and rebuilt the graph for identical numbers.
4. **Per-month macro/career `filter`+`sort` and full active-event filter** — 22% of
   stress-sim time.
5. **Snapshot allocation churn** — per-month `Object.fromEntries`, multiple reduces,
   and `addMonths` allocating 3 `Date` objects per month (1800/month).
6. **Event form triplicate simulations** — horizon-preview line, investment pool
   callout and pool-cap rows each ran their own full `simulate()` per render
   (~3 extra sims per keystroke; 20 sims for a single tab click).
7. **Life-timeline ruler O(events²)** — `eventTimelineSegment` recomputed the
   career effective-end map (sort over all careers) once per event per draw.
8. **Hover state recomputed on every mousemove** — `hoverStateForMonth` (Maps,
   sorts, i18n) ran even when the hovered month column hadn't changed.
9. **Marker drag ran 2 simulations per commit** (graph + KPI) with the KPI's being
   immediate, plus a full SVG teardown/rebuild per commit.
10. **Single 647 kB JS chunk** — no vendor caching split; d3 confirmed tree-shaken
    (geo/force/hierarchy/zoom/delaunay/contour absent from the bundle).

---

## 3. Changes

### 3.1 Simulation engine — `src/engine/simulate.ts` (rewritten)
Compiled-plan architecture: `FinancialEvent[] → compileSimulationPlan() → monthly loop`.

- **Activation/deactivation schedules** (`additionsByMonth`, `removalsByMonth`,
  `windfallsByMonth`, `assetDownPaymentsByMonth`, `startMonthActivationsByMonth`)
  replace the per-month full scans. The reference's exact activation semantics are
  preserved (investments/assets/windfalls activate on `startMonth` regardless of
  `endMonth`; the active *set* is activity-gated).
- **Incremental active lists** — `active`, `activeLife`, `activeMacros`,
  `activeCareers` maintained via splice add/remove at boundaries, preserving the
  reference's sorted `activeEvents` order.
- **Pre-built investment rows** with the event resolved by the same id-lookup rule
  as the reference (`firstInvestmentById`, matching `sorted.find` semantics
  including duplicate ids) — the monthly `sorted.find` is gone.
- **Macro/career selection** = last element of the incremental active lists
  (same tie-breaks: last by start, then id) instead of per-month filter+sort.
- **Life running sums** recomputed only at boundary months in the same iteration
  order as the reference → bit-identical products/sums.
- **Cached growth multipliers** keyed by market modifier (changes only at macro
  boundaries): `Math.pow` runs once per row per macro regime instead of every
  month; cached doubles are identical to recomputed ones.
- **`addMonths`** — integer month math + leap-year table: one `Date` allocation
  per month instead of three.
- **Snapshot assembly** — single pass builds `investmentAssetsByEventId` +
  `investmentAssets`; ledger sum iterates the Map directly.
- Public API unchanged (`simulate`, `sortEventsForSimulation`, `isEventActive`,
  `computeCareerEffectiveEndById`, `eventTimelineSegment`, `referenceCareerGrossAtMonth`,
  `simulationHorizonMonths`, `addMonths`, options & shortfall callbacks).

### 3.2 Equivalence regression suite — `src/engine/simulateEquivalence.test.ts`
Frozen copy of the pre-optimization engine in `src/engine/simulate.reference.ts`
(clearly marked, test-only). 10 tests assert **bit-exact** equality of every
`MonthSnapshot` field (all numbers, maps, `activeEvents`, contributions, dates)
across: all benchmark scenarios, seeded fuzz, non-default options, shortfall
callbacks, same-start career overlaps, overlapping macros + reserve borrowing,
600-month horizons, zero/one-month horizons, degenerate `endMonth < startMonth`
events, and duplicate event ids.

### 3.3 One shared drag-preview simulation — `src/store/useAppStore.ts`
`setDragging` now computes the merged timeline + `simulate` **once** per input
change (guarded by an input-fingerprint cache so same-column pointer moves cost
nothing) and stores `dragPreviewSnapshots`/`dragPreviewMergedEvents`. The graph
preview, KPI strip, drop-invalid ring (now derived from the preview's shortfall
maps — the exact quantities `investmentCanPlaceAtMonth`/`assetCanPlaceAtMonth`
compute), and the event form all consume this single result. Empty-timeline drags
still preview the draft's baseline.

### 3.4 Presentation state decoupled — `src/hooks/useSimulation.ts`
Dependencies narrowed to `events` + `projectionYears` (the only inputs that change
simulation output). Toggling real/nominal or language no longer re-simulates.

### 3.5 Event form — `src/components/EventForm/EventForm.tsx` + `useLiveSimulation`
Three per-render simulations consolidated into one `liveSim` memo; during a drag
of the form's own draft it substitutes the store's shared preview
(`useDragPreviewSim`). Per keystroke: 4 → 2 sims; per drag move: 3 → 0 extra.

### 3.6 KPI strip — `src/components/Layout/HeroKpiStrip.tsx`
Placement preview reads the shared store simulation; marker-drag preview deferred
via `useDeferredValue` so it tracks the (deferred) graph curve instead of running
immediately per move.

### 3.7 Life timeline ruler — `src/components/Graph/LifeTimelineRuler.tsx`
Career effective-end map computed once per draw and threaded through
`eventTimelineSegment` (new optional parameter) — O(events²) → O(events log events).

### 3.8 Graph hover — `src/components/Graph/NetWorthGraph.tsx`
`hoverStateForMonth` and the crosshair band are now computed only when the hovered
month column actually changes (persistent closure counters), eliminating per-
mousemove allocations and React re-renders within a month.

### 3.9 Benchmark & instrumentation harness
- `bench/scenarios.ts` — deterministic scenario generators (small/medium/large/stress).
- `bench/run.ts` — `npm run bench`: median/p95 sim, milestones, ruler cost.
- `src/engine/simulate.ts` exports `simulationStats` (2 integer adds/call);
  exposed as `window.__NWV_SIM_STATS__` by `main.tsx`.
- `e2e/perf-interaction.spec.ts` — regression guard: sims-per-gesture and
  long-task bounds for carousel and marker drags on 3 scenario sizes.
- `e2e/perf-load.spec.ts` — load-time measurement (DOMContentLoaded, first sim,
  chart render) with the large scenario.

### 3.10 Bundle — `vite.config.ts`
Vendor code-splitting groups (react / motion / d3 / dnd / i18n) for cacheability.
Confirmed d3 is already tree-shaken and unused modules (`TimelineList.tsx`,
`events/*` re-export stubs) are unreachable (not bundled). Both locale files are
bundled statically — lazy-loading pt-BR would flash English on first pt-BR boot
for a ~6 kB gzip saving.

---

## 4. Results

### Engine (`npm run bench`, median of 30 runs)

| Scenario | Events | Months | Before | After | Speedup |
|----------|-------:|-------:|-------:|------:|--------:|
| small    | 6      | 120    | 0.51 ms | 0.31 ms | 1.6× |
| medium   | 26     | 360    | 2.38 ms | 1.35 ms | 1.8× |
| large    | 101    | 600    | 6.09 ms | 2.63 ms | 2.3× |
| stress   | 301    | 600    | 27.08 ms | 7.16 ms | **3.8×** |
| stress p95 | 301   | 600    | 30.10 ms | 9.15 ms | **3.3×** |

### Interaction (Playwright, 24-step gestures; before = baseline tree, after = this branch)

Carousel drag (new event onto the graph):

| Scenario | Before sims | After sims | Δ | Before wall | After wall | Δ |
|----------|------------:|-----------:|--:|------------:|-----------:|--:|
| medium   | 223         | 32         | −86% | 2.6 s | 2.1 s | 1.3× |
| large    | 233         | 34         | −85% | 4.9 s | 3.0 s | 1.7× |
| stress   | 225         | 34         | −85% | 10.8 s | 4.1 s | **2.6×** |

Production build: stress carousel drag = 25 sims / 1.9 s; worst long task 123 ms.

Marker drag (repositioning an existing marker): worst long task stress
552 ms → 232 ms (dev) / 110 ms (prod); wall 1.6 s → 1.0 s (dev). Deferred previews
coalesce so fast gestures commit few or zero simulations.

### Load (production build, 101 events / 50 y seeded)
DOMContentLoaded 220 ms, first simulation complete 369 ms, chart paths rendered 371 ms.

### Bundle
647.5 kB single chunk (200.6 kB gzip) → split chunks with unchanged total
(react 245.7 / motion 124.4 / app 181.4 / d3 58.6 / dnd 38.8 kB; 200.5 kB gzip),
vendor chunks cache-stable across deploys.

---

## 5. Architecture decisions

- **Compiled simulation plan** — justified by measurement: the hot cost was not
  arithmetic but repeated O(events) scans and per-month sorts/finds. The plan
  indexes activations/deactivations by month and pre-resolves row→event links,
  making the monthly body proportional to what changed.
- **Store-owned shared drag preview** — one simulation per input change is the
  single source of truth for the graph, KPI, drop-invalid feedback and form.
- **No Web Workers.** The engine is now ~4× faster (7 ms worst-case stress); the
  remaining interaction cost is React/D3 commit work on the main thread, which a
  worker cannot fix without reintroducing serialization/round-trip latency for a
  single-simulation app. Workers would add complexity with no measured benefit.
- **Deferred, not throttled** — marker-drag previews use React 19 `useDeferredValue`
  (coalescing to what the frame can afford) rather than arbitrary debounce delays.
- **No memoization noise** — only the demonstrated hot paths got caching
  (multipliers, drag preview, live sim, hover, ruler map).

## 6. Verification

- `tsc -b` — clean.
- `npm run test` — **156 passed / 1 skipped** (21 files), including the 10-test
  bit-exact engine-equivalence suite and 3 new store drag-preview tests.
- `npm run lint` — 4 errors, **all pre-existing** (identical on the pristine
  baseline: `useAnimatedMetric` refs rule, `AnimatedCurrency` set-state-in-effect,
  `LifeTimelineRuler` fast-refresh, `NetWorthGraph` array-index-key).
- `npm run build` — clean, chunked output.
- `npm run test:e2e` — **21 passed, 1 failed**; the failure
  (`graph-x-zoom.spec.ts` “preview band expands while dragging selection”) is a
  stale expectation (test wants `M0–M5` labels; the app shows calendar labels) and
  **fails identically on the pristine baseline** — unrelated to this work.
- `e2e/perf-interaction.spec.ts` — **6/6 pass on this branch; 4/6 fail on the
  baseline** (sims-per-drag 223–233 vs bound 44; stress marker long task 485 ms vs
  bound 350 ms), proving the regression guard discriminates.
- Equivalence fuzzing: randomized scenarios (every event kind, overlaps, career
  chaining, macros, SAC/PRICE, reserve installments, windfalls, pool shortfalls,
  degenerate inputs, duplicate ids, 1–600 month horizons) — all bit-exact.
