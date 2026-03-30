# Monte Carlo — Probability Cone

## Goal
Run 200–500 randomised simulations in a Web Worker and render a probability cone (fan) behind the deterministic net worth line. The user toggles it on/off via the existing `showMonteCarlo` flag in `graphSettings`.

---

## Engine — `src/engine/monteCarlo.ts`

The file already exists as a stub. Implement `runMonteCarlo(events, startDate, months, runs)`:

- Accept the same `events` and timing params as `simulate()`.
- For each run, clone every investment event and jitter its `annualReturn` by sampling from a normal distribution centred on the event's stated return with σ = 0.06 (6 percentage points standard deviation). Use Box-Muller or a simple LCG approximation — no external library needed.
- Call the existing `simulate()` for each jittered copy. Collect `netWorth` per month.
- Return a `MonteCarloResult`:
  ```
  {
    p10: number[]   // 10th-percentile net worth per month
    p25: number[]
    p50: number[]   // median (should roughly match deterministic)
    p75: number[]
    p90: number[]   // 90th-percentile net worth per month
  }
  ```

---

## Web Worker — `src/engine/monteCarloWorker.ts`

Create a standard Web Worker that:
1. Listens for a message with `{ events, startDate, months, runs }`.
2. Calls `runMonteCarlo(...)`.
3. Posts back the `MonteCarloResult`.

Instantiate it with `new Worker(new URL('./monteCarloWorker.ts', import.meta.url), { type: 'module' })` so Vite bundles it correctly.

---

## Store changes — `src/store/useAppStore.ts`

Add to `AppState`:
```
monteCarloResult: MonteCarloResult | null
isRunningMonteCarlo: boolean
```

Add action `triggerMonteCarlo()`:
- Sets `isRunningMonteCarlo = true`.
- Spawns (or reuses) the worker, sends current events + projection settings.
- On worker message, sets `monteCarloResult` and `isRunningMonteCarlo = false`.
- Re-trigger whenever `events` or `projectionYears` changes AND `graphSettings.showMonteCarlo` is `true`.

---

## Graph rendering — `src/components/Graph/GraphLayers.ts`

When `showMonteCarlo` is true and `monteCarloResult` is available, draw before the net worth line:

- **P10–P90 band**: filled area between `p10` and `p90`, opacity 0.10, same hue as the net worth line (electric blue).
- **P25–P75 band**: filled area between `p25` and `p75`, opacity 0.20.
- **P50 line**: thin dashed line, same colour, opacity 0.50.

Use D3 `area()` generators on the existing x/y scales.

While `isRunningMonteCarlo` is true, show a small spinner badge in the top-right corner of the graph card (a 16px animated SVG circle — no external spinner library).

---

## Toggle UI

The existing "Monte Carlo" toggle button in `NetWorthGraph.tsx` already reads `graphSettings.showMonteCarlo`. When turned on, call `triggerMonteCarlo()` if `monteCarloResult` is null.

---

## Constraints

- Do not block the main thread. All heavy loops stay inside the worker.
- The deterministic line must always render first; the cone appears once the worker responds.
- No new npm dependencies.
