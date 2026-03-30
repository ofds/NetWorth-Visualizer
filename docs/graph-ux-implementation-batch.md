# Graph & projection UX — implementation batch (9 features)

**Audience:** Staff engineer (architecture, review, risky slices) + junior engineer (UI wiring, tests, polish).  
**Scope:** Ideas **1, 2, 6, 7, 9, 12, 13, 14, 16** from the internal “20 improvement ideas” list.

---

## How to use this doc

1. Read **Shared context** once together.  
2. Pick features in **Suggested order** (dependencies first).  
3. For each feature: junior implements against **Acceptance criteria**; staff reviews **Edge cases** and store/API shape.  
4. Keep PRs **one feature per PR** when possible so review stays small.

---

## Shared context

| Area | Location | Notes |
|------|----------|--------|
| Monthly simulation | `src/engine/simulate.ts` | Produces `MonthSnapshot[]` |
| Snapshots | `src/engine/types.ts` | `netWorth`, `realNetWorth`, `investmentShortfall`, `savingsPool`, … |
| Milestones | `src/engine/milestones.ts` | `detectMilestones(snapshots, useReal)` — fixed thresholds, single `useReal` flag today |
| Global state | `src/store/useAppStore.ts` | `events`, `simulation`, `milestones`, `graphSettings`, `recomputeSimulation` |
| Graph (D3) | `src/components/Graph/NetWorthGraph.tsx` | Main plot, ribbon, markers, tooltips |
| Graph helpers | `src/components/Graph/GraphLayers.ts` | `GRAPH_MARGIN`, `eventMarkerXs`, `xAxisMonthTicks`, … |
| Settings UI | `src/components/Layout/AppShell.tsx` | Graph toggles, milestone chips |
| i18n | `src/i18n/locales/en.json`, `pt-BR.json` | Add keys for new strings |

**Real vs nominal:** `graphSettings.showRealValues` drives `pickYValue` / `snapshotInflationScale` in the graph. Milestones today are computed once in `recomputeSimulation` using the same flag.

---

## Feature 1 — Negative savings pool: warning color in stacked area

**User value:** Instantly see when the **savings pool** is underwater (negative), without opening the tooltip.

**Current behavior:** Stacked fill uses `graphAssetAreaColors.savingsPool` from `src/utils/colors.ts`. When `savingsPool < 0`, `assetSlicesScaledToNetWorth` may zero out the stack (`NetWorthGraph.tsx`); the pool slice can still be negative before scaling in edge cases — confirm in code path.

**Spec:**

- When rendering the **pool** layer of the asset stack, if that month’s **nominal** `savingsPool` (or display-scaled equivalent consistent with the graph’s real/nominal mode) is **&lt; 0**, use a **warning fill** (e.g. rose/red at similar opacity to other layers) instead of the default pool color.
- Optional: subtle **striped pattern** or second outline — only if performance stays fine in SVG.

**Implementation notes:**

- `NetWorthGraph.tsx`: where `stackAst` layers map to colors, branch on pool sign for the **pool** series index (order: cash, pool, inv, phys).
- Reuse or extend `graphAssetColors` / `graphAssetAreaColors` in `colors.ts` (e.g. `graphAssetAreaColors.savingsPoolNegative`).
- Ensure **legend/tooltip** copy does not imply “drawing from liquid” unless that matches `simulate.ts` for that month (deficit path uses pool then liquid; negative pool is also used for reserve borrowing on asset down payment).

**Acceptance criteria:**

- [ ] With a scenario where `savingsPool` goes negative, the pool band reads clearly as “warning” vs positive pool.
- [ ] No visual regression when pool ≥ 0.
- [ ] Works with **Real $** on/off (use same scaling as hover `scaledSavingsPool` for consistency).

**Testing:** Manual scenario from `simulate` tests (asset down payment draining pool); optional unit test on a small `MonthSnapshot[]` if you extract a pure “pool color resolver.”

**Split:** Junior: color branch + i18n if needed. Staff: sign/scaling consistency with `snapshotInflationScale`.

---

## Feature 2 — Milestones: nominal + real crossing (dual line)

**User value:** At each milestone flag, show **both** “crossed $X nominal” and “crossed $X in today’s dollars” when those events happen in **different** months.

**Current behavior:** `detectMilestones` runs **once** with `graphSettings.showRealValues` (`useAppStore`). Only one list in `milestones`.

**Spec:**

- Run milestone detection **twice** (or one pass that records both):  
  - `nominal`: field `netWorth`  
  - `real`: field `realNetWorth`  
  Use the **same threshold numbers** (`NET_WORTH_MILESTONE_THRESHOLDS`).
- **UI:** On each vertical milestone line, show **up to two** achievement lines:  
  - If nominal month ≠ real month for the same threshold, two lines (e.g. “$1M nominal · Mar 2035” / “$1M real · Jun 2037”).  
  - If same month, collapse to one line or show both with same date.
- Tooltip / SVG `<title>` updated accordingly; i18n for labels.

**Implementation notes:**

- **Types:** Extend `Milestone` in `types.ts` with optional `nominalMonth`, `realMonth`, `achievedAtNominal`, `achievedAtReal`, or store **two** arrays `milestonesNominal` / `milestonesReal` — staff picks least error-prone shape.
- `detectMilestones`: refactor to return paired results or call twice and merge by `value`.
- `recomputeSimulation`: populate new fields.
- `NetWorthGraph.tsx`: milestone labels + x-axis milestone row use the new data.

**Acceptance criteria:**

- [ ] Toggling **Real $** does not lose milestone lines; labels explain nominal vs real crossing.
- [ ] No duplicate flags for the same threshold unless intentionally showing two dates.
- [ ] `pt-BR` strings added.

**Split:** Staff: type + `detectMilestones` API. Junior: graph labels + chips row in `AppShell.tsx`.

---

## Feature 6 — Investment markers: shortfall streak badge

**User value:** See **persistent underfunding** of investments (pool too low) without scrubbing every month.

**Spec:**

- For each **investment** event, compute whether `investmentShortfall > 0` for **≥ 3 consecutive simulation months** while that investment is active.
- If true, render a small **badge** (e.g. `!` or “3+”) on that event’s **graph marker** (`NetWorthGraph` marker layer).
- Tooltip on badge: short explanation + link to open event editor (optional).

**Implementation notes:**

- Derive a `Map<eventId, boolean>` or `Set<string>` from `simulation[]` + `events` (investment ids, `startMonth` / duration).
- `investmentShortfall` is per snapshot month in `simulate.ts` output.
- Marker rendering: search for `data-nw-graph-marker` / marker map in `NetWorthGraph.tsx`.

**Acceptance criteria:**

- [ ] Streak resets when shortfall is 0 for a month.
- [ ] Only **investment** events get the badge.
- [ ] Performance: O(n) over months once per simulation, not per hover.

**Split:** Junior: derivation + UI badge. Staff: edge cases (investment starts mid-month, multiple investments).

---

## Feature 7 — Stress test: temporary macro overlay

**User value:** One click to see a **recession-style** path (e.g. market modifier) **without** mutating saved events.

**Spec:**

- **UI:** Button near graph settings (e.g. “Stress test”) toggles **preview mode**.
- While active: run a **second** `simulate()` pass with events + a **synthetic** `MacroEnvironmentEvent` (or inject options if you add `SimulateRunOptions` for modifiers only — prefer **non-persistent** merged event list).
- Draw **secondary** net-worth curve (dashed) and optionally **stress milestones** (smaller or gray).
- Clearing toggle removes overlay.

**Implementation notes:**

- Mirror **drag preview** pattern (`mergeEventsForDragPlacement`, `previewSnapshots` in `NetWorthGraph.tsx`).
- Could live in `useAppStore` as `stressTestActive: boolean` + `stressSimulation: MonthSnapshot[] | null` updated when toggling, or local state in `AppShell` passed to graph — staff decides to avoid store bloat.
- `MacroEnvironmentEvent`: `marketReturnModifierAnnual`, `durationYears`, `startMonth` — align with existing macro semantics.

**Acceptance criteria:**

- [ ] User events on disk unchanged after stress test.
- [ ] Primary curve unchanged when overlay on.
- [ ] i18n for button + legend line.

**Split:** Staff: second sim + event merge. Junior: toggle + dashed path styling.

---

## Feature 9 — Contribution ribbon: color legend

**User value:** Map ribbon colors → event names without hovering.

**Spec:**

- When **Event contributions** (`showEventContributions`) is on, show a compact **legend** (floating panel or below ribbon) listing **event name + color** for each event that appears in the ribbon stack for the horizon.
- Toggle icon to show/hide legend (default on first enable optional).

**Implementation notes:**

- Ribbon colors use `eventColorFor` / `contribRibbonColor` in `NetWorthGraph.tsx`; same source as legend.
- Keys already aggregated for positive/negative stacks — reuse that key list + `events` for names.

**Acceptance criteria:**

- [ ] Legend updates when events change.
- [ ] No legend when ribbon is off.
- [ ] Responsive / scroll on small width.

**Split:** Junior: React panel + styling. Staff: dedupe keys + performance.

---

## Feature 12 — Life timeline ruler above the graph

**User value:** See **when** events occur in **age / calendar** terms, not only month index.

**Spec:**

- Horizontal **bar** above the plot area: each event = segment from `startMonth` to `endMonth` (or horizon end if null).
- Label: event name; optional **age** = `currentAge + month/12` if `currentAge` is set in store (`useAppStore`).
- Align horizontal scale with graph **x** (same month → same pixel width as plot).

**Implementation notes:**

- New component e.g. `src/components/Graph/LifeTimelineRuler.tsx` or section inside `AppShell` above `NetWorthGraph`.
- Needs `projectionYears` → month count, `GRAPH_MARGIN.left` alignment so months line up with graph (reuse width props or shared layout context).
- If `currentAge` is `undefined`, show “Year N” or month index only.

**Acceptance criteria:**

- [ ] Segments align with graph x-scale (verify at multiple window sizes).
- [ ] Overlapping events: stack or offset rows (minimal: thin rows).

**Split:** Staff: layout contract with graph width. Junior: SVG/CSS bars + labels.

---

## Feature 13 — Tooltip: net worth velocity

**User value:** See **month-over-month** change at the pinned/hovered month.

**Spec:**

- In the graph tooltip (pinned or hover), show **Δ net worth** vs previous month:  
  `pickYValue(snap[i], useReal) - pickYValue(snap[i-1], useReal)`  
  (skip or “—” for month 0).
- Optional: small up/down arrow or color.

**Implementation notes:**

- `hoverStateForMonth` in `NetWorthGraph.tsx`: add field `netWorthDelta` or compute in render from `hoverSeries`.
- Use same **real/nominal** mode as the line.

**Acceptance criteria:**

- [ ] Delta matches manual subtraction on exported numbers.
- [ ] i18n label (“Change vs prior month” / pt-BR).

**Split:** Junior: data + UI.

---

## Feature 14 — Hover marker: ghost curve without event

**User value:** See marginal impact of **one** event by comparing full plan vs plan minus that event.

**Spec:**

- When **hovering** an event marker (not necessarily click), run **second simulation** with that event **removed** (or disabled), same horizon.
- Draw **ghost** curve (muted line, e.g. gray dashed) behind the main line.
- On mouse leave, clear ghost.

**Implementation notes:**

- Same pattern as drag preview: `simulate(mergedEvents, …)` in `useMemo` or transient state.
- Throttle/debounce hover to avoid sim storms (e.g. 150 ms, cancel previous).
- Map `eventId` from marker → filter `events`.

**Acceptance criteria:**

- [ ] Ghost updates when `events` change while hovering.
- [ ] No permanent state change.
- [ ] Performance acceptable on full 600-month horizon (staff may cap work or use `requestIdleCallback`).

**Split:** Staff: perf + API. Junior: hover wiring + line style.

---

## Feature 16 — Income gap shading (no career)

**User value:** Months with **no active career** (gaps between jobs) read as a **shaded band** on the plot.

**Spec:**

- Compute month ranges where **gross income** (or career activity) is zero per existing rules: `referenceCareerGrossAtMonth` / `simulate` outputs (`grossIncome` in snapshot) — prefer **single source of truth** from `simulation[].grossIncome === 0` (or equivalent) for consistency with the curve.
- Draw a **low-opacity** horizontal band (full plot height) over those x ranges.

**Implementation notes:**

- `MonthSnapshot` includes `grossIncome` — use it to find contiguous runs of zero.
- D3: `append('rect')` per segment in xScale space, or single path — mind `zoomRange` if zoom is implemented later (currently full horizon).

**Acceptance criteria:**

- [ ] Shaded regions match months with no income on the curve.
- [ ] Does not obscure grid/zero line readability (keep opacity low, e.g. 0.06–0.1).

**Split:** Junior: segment finder + rects. Staff: verify definition matches user mental model (“career” vs any income).

---

## Suggested implementation order

| Order | Feature | Rationale |
|------|---------|-----------|
| 1 | **13** velocity | Smallest; touches tooltip only |
| 2 | **1** pool color | Local to graph colors / stack |
| 3 | **9** ribbon legend | Isolated UI; uses existing ribbon data |
| 4 | **6** shortfall badge | Uses `simulation` + markers |
| 5 | **16** income gap | Pure overlay from `grossIncome` |
| 6 | **12** life ruler | Layout-heavy; may affect AppShell structure |
| 7 | **2** dual milestones | Engine + types refactor |
| 8 | **14** ghost curve | Second simulation; perf care |
| 9 | **7** stress test | Second simulation + UX polish |

---

## PR / review checklist (all features)

- [ ] `npm test` passes  
- [ ] New copy in **en** + **pt-BR**  
- [ ] No regression with **empty** `events`  
- [ ] **Real $** toggle behaves consistently where applicable  

---

## Open questions for staff (before coding)

1. **Feature 2:** One merged `Milestone` type vs two arrays?  
2. **Feature 14:** Hover-only vs toggle “compare” for accessibility?  
3. **Feature 7:** Store synthetic macro in memory only — confirm no persist layer picks it up.

---

*Document version: 1.0 — aligns with codebase as of implementation batch discussion.*
