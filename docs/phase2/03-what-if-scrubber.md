# What-If Scrubber

## Goal
A single slider that lets the user drag one variable (e.g. investment return rate) across a range and watch the graph curve bend in real time — without permanently changing any event. The scrubber is a temporary override; releasing it or closing it restores the original value.

---

## UI — `src/components/Graph/WhatIfScrubber.tsx`

New component rendered as a floating panel anchored to the bottom-left of the graph area (above the graph toggles row).

Layout:
```
[ Variable selector ▾ ]  [———●———]  +2.3%   [×]
```

- **Variable selector**: a `<select>` or small pill menu listing scrubable variables (see below). Defaults to "Investment return".
- **Slider**: range input, step 0.1. Position maps to an override delta (e.g. −5% to +5%).
- **Delta label**: shows the current offset as `+X.X%` or `−X.X%` in the event's colour.
- **Close button**: resets override to 0 and hides the panel.

The panel is hidden by default. A "What-if" button in the graph toggle row opens it. Clicking any event marker on the graph pre-selects that event's primary variable.

---

## Scrubable variables

| Variable | Events it applies to | Range | Unit |
|---|---|---|---|
| Investment return | All Investment events | −10% to +10% | % delta |
| Savings rate | All Career events | −20% to +20% | % delta |
| Inflation rate | Active Macro events (or global default) | −3% to +5% | % delta |
| Monthly income | Active Career event | −50% to +100% | % delta |
| Asset appreciation | All Asset/Liability events | −5% to +5% | % delta |

---

## Store changes — `src/store/useAppStore.ts`

Add to `AppState`:
```
whatIf: {
  active: boolean
  variable: WhatIfVariable   // enum matching the table above
  delta: number              // current slider offset, e.g. 0.023
} | null
```

Add actions:
- `setWhatIf(variable, delta)` — update `whatIf`; triggers simulation recompute.
- `clearWhatIf()` — set `whatIf = null`; triggers simulation recompute.

---

## Simulation integration — `src/engine/simulate.ts`

`simulate()` already receives `events`. Add an optional third param `whatIfOverride: WhatIfOverride | null`.

When `whatIfOverride` is set, before the simulation loop, clone the relevant events and apply the delta:

- **Investment return delta**: add `whatIfOverride.delta` to each active Investment event's `annualReturn`.
- **Savings rate delta**: add delta to each active Career event's `monthlySavingsRate`.
- **Inflation delta**: add delta to the effective inflation rate in the macro state.
- **Monthly income delta**: multiply each active Career event's `monthlyGrossIncome` by `(1 + delta)`.
- **Asset appreciation delta**: add delta to each active Asset event's `appreciationRate`.

The original `events` array is never mutated — the simulation works on a local shallow clone for what-if runs.

---

## Hook — `src/hooks/useSimulation.ts`

The existing hook already triggers `recomputeSimulation` on event changes. Add `whatIf` from the store to the dependency array so the graph rerenders live as the slider moves.

To keep redraws smooth, debounce the what-if recompute to **50ms** (shorter than the existing 250ms persist debounce).

---

## Graph visual cue

When `whatIf` is active:
- The net worth line changes colour to a warm amber (`#F59E0B`) to signal "hypothetical mode".
- A small badge on the graph reads "WHAT-IF MODE" in amber, top-right corner.
- The original deterministic line is shown as a faint grey dashed line behind the what-if line (use the last `simulation` computed before `whatIf` was activated — store it as `baselineSimulation` when `setWhatIf` is first called).

---

## Constraints

- The scrubber must never permanently mutate any event in the store.
- Closing the scrubber (or navigating away from the event) must restore the original graph instantly.
- No new npm dependencies — use a native `<input type="range">` styled with Tailwind.
