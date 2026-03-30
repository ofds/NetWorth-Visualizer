# Scenario Comparison Overlays

## Goal
Let users save the current event configuration as a named "scenario", create multiple scenarios, and overlay their net worth curves on the same graph with distinct colours. Useful for optimistic vs pessimistic vs baseline comparisons.

---

## Data model — `src/store/useAppStore.ts`

Add to `AppState`:
```
scenarios: Scenario[]
activeScenarioId: string        // the scenario currently being edited
comparisonScenarioIds: string[] // up to 2 additional scenarios shown as overlays
```

New type (add to `src/engine/types.ts` or a new `src/store/types.ts`):
```
interface Scenario {
  id: string
  name: string
  color: string          // hex — assigned from a fixed palette of 5 distinct colours
  events: FinancialEvent[]
  simulation: MonthSnapshot[] | null  // cached result; null = needs recompute
  createdAt: number      // timestamp
}
```

---

## Store actions

- `saveCurrentAsScenario(name: string)` — snapshot current `events` into a new `Scenario`, run `simulate()` to cache its `simulation`, assign next colour from palette, push to `scenarios`.
- `deleteScenario(id: string)` — remove from `scenarios` and `comparisonScenarioIds`.
- `renameScenario(id, name)` — update name in place.
- `toggleComparisonScenario(id)` — add/remove from `comparisonScenarioIds` (cap at 2).
- `loadScenario(id)` — replace current `events` with the scenario's events, set `activeScenarioId`.

The active scenario's simulation is always the live `simulation` field (recalculates on every edit). Comparison scenarios use their cached `simulation`; they are static snapshots.

---

## Scenario panel — new component `src/components/Layout/ScenarioPanel.tsx`

A compact panel rendered above the event form in the left column:

- Displays current scenario name (editable inline on click).
- "Save as scenario" button — prompts for a name (inline text input, no modal), calls `saveCurrentAsScenario`.
- List of saved scenarios, each showing: colour swatch · name · "Load" button · "Compare" toggle · trash icon.
- "Compare" toggle is disabled if 2 comparison scenarios are already active (show tooltip "Max 2 comparisons").

Keep the panel collapsed by default (show a single row with expand chevron) to avoid cluttering the left column.

---

## Graph rendering — `src/components/Graph/GraphLayers.ts`

After drawing the primary net worth line, for each `comparisonScenarioIds` scenario:

- Draw a second net worth line using the scenario's cached `simulation.map(s => s.netWorth)`.
- Use the scenario's `color` with opacity 0.65 and a slightly thinner stroke (1.5px vs 2px for primary).
- Draw a small coloured label at the right end of the line (scenario name, truncated to 14 chars) using a D3 `text` element.

No changes to axes or scales — comparison lines share the same x/y domain as the primary. If a comparison line goes outside the current y-domain, extend the domain to fit.

---

## Colour palette for scenarios

Five colours, cycling in order of creation:
1. `#F59E0B` — Amber
2. `#3B82F6` — Blue
3. `#10B981` — Emerald
4. `#8B5CF6` — Violet
5. `#F43F5E` — Rose

The active/live scenario always uses white (`#FFFFFF`) for its curve (existing behaviour).

---

## Persistence

`scenarios` and `comparisonScenarioIds` are included in the existing `persistStorage` serialisation. Each `Scenario.simulation` is **not** persisted (it's derived); on hydration, mark `simulation: null` and recompute lazily when the scenario is toggled into comparison.

---

## Constraints

- No new npm dependencies.
- The active scenario's curve must always visually dominate (thicker, brighter).
- Comparison scenarios are read-only overlays — editing them requires clicking "Load" first.
