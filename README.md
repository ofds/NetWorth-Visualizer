# NetWorth Visualizer

A compound-growth theatre: place life events onto a timeline and watch your financial future unfold. Every career move, investment, home purchase, child, and economic shock bends the net-worth curve in real time.

Frontend-only — no backend. All simulation runs in the browser, and scenarios persist to `localStorage`.

![build](https://img.shields.io/badge/build-passing-brightgreen)
![tests](https://img.shields.io/badge/tests-143%20passing-brightgreen)

---

## What it does

You build a projection by dropping **events** onto a timeline:

| Event | What it models |
|---|---|
| 💼 Career | Salary, raises, job changes — one income path at a time |
| 🏠 Asset / Liability | Home purchases, car loans, student debt, amortization |
| 📈 Investment | Lump sums & recurring contributions (the compound-growth hero) |
| 👶 Life Event | Marriage, children, retirement, education — expense reshaping |
| 🌍 Macro | Inflation, market-return modifiers, recessions — bends every other event |
| 🎁 Windfall | One-time injections of capital |

The simulation engine steps **month-by-month** (up to 50 years), applying active events, macro modifiers, loan amortization, asset appreciation, and compound returns to produce the projection.

## Features

- **Drag & drop events onto the graph** — a live preview shows the curve bending as you drag; drop to commit.
- **D3-powered hero graph** with stacked asset breakdown, event markers, milestone annotations, tooltips, and zoom/pan.
- **Real vs nominal toggle** — see inflation erode your projection in real dollars.
- **Linear-reference overlay** — visualize the gap between linear saving and compound growth.
- **Milestone detection** — automatic $100K / $500K / $1M (and more) crossings on the curve.
- **Life-timeline ruler** — a strip above the chart showing when each event is active.
- **Stress-test overlay** — temporarily apply a recession-style macro without changing saved events.
- **localStorage persistence** — your scenario survives reloads.
- **Bilingual UI** — English and Brazilian Portuguese (`pt-BR`).
- **Responsive layout** — two-column desktop shell collapses into a mobile sheet + bottom carousel.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 |
| State | Zustand |
| Graph | D3 |
| Drag & drop | @dnd-kit/core + sortable |
| Animation | Framer Motion |
| i18n | i18next / react-i18next |
| Unit tests | Vitest |
| E2E tests | Playwright |

## Getting started

```bash
npm install
npm run dev        # start the Vite dev server
npm run test       # run unit tests (Vitest)
npm run test:e2e   # run Playwright E2E suite
npm run build      # type-check + production build (outputs to dist/)
```

Other scripts:

- `npm run lint` — ESLint
- `npm run test:watch` — Vitest watch mode
- `npm run test:e2e:ui` — Playwright UI mode
- `npm run preview` — preview the production build

## Project structure

```
src/
├── engine/       # Simulation core: simulate.ts, formulas, milestones, monteCarlo (stub)
├── events/       # Event types, defaults, per-kind logic
├── components/
│   ├── Layout/   # AppShell, KPI strip, timeline list
│   ├── EventForm/# Dynamic per-kind form + draggable icon
│   ├── Graph/    # D3 hero graph, layers, tooltips, rulers, drop zone
│   ├── Carousel/ # Event-type selector cards
│   └── shared/   # Currency input, sliders, duration picker, etc.
├── store/        # Zustand store (events, simulation, graph settings)
├── hooks/        # useSimulation, drag-to-timeline, dimensions, persistence
├── i18n/         # en + pt-BR locale JSON
├── lib/          # localStorage persistence
└── utils/        # Formatting, colors, timeline coordinates
docs/             # Architecture blueprint + phase 2 feature specs
e2e/              # Playwright specs
```

## Architecture

The full design blueprint lives in **[docs/networth-visualizer-architecture.md](docs/networth-visualizer-architecture.md)** — layout, simulation engine, graph layers, state shape, and event lifecycle.

Key implementation notes:

- **Simulation engine** (`src/engine/simulate.ts`) walks month-by-month with a fixed horizon (≤ 600 months), producing `MonthSnapshot[]`. Careers chain — the next role automatically ends the previous one.
- **Savings pool model** — monthly savings flow into a deployable capital pool that funds investments and asset down payments, with shortfall tracking surfaced in the UI.
- **Graph** (`src/components/Graph/NetWorthGraph.tsx`) is D3-driven with heavy logic extracted into tested helper modules (`graphXDomain`, `netWorthGraphModel`, `assetStackInteraction`, …).

## Testing

- **Unit:** 143 tests across 20 files (Vitest) — engine math, event types, store actions, graph helpers, persistence.
- **E2E:** Playwright specs for the main graph flow, zoom interactions, and i18n.

```bash
npm test
npm run test:e2e
```

## Roadmap / current status

Core product (stages 0–9 of the dev plan) is complete. Phase 2 items are specified in `docs/phase2/` and pending implementation:

- Monte Carlo probability cone (`docs/phase2/01-monte-carlo.md`)
- Milestone timeline bar & graph markers
- Scenario comparison overlays (`docs/phase2/02-scenario-comparison.md`)
- What-if scrubber (`docs/phase2/03-what-if-scrubber.md`)
- Export & share (PNG + shareable URL, `docs/phase2/05-export-share.md`)
- Cash-flow sparklines (`docs/phase2/06-sparklines.md`)

Additional working docs: [graph UX batch](docs/graph-ux-implementation-batch.md) and [investment form enhancements](docs/investment-form-enhancements.md).
