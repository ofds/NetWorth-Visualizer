# NetWorth Visualizer — Development plan

**Blueprint:** [networth-visualizer-architecture.md](./networth-visualizer-architecture.md)

Build record: stages **0–9** delivered the current app. All items below are complete and
describe what is implemented today.

---

## Stage 0 — Project foundation

**Goal:** Runnable Vite + React + TypeScript app with Tailwind, core dependencies, and `src/` module skeleton per architecture §9.

- [x] Vite + React + TypeScript scaffold at repo root
- [x] Tailwind CSS v4 via `@tailwindcss/vite` (no separate PostCSS file required)
- [x] Dependencies installed: `zustand`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `framer-motion`, `d3`, `@types/d3`, `i18next`, `react-i18next`
- [x] Folder tree: `src/engine/`, `src/events/`, `src/components/{Layout,EventForm,Graph,Carousel,shared}/`, `src/store/`, `src/hooks/`, `src/utils/`, `src/i18n/`, `src/lib/`
- [x] `npm run build` succeeds

---

## Stage 1 — Domain types and formulas

**Goal:** Shared TypeScript models and pure math helpers for the simulation.

- [x] `events/types.ts`: `EventType`, discriminated `FinancialEvent` variants, form field shapes for all six event kinds (architecture §3)
- [x] Engine types: `MonthSnapshot` (architecture §5.2), internal simulation state types
- [x] `engine/formulas.ts`: compound FV, annuity FV, loan payment (PRICE + SAC) + amortization step, real (inflation-adjusted) value (architecture §5.4)
- [x] `store/useAppStore.ts`: Zustand store with `AppState` shape (architecture §7.1) — events array, UI flags, simulation
- [x] Unit tests: `npm run test` (Vitest) — `formulas.test.ts`, `types.test.ts`, `useAppStore.test.ts`

---

## Stage 2 — Simulation engine core

**Goal:** Deterministic month-by-month simulator producing `MonthSnapshot[]`.

- [x] `engine/simulate.ts`: `simulate(events, startDate, months)` loop with phases aligned to architecture §5.3 (activate/deactivate, macro, income, expenses, debt service, savings split, investment growth, physical assets, snapshot)
- [x] Savings-pool model with investment funding, down-payment debits, windfall credits, deficit coverage and shortfall tracking
- [x] Unit tests: `simulate.test.ts` (`isEventActive`, growth, recurring, macro inflation, career chaining, SAC, reserve installments, windfalls)

---

## Stage 3 — Store integration and milestones

**Goal:** Global state drives recalculation; milestone detection.

- [x] Wire `events` and projection settings into Zustand; recompute `simulation` when inputs change (architecture §7) — `recomputeSimulation`, empty-events fast path
- [x] `hooks/useSimulation.ts`: runs engine on financial-input changes only (presentation state does not re-simulate)
- [x] `engine/milestones.ts`: `detectMilestones` for $100K / $200K / $500K / $1M / $10M crossings, nominal + real — `milestones.test.ts`

---

## Stage 4 — Application shell layout

**Goal:** Two-column shell matching architecture §2 proportions.

- [x] `components/Layout/AppShell.tsx`: fixed ~320–440px left column (scrollable), fluid right column; mobile header + bottom carousel + slide-over form
- [x] Right column: graph area ~80% height, carousel strip ~20% height
- [x] Root `App.tsx` renders `AppShell`; Financial Observatory–style dark theme (`index.css` body bg)

---

## Stage 5 — MVP vertical slice (Investment only)

**Goal:** One event type end-to-end with a simple chart.

- [x] Carousel shows types; selecting **Investment** seeds form (`defaults.ts` + carousel handler)
- [x] Commit event via drag-drop onto graph
- [x] D3-based `NetWorthGraph` line chart of net worth vs month from `simulation`
- [x] Investment event affects `simulate` output (covered in `simulate.test.ts`)

---

## Stage 6 — Full six event types

**Goal:** All event schemas, forms, and engine wiring.

- [x] `events/*.ts` + `defaults.ts`: default factories per kind (career, asset/liability, investment, life, macro, windfall)
- [x] `components/EventForm/EventForm.tsx`: dynamic form per `FinancialEvent` kind
- [x] Macro as global modifier (inflation + market return + pool yield) in `simulate.ts`
- [x] Engine sorts events and resolves overlapping career / macro via “latest start wins”

---

## Stage 7 — Drag-and-drop to timeline

**Goal:** Carousel → form → draggable icon → drop on graph maps to month (architecture §4).

- [x] `DraggableIcon.tsx` with `@dnd-kit` (`useDraggable`, unique id per draft)
- [x] `Graph/DropZone.tsx` (`useDroppable`), graph wrapped in drop zone
- [x] `DndContext` in `AppShell`; pointer move updates `dragPreviewMonth`; `clientXToMonthIndex` tests
- [x] Drop commits `startMonth`; graph marker click to re-edit; remove control; marker reposition drag

---

## Stage 8 — D3 graph layers and interactions

**Goal:** D3-driven hero graph (architecture §6).

- [x] `NetWorthGraph.tsx` + `GraphLayers.ts`: grid, stacked asset breakdown, net worth line, real/nominal, linear reference, milestone verticals, income-gap shading, stress overlay, ghost curve
- [x] Event markers on timeline (click → edit, drag to reposition); hover tooltip with per-event contribution rows, reserve flows and net-worth delta
- [x] Toggles: nominal vs real, linear reference, asset breakdown, stress test
- [x] Zoom/pan brush on the X axis with zoom history + reset
- [x] Framer `motion` on graph card and carousel (`layout`)

---

## Stage 9 — Polish, persistence, responsive

**Goal:** Theme, save/load, mobile-friendly behavior.

- [x] Framer Motion: carousel cards, graph container, mobile sheet (`AnimatePresence`)
- [x] Milestone chips under graph; D3 milestone lines
- [x] `localStorage` via `lib/persistStorage.ts` + `usePersistAppState` + `hydrateStoreFromStorage` in `main.tsx` — `persistStorage.test.ts`
- [x] Event-type palette in `utils/colors.ts` + `DraggableIcon` / carousel
- [x] Life-timeline ruler above the graph; KPI strip with animated currency
- [x] Bilingual UI (en + pt-BR) with language switcher and persistence
- [x] Responsive: `useMediaQuery`; carousel bottom bar; form slide-over on small screens

---

*Last updated: 2026-08 — stages 0–9 complete; this is the current state of the app.*
