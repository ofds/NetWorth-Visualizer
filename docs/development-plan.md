# NetWorth Visualizer — Development plan

**Blueprint:** [networth-visualizer-architecture.md](./networth-visualizer-architecture.md)

This checklist tracks implementation from empty repo through a polished, architecture-aligned app. Stages **0–9** (ten stages). Check substages as you complete them.

---

## Stage 0 — Project foundation

**Goal:** Runnable Vite + React + TypeScript app with Tailwind, core dependencies, and `src/` module skeleton per architecture §9.

- [x] Vite + React 18 + TypeScript scaffold at repo root
- [x] Tailwind CSS v4 via `@tailwindcss/vite` (no separate PostCSS file required)
- [x] Dependencies installed: `zustand`, `@dnd-kit/core`, `@dnd-kit/utilities`, `framer-motion`, `recharts`, `d3`, `@types/d3`
- [x] Folder tree: `src/engine/`, `src/events/`, `src/components/{Layout,EventForm,Graph,Carousel,shared}/`, `src/store/`, `src/hooks/`, `src/utils/` with stubs that keep `npm run build` green
- [x] `npm run build` succeeds

---

## Stage 1 — Domain types and formulas

**Goal:** Shared TypeScript models and pure math helpers for the simulation.

- [x] `events/types.ts`: `EventType`, discriminated `FinancialEvent` variants, form field shapes for all five event kinds (architecture §3)
- [x] Engine types: `MonthSnapshot` (architecture §5.2), internal simulation state types
- [x] `engine/formulas.ts`: compound FV, annuity FV, loan payment + amortization step, real (inflation-adjusted) value (architecture §5.4)
- [x] `store/useAppStore.ts`: Zustand store with `AppState` shape stub (architecture §7.1) — events array, UI flags, no full simulation yet
- [x] Unit tests: `npm run test` (Vitest) — `formulas.test.ts`, `types.test.ts`, `useAppStore.test.ts`

---

## Stage 2 — Simulation engine core

**Goal:** Deterministic month-by-month simulator producing `MonthSnapshot[]`.

- [x] `engine/simulate.ts`: `simulate(events, startDate, months)` loop with phases aligned to architecture §5.3 (activate/deactivate, macro, income, expenses, debt service, savings split, investment growth, physical assets, snapshot)
- [x] `initializeState()` and event activation handlers stubbed or implemented per event kind as needed for Stage 5 MVP path
- [x] Unit tests: `simulate.test.ts` (`isEventActive`, growth, recurring, macro inflation)

---

## Stage 3 — Store integration and milestones stub

**Goal:** Global state drives recalculation; milestones hook exists.

- [x] Wire `events` and projection settings into Zustand; recompute `simulation` when inputs change (architecture §7) — `recomputeSimulation`, empty-events fast path
- [x] `hooks/useSimulation.ts`: runs engine on dependency change
- [x] `engine/milestones.ts`: `detectMilestones` for $100K / $500K / $1M crossings — `milestones.test.ts`
- [x] `store/selectors.ts`: projection, events, currency, graph settings, simulation

---

## Stage 4 — Application shell layout

**Goal:** Two-column shell matching architecture §2 proportions.

- [x] `components/Layout/AppShell.tsx`: fixed ~320–360px left column (scrollable), fluid right column; mobile header + bottom carousel + slide-over form
- [x] Right column: graph area ~80% height, carousel strip ~20% height
- [x] Root `App.tsx` renders `AppShell`; Financial Observatory–style dark theme (`index.css` body bg)

---

## Stage 5 — MVP vertical slice (Investment only)

**Goal:** Architecture §13 Phase 1 — one event type end-to-end with a simple chart.

- [x] Carousel shows types; selecting **Investment** seeds form (`defaults.ts` + carousel handler)
- [x] Commit event via “Add to timeline” or drag-drop onto graph
- [x] D3-based `NetWorthGraph` line chart of net worth vs month from `simulation`
- [x] Investment event affects `simulate` output (covered in `simulate.test.ts`)

---

## Stage 6 — Full five event types

**Goal:** All event schemas, forms, and engine wiring.

- [x] `events/*.ts` + `defaults.ts`: default factories per kind
- [x] `components/EventForm/EventForm.tsx`: dynamic form per `FinancialEvent` kind
- [x] Macro as global modifier (inflation + market return) in `simulate.ts`
- [x] Engine sorts events and resolves overlapping career / macro via “latest start wins”

---

## Stage 7 — Drag-and-drop to timeline

**Goal:** Carousel → form → draggable icon → drop on graph maps to month (architecture §4).

- [x] `DraggableIcon.tsx` with `@dnd-kit` (`useDraggable`, unique id per draft)
- [x] `Graph/DropZone.tsx` (`useDroppable`), graph wrapped in drop zone
- [x] `DndContext` in `AppShell`; pointer move updates `dragPreviewMonth`; `clientXToMonthIndex` tests
- [x] Drop commits `startMonth`; timeline list + graph marker click to re-edit; remove control

---

## Stage 8 — D3 graph layers and interactions

**Goal:** Replace or augment MVP chart with D3-driven hero graph (architecture §6).

- [x] `NetWorthGraph.tsx` + `GraphLayers.ts`: grid, optional stacked asset breakdown, net worth line, linear reference, milestone verticals, Monte Carlo placeholder label
- [x] Event markers on timeline (click → edit); hover tooltip for month / value
- [x] Toggles: nominal vs real, linear reference, breakdown, Monte Carlo note
- [x] Framer `motion` on graph card and carousel (`layout`)

---

## Stage 9 — Polish, persistence, responsive

**Goal:** Delight, theme, save/load, mobile-friendly behavior.

- [x] Framer Motion: carousel cards, graph container, mobile sheet (`AnimatePresence`)
- [x] Milestone chips under graph; D3 milestone lines
- [x] `localStorage` via `lib/persistStorage.ts` + `usePersistAppState` + `hydrateStoreFromStorage` in `main.tsx` — `persistStorage.test.ts`
- [x] Event-type palette in `utils/colors.ts` + `DraggableIcon` / carousel
- [x] Responsive: `useMediaQuery`; carousel bottom bar; form slide-over on small screens

---

---

## Stage 10 — Bug fixes & pre-Phase 2 cleanup

**Spec:** [phase2/00-bug-fixes.md](./phase2/00-bug-fixes.md)

- [ ] Fix `index.html` title: change `vite-tmp` → `NetWorth Visualizer`
- [ ] Remove unused `recharts` dependency from `package.json`
- [ ] Leave `Tooltip.tsx`, `Milestones.tsx`, `EventMarkers.tsx` stubs in place — implemented in Stage 12

---

## Stage 11 — Monte Carlo probability cone

**Spec:** [phase2/01-monte-carlo.md](./phase2/01-monte-carlo.md)

- [ ] Implement `engine/monteCarlo.ts`: `runMonteCarlo()` returning P10/P25/P50/P75/P90 bands
- [ ] Create `engine/monteCarloWorker.ts` Web Worker; wire via Vite `new URL(...)` import
- [ ] Store: add `monteCarloResult`, `isRunningMonteCarlo`, `triggerMonteCarlo()` action
- [ ] Graph: render P10–P90 and P25–P75 filled bands + P50 dashed line in `GraphLayers.ts`
- [ ] Loading spinner badge while worker is running

---

## Stage 12 — Milestone timeline bar & graph markers

**Spec:** [phase2/04-milestone-timeline.md](./phase2/04-milestone-timeline.md)

- [ ] Extend `engine/milestones.ts`: add debt-free, zero-crossing, $2M detections; add `type` field to `Milestone`
- [ ] Implement `Graph/Milestones.tsx`: vertical dashed lines + annotation labels on graph
- [ ] Implement `Graph/EventMarkers.tsx`: event icon markers on x-axis with hover tooltip + click to edit
- [ ] New `Graph/MilestoneTimeline.tsx`: horizontal strip below graph with tick marks, icons, labels
- [ ] Wire `onMilestoneClick` to animate graph `zoomRange`

---

## Stage 13 — Scenario comparison overlays

**Spec:** [phase2/02-scenario-comparison.md](./phase2/02-scenario-comparison.md)

- [ ] Add `Scenario` type; add `scenarios`, `activeScenarioId`, `comparisonScenarioIds` to store
- [ ] Store actions: `saveCurrentAsScenario`, `deleteScenario`, `renameScenario`, `toggleComparisonScenario`, `loadScenario`
- [ ] New `Layout/ScenarioPanel.tsx`: collapsible panel in left column above event form
- [ ] Graph: draw overlay curves for comparison scenarios in their assigned colours
- [ ] Persist `scenarios` array in localStorage

---

## Stage 14 — What-if scrubber

**Spec:** [phase2/03-what-if-scrubber.md](./phase2/03-what-if-scrubber.md)

- [ ] Add `whatIf` state and `setWhatIf` / `clearWhatIf` actions to store
- [ ] Extend `simulate()` to accept optional `WhatIfOverride` param (clones events, never mutates)
- [ ] New `Graph/WhatIfScrubber.tsx`: variable selector + range slider + delta label
- [ ] Graph: amber line colour + "WHAT-IF MODE" badge + faint grey baseline line when active
- [ ] 50ms debounce on what-if recompute

---

## Stage 15 — Export & share

**Spec:** [phase2/05-export-share.md](./phase2/05-export-share.md)

- [ ] New `utils/exportGraph.ts`: SVG → Canvas → PNG download with header/footer stats
- [ ] New `lib/shareUrl.ts`: `encodeScenarioToUrl` / `decodeScenarioFromUrl` using `CompressionStream`
- [ ] Hydrate from URL hash in `main.tsx` (takes priority over localStorage)
- [ ] New `shared/Toast.tsx`: lightweight fade-in/out notification component
- [ ] "Export PNG" and "Copy Link" buttons in graph toggle row

---

## Stage 16 — Cash flow sparklines

**Spec:** [phase2/06-sparklines.md](./phase2/06-sparklines.md)

- [ ] New `EventForm/CashFlowSparklines.tsx`: net income + savings sparklines using D3
- [ ] Highlight band for active event's month range
- [ ] Shared hover cursor + tooltip
- [ ] Collapsible "Cash Flow Preview" section in left column
- [ ] Hide on mobile (`useMediaQuery` < 640px)

---

**Last updated:** 2026-03-28 — Stages 0–9 complete. Stages 10–16 (Phase 2) specs written; implementation pending.
