# NetWorth Visualizer — Product Improvement Blueprint

> Living document. Captures the ten improvement dimensions, what already exists in the
> codebase, the gaps, and the agreed roadmap. Update this file as decisions are made;
> implementation details live in `development-plan.md`.

**Status:** agreed blueprint — no implementation started yet.
**Owner:** product (single voice), tech review against `networth-visualizer-architecture.md`.

---

## 1. Summary

The app is feature-complete for v1 (stages 0–9). The simulation engine, graph, event
forms, persistence, i18n, and tests are in place. The ten dimensions below are the v2+
opportunity set. The strategic thesis: **turn a projection visualizer into a
decision-support tool** — grounded in the user's real financial baseline, capable of
comparing futures, and explaining *why* the numbers behave as they do.

Three findings shaped the roadmap:

1. **The engine already emits a per-event attribution ledger** (`eventMonthContributions`
   on every `MonthSnapshot`), and the graph tooltip already renders monthly attribution
   and reserve flows. The raw material for financial storytelling exists — the narrative
   layer does not.
2. **`simulate()` is a pure function.** Two scenarios = run it twice. Scenario
   comparison and counterfactual analysis ("this decision costs you R$X") are
   structurally cheap; the real cost is store/persistence/graph-UI work.
3. **The personal baseline is the cheapest load-bearing wall.** The engine already
   accepts `initialLiquid`, `initialSavingsPool`, and `baseMonthlyExpenses` in
   `SimulateOptions` — the UI never surfaces them. Wiring that up unlocks onboarding,
   storytelling, comparison, and goals.

---

## 2. Current-state snapshot (what exists today)

| Area | Current implementation | Key files |
|---|---|---|
| Engine | Deterministic month-by-month simulator (≤600 months); savings-pool model; career chaining; macro regimes; PRICE/SAC amortization; windfalls; per-event monthly ΔNW ledger; investment & down-payment shortfall tracking | `src/engine/simulate.ts`, `src/engine/types.ts`, `src/engine/formulas.ts` |
| Milestones | Fixed thresholds $100K/$200K/$500K/$1M/$10M, nominal + real crossings | `src/engine/milestones.ts` |
| Graph | D3 hero graph: stacked breakdown, real/nominal, linear reference, milestone verticals + chips, income-gap shading, stress overlay, ghost curve, zoom/pan brush + back/reset, scrubbing, **pinned month**, draggable/resizable tooltip panel with monthly attribution + reserve flows + delta-by-source | `src/components/Graph/NetWorthGraph.tsx`, `netWorthGraphModel.ts`, `graphXDomain.ts` |
| Timeline interactions | Drag-to-place with live preview, marker reposition drag, middle-click delete, drag-to-delete-zone, collapsible life-timeline ruler, keyboard sensor, duration↔endMonth sync | `src/components/Layout/AppShell.tsx`, `src/components/Graph/LifeTimelineRuler.tsx`, `src/events/syncEventWindow.ts` |
| Event forms | Dynamic per-kind forms with field hints, live horizon-Δ preview, reference-month mechanics, savings-pool context & shortfall previews, % sliders synced to dollar caps, default factories | `src/components/EventForm/EventForm.tsx`, `src/events/defaults.ts` |
| KPI strip | End net worth, savings pool, total change, nominal/real alternate — end-of-horizon only | `src/components/Layout/HeroKpiStrip.tsx` |
| Persistence | Single scenario slot in localStorage (key `networth-visualizer-state-v1`) | `src/lib/persistStorage.ts`, `src/hooks/usePersistAppState.ts` |
| Onboarding | Thin empty state + one-time carousel hint flag (`nw_carousel_hint_v1`) | `src/components/Layout/AppShell.tsx` |
| Profile fields | `currentAge` (store only, feeds life-ruler age labels); `currency`; `projectionYears` | `src/store/useAppStore.ts` |
| i18n | Full en + pt-BR locales; pt-BR renders **R$** with same numeric values (no FX) | `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`, `src/utils/formatting.ts` |
| Quality | 156 unit tests incl. bit-exact equivalence suite vs frozen reference; Playwright e2e; engine bench harness | `src/engine/simulate.reference.ts`, `simulateEquivalence.test.ts`, `bench/run.ts` |
| Known deferral | Monte Carlo placeholder previously removed (see git `234a67a`; `persistStorage.ts` still strips `showMonteCarlo`) | — |

---

## 3. The ten improvement dimensions

### 3.1 — Onboarding & First-Time Experience

**Vision.** Guided first scenario; a first-run flow asking only *age, income, current
investments, monthly savings* and generating the initial timeline automatically. Goal:
**time-to-first-meaningful-graph ≈ 30–60 seconds.** Example scenarios, contextual
explanations on first event-type selection, progressive disclosure.

**Already in the product.** Empty-state panel ("Map your financial future"); one-time
carousel hint; `currentAge` field; per-kind default factories.

**Gaps.** No wizard; no guided/example scenarios; no progressive disclosure; the mental
model (create → configure → position → observe → combine → interpret) is undiscovered by
new users.

**Enablers.** Engine baseline options (`SimulateOptions`) map 1:1 onto the 4 wizard
questions; `createDefaultEventForType`; bilingual i18n system.

**Suggested approach.** Wizard (modal, so the dense shell stays untouched) → writes the
personal baseline (3.9) + seeds initial events → example scenarios as loadable presets.
Keep all new copy bilingual.

**Effort / risk.** M / low. UX-copy heavy.

**Definition of done.** A new user reaches a meaningful curve in ≤60s without docs; first-run
state persisted; examples load without manual event construction.

---

### 3.2 — Financial Storytelling & Interpretation

**Vision.** Turn math into meaning: *why did wealth accelerate here; why did the
apartment hurt first but help later; which decision made the biggest difference; am I
doing well?* Statements like:

- "This decision costs you R$420k by age 60"
- "Your investments overtake contributions at age 47"
- "Compound returns now contribute more than salary savings"
- "Your mortgage delays R$1M net worth by 3.2 years"
- "Inflation removes 38% of nominal purchasing power"

**Already in the product.** Per-event monthly ledger (`eventMonthContributions`) on every
snapshot; tooltip "Monthly attribution" + "Change vs prior month — by source" + reserve
in/out flows; KPI strip (end values only); milestone module.

**Gaps.** No narrative layer; no cumulative per-event impact; no inflection-point
detection; no counterfactual statements; **per-event contribution tracking missing**
(only aggregate `poolFundingToInvestmentsTotal` exists — "overtake" needs per-event
funding).

**Enablers.** `simulate()` purity → counterfactuals (`simulate(events)` vs
`simulate(events − event)`) are exact; the existing ledger; milestone crossings.

**Suggested approach.** New pure analysis module(s) over snapshots — no engine edits
except the one **additive** change to track contributions per investment event (see
constraints §6).

**Effort / risk.** M / low. The single engine addition must preserve the bit-exact
equivalence suite.

**Definition of done.** ≥3 statement classes shipped (event impact, overtake/inflection,
counterfactual cost), each unit-tested against known scenarios.

---

### 3.3 — Scenario Comparison & Decision Making

**Vision.** Branching financial futures: duplicate scenario, A/B tabs, overlay two
projections, deltas in milestone dates and ending wealth, delta-by-year,
baseline-vs-branch. Turns the app from visualizer into decision support.

**Already in the product.** One mutable timeline; single localStorage slot; pure engine;
single hero series + drag ghost; milestone detection.

**Gaps.** No scenario storage model; no clone/duplicate; no overlay; no delta chart.

**Enablers.** `simulate()` purity (two sims + overlay is mechanical); `detectMilestones`
for date deltas; `GraphLayers` composability.

**Suggested approach — ship in two steps.**

- **(a) Scenario tabs:** scenarios collection in store, duplicate action, tab switcher,
  ending-wealth + milestone-date deltas. Requires localStorage v1→v2 migration.
- **(b) Overlay mode:** two curves overlaid, delta-by-year chart, hover-compare.

**Effort / risk.** M (a), L (b). Main risk surface is the store/persistence refactor.

**Definition of done.** User clones a scenario, edits only the branch, sees ending +
milestone-date deltas; overlay mode with per-year delta.

---

### 3.4 — Timeline Manipulation & Direct Manipulation

**Vision.** A real financial timeline editor: resize event duration on the timeline, drag
start/end handles, multi-select, duplicate, snap to birthdays/years, copy/paste,
keyboard nudging, grouped/collapsed categories, contextual menus, dependency
visualization. "Figma + Gantt + financial simulation."

**Already in the product.** Drag-to-place with live preview; marker reposition;
middle-click delete; drag-to-delete-zone; collapsible life ruler; zoom/pan brush;
keyboard sensor; duration↔endMonth sync.

**Gaps.** No resize handles; no multi-select; no duplicate/copy-paste; no snap; no
grouping.

**Enablers.** `syncEventWindow.ts` (duration derivation), `currentAge` (snap to
birthdays), dnd-kit.

**Suggested approach.** Duplicate + resize handles first (cheap), then snap-to-birthdays,
then multi-select. Power-user ergonomics; lowest priority among interaction features.

**Effort / risk.** M–L / medium (`syncEventWindow` invariants must stay consistent).

**Definition of done.** Resize an event's duration directly on the timeline; duplicate
any event; snap start months to birthdays when `currentAge` is set.

---

### 3.5 — Graph Exploration & Financial Visualization

**Vision.** The graph as an *exploratory instrument*, not a spectacle: scrub through
time, click any year for a financial snapshot (net worth / investments / home equity /
mortgage / cash / income / spending / investing), contribution vs growth, assets vs
liabilities, income vs expenses, cash-flow layer, waterfall views, drawdown periods,
event impact range highlighting, hover-compare between scenarios, selectable graph
modes.

**Already in the product.** Scrubbing + pinned month; zoom/pan brush + back/reset;
stacked breakdown; real/nominal; linear reference; milestone verticals + chips;
income-gap shading; stress overlay; ghost curve; tooltip with attribution, reserve flows,
delta-by-source; draggable/resizable tooltip panel.

**Gaps.** Dedicated financial-snapshot readout (all data exists in `MonthSnapshot`);
contribution-vs-growth view (blocked on the same additive per-event contribution fix as
3.2); waterfall/drawdown views; hover-compare between scenarios (ties to 3.3).

**Enablers.** `MonthSnapshot` already carries `grossIncome`, `netIncome`,
`totalExpenses`, `monthlySavings`, `savingsPool`, `investmentAssets`, `physicalAssets`,
`totalLiabilities`, `liquidAssets`.

**Suggested approach.** Snapshot panel first (pure UI), then contribution-vs-growth
(shared fix with 3.2), then waterfall/drawdown.

**Effort / risk.** S–M (snapshot), M (contribution-vs-growth), M–L (waterfall).

**Definition of done.** Selecting a month shows the full financial-snapshot block;
contribution vs growth split per investment.

---

### 3.6 — Event Creation UX & Financial Abstraction

**Vision.** Express intent rather than configure models: "I want to invest R$2,000/month
in ETFs" or "Buy a R$700k apartment with R$150k down" → the system populates the
technical form. Plus sensible defaults, presets/templates, quick-add, basic/expert modes,
assumption explanations, high-impact input indication.

**Already in the product.** Dynamic per-kind forms with hints; live horizon-Δ preview;
reference-month mechanics; savings-pool context and shortfall previews; % sliders synced
to dollar caps; default factories.

**Gaps.** No intent-based entry; no presets/templates; no basic/expert modes; no
assumption explanations.

**Enablers.** `createDefaultEventForType`; the form's existing preview machinery.

**Suggested approach.** Presets/templates first (one-click scenario building blocks), then
intent parsing (phrases → field populations), then basic/expert toggle.

**Effort / risk.** S–M (templates), M–L (intent), M (modes).

**Definition of done.** ≥3 presets per event kind; a template populates the full form
correctly.

---

### 3.7 — Goals, Milestones & Progress

**Vision.** User-defined goals (R$1M invested, debt-free, financial independence, buy a
house, R$10k/month passive income, retire by 50, emergency fund = 12 months expenses)
with answers like "Goal reached at age 44.7" and "Increasing investments by R$750/month
gets you there 2 years earlier." Motivational loop: decision → simulation → goal
movement.

**Already in the product.** Automatic fixed-threshold milestones ($100K…$10M, nominal +
real) with chips, verticals, and crossing dates; the milestone module is small and pure.

**Gaps.** No custom goals; no goal-relative what-if search; no passive-income or
emergency-fund derivations.

**Enablers.** Snapshot fields (`totalLiabilities`, `investmentAssets`, `monthlySavings`);
pure `simulate()` for the what-if local search.

**Suggested approach.** Generalize milestone detection to user goals (each goal = a
predicate over `MonthSnapshot`); what-if = bounded parameter search over `simulate`.

**Effort / risk.** S–M / low.

**Definition of done.** User-defined goals show projected achievement age; a "what would
get me there sooner" suggestion answers in seconds.

---

### 3.8 — Risk, Uncertainty & Probabilistic Futures

**Vision.** Ranges instead of a single curve: optimistic/expected/pessimistic, Monte
Carlo returns, inflation/salary-growth uncertainty, confidence bands, probability of
reaching a goal, probability of running out of money, sensitivity analysis.

**Already in the product.** Deterministic engine; stress-test overlay; shortfall
machinery (`investmentShortfall`, `poolDeficitCoverTotal`) that seeds ruin detection. A
Monte Carlo placeholder was previously removed (see §2).

**Gaps.** The entire stochastic mode.

**Suggested approach.** Scope as a **v3 candidate** (deliberate deferral, reviving the
previous one). Separate stochastic engine mode sampling returns/inflation/salary growth,
distribution aggregation, band rendering. Deterministic mode stays the default and its
output must remain bit-identical.

**Effort / risk.** XL / highest — touches the pinned deterministic math.

**Definition of done.** Median / likely-range / probability readouts behind a "Ranges"
toggle; deterministic default unchanged; equivalence suite still green.

---

### 3.9 — Personalization & Real-Life Baseline

**Vision.** A dedicated baseline: *here is your financial life today. Now change the
future.* Current age, cash, investments, salary, recurring expenses, existing property,
existing loans, country, inflation assumptions, taxes, expected salary growth. Events
become true future changes; defaults get much better.

**Already in the product.** Engine `SimulateOptions` accepts `initialLiquid`,
`initialSavingsPool`, `baseMonthlyExpenses` — **never surfaced in the UI** (defaults 0);
`currentAge` in store (life-ruler only); career event is the de-facto income baseline.

**Gaps.** No baseline UI; no baseline persistence; no country/tax/inflation/salary-growth
assumptions; the "where I am" vs "what might happen" distinction is absent.

**Suggested approach.** Baseline panel + store slice + persistence; wire `SimulateOptions`
through `useSimulation`; optional "starting situation" wizard hook (3.1). Default behavior
must be identical when baseline is empty.

**Effort / risk.** S–M / low.

**Definition of done.** Baseline fields affect the projection; a scenario can be described
as "baseline + future events"; new-event defaults flow from the baseline.

---

### 3.10 — Polish, Emotional Design & "Financial Theatre"

**Vision.** Financial simulation should *feel* satisfying: beautiful curve transitions,
subtle motion on milestone crossings, event-impact ripples, elegant number transitions,
visually dramatic compound-growth acceleration, polished typography, depth/layering,
better empty states, better drag feedback, richer event icons, milestone celebrations
without gamification excess. "Drag Promotion +R$7,000/month from 31 → 28 and *feel* the
30-year compounding difference."

**Already in the product.** AnimatedCurrency; framer-motion layouts; milestone chips +
verticals; ghost curves; drag-rejection rings; dark observatory theme.

**Gaps.** Milestone crossing moments; event-impact ripples; celebration without excess;
stronger compound-growth "aha" beat.

**Suggested approach.** Interleave small beats with feature phases; each beat measurable
(animation-frame budgets).

**Effort / risk.** S each, ongoing / low (watch low-end devices).

**Definition of done.** Dropping a high-impact event shows a visible response; milestone
crossings animate; 60fps on reference hardware.

---

## 4. Prioritization

### Original tiering (agreed)

| Priority | Dimension | Why |
|---|---|---|
| 1 | Scenario comparison | Converts visualization into decision-making |
| 2 | Financial storytelling | Helps users understand the simulation |
| 3 | Onboarding | Makes existing sophistication approachable |
| 4 | Personal baseline | Grounds everything in the user's real life |
| 5 | Goals & milestones | Gives simulation an objective |
| 6 | Graph exploration | Extracts more value from the strongest component |
| 7 | Event creation UX | Reduces friction |
| 8 | Timeline manipulation | Makes power users substantially faster |
| 9 | Risk / uncertainty | Makes projections more realistic |
| 10 | Visual/emotional polish | Raises perceived quality dramatically |

### Adjustments agreed during review

1. **Personal baseline (3.9) is promoted into Tier 1 for *sequencing*.** It is the
   cheapest of all ten (engine plumbing exists) and it is the load-bearing wall for
   onboarding (3.1), storytelling (3.2), comparison (3.3), and goals (3.7). Impact
   ranking stays as above; build order changes.
2. **Scenario comparison (3.3) splits into two ships:** (a) scenario tabs + duplicate +
   deltas (medium) before (b) curve overlay + delta-by-year (large). Ship (a) first —
   it alone converts the product into decision support.
3. **Storytelling (3.2) pulls forward** because the data layer already exists; it
   composes naturally with the comparison deltas.
4. **Risk/uncertainty (3.8) is explicitly a v3 candidate** — previously deferred, and it
   is the only dimension that threatens the pinned deterministic math.

---

## 5. Roadmap (dependency-aware)

| Phase | Scope | Depends on | Size |
|---|---|---|---|
| **F1** | Personal baseline: panel + store slice + persistence + `SimulateOptions` wiring | — | S–M |
| **F2** | Onboarding: 4-question wizard → baseline + seeded events; example scenarios | F1 | M |
| **F3** | Scenario tabs: scenarios collection, duplicate, ending + milestone-date deltas, localStorage v1→v2 migration | F1 | M–L |
| **F4** | Storytelling: event impact summaries, overtake/inflection detection, counterfactual cost statements (+ additive per-event contribution tracking) | F1, F2, F3 | M |
| **F5** | Graph: financial-snapshot readout panel; contribution-vs-growth view | F4 (tracking fix) | S–M |
| **F6** | Goals: custom goal definitions + what-if sensitivity | F4 | S–M |
| **F7** | Event UX presets/templates; timeline duplicate/resize/snap | — | M |
| **F8** | Risk/uncertainty stochastic mode (or explicit v3 non-goal) | everything | XL |
| **F9** | Polish/emotional beats — interleaved, not a single phase | ongoing | S each |

Sequencing rationale: F1 first because everything leans on it; F2 immediately after so the
wizard can write the baseline; F3 next as the flagship decision-support feature; F4 rides
on F1–F3 because its statements need a real baseline and scenario context to be
truthful.

---

## 6. Cross-cutting constraints

1. **Bit-exact equivalence suite.** `simulate` is pinned against a frozen reference
   (`simulate.reference.ts`, `simulateEquivalence.test.ts`). Prefer **new pure functions
   over snapshots** (storytelling, deltas, goals) over engine edits. The one justified
   engine change — per-event contribution tracking — must be **additive only** (add new
   fields/rows; never change existing operations or ordering).
2. **i18n is first-class.** Every feature ships en + pt-BR strings; locale files are the
   contract. No hardcoded user-facing copy.
3. **localStorage is single-slot** (`networth-visualizer-state-v1`). Scenario collection
   requires a v1→v2 migration with backward-compatible load.
4. **Performance discipline.** Compiled-plan engine, bench harness, shared drag-preview
   simulation. New analyses must reuse the compiled plan and memoize; every new feature
   should be bench-measured. Simulation cost is trivial (≤600 steps); rendering and
   re-derivation are the risks.
5. **No backend.** Everything in-browser; keep it that way unless explicitly decided.
6. **Test parity.** 156 unit tests + Playwright e2e today; new modules ship with tests,
   and e2e coverage extends to new interaction surfaces.

---

## 7. Open questions & decisions log

| # | Question | Decision | Date |
|---|---|---|---|
| 1 | Is Monte Carlo / stochastic mode in scope for v3 or a non-goal? | Proposed: v3 candidate (§3.8) | — |
| 2 | Baseline currency input: BRL amounts directly, or continue USD-model + R$ display (no FX)? | Current behavior: R$ display, no FX. Confirm | — |
| 3 | Scenario storage: localStorage only, or add JSON export/import? | TBD | — |
| 4 | How deep for baseline v1: cash/investments/salary/expenses only, or also country/inflation/tax/salary-growth assumptions? | TBD | — |
| 5 | Onboarding wizard placement: modal before first use, or inline panel replaceable via "skip"? | TBD | — |
| 6 | Comparison UX: tabs-first (3.3a) confirmed as the first ship? | TBD | — |

---

*Last updated: 2026-08. Written before any implementation work; revisit §4–§5 whenever a
phase completes.*
