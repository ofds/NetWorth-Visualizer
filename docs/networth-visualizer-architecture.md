# NetWorth Visualizer — Full Architecture Breakdown

## 1. Vision & Core Philosophy

The app is a **compound growth theatre** — a stage where the user places life events onto a timeline and watches their financial future unfold. The hero is the graph: a sweeping, beautiful curve that bends and accelerates with every event the user drops onto it. The feeling should be visceral — you *see* compound growth working (or breaking) in real time.

Frontend-only. No backend. All calculation happens in the browser. State lives in memory (and optionally localStorage for persistence).

---

## 2. Layout Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        TOP BAR (optional)                   │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│   EVENT      │            GRAPH AREA                        │
│   INPUT      │         (80% of right column height)         │
│   FORM       │                                              │
│              │   Net worth curve + event markers +           │
│  (~320px     │   milestone annotations + asset breakdown    │
│   fixed      │                                              │
│   width)     │                                              │
│              ├──────────────────────────────────────────────┤
│              │         EVENT CAROUSEL                       │
│              │      (20% of right column height)            │
│              │   [💼] [🏠] [📈] [👶] [🌍]                  │
│              │   Scrollable row of event type cards          │
│              │                                              │
│   [drag      │                                              │
│    icon]     │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### Proportions & Behavior
- **Left column**: Fixed width (~320–360px). Scrollable if form is long. Contains a draggable event icon at the bottom once the form is filled.
- **Right column**: Fluid, takes remaining width.
  - **Graph area**: 80% height. This is the centrepiece. Drop target for events.
  - **Event carousel**: 20% height. Horizontally scrollable cards, one per event type.

### Responsive consideration
On smaller screens, the carousel moves to a bottom sheet, and the form becomes a slide-over panel triggered by tapping an event card.

---

## 3. The Six Event Types

Each event has a distinct **icon**, **color**, **form schema**, and **calculation impact**.

### 3.1 — 💼 Career Event (Income Change)
> Models salary, raises, bonuses, job changes.

**Form Fields:**
| Field | Type | Notes |
|---|---|---|
| Event name | text | "Started at Google", "Got promoted" |
| Monthly gross income | currency | New income level |
| Monthly savings rate | percentage | What % goes to investments |
| Duration | months/years toggle | How long this income lasts (or "indefinite") |
| Tax bracket estimate | percentage | Simplified effective tax rate |

**Calculation impact:** Sets the monthly cash inflow to the net worth simulation from the event's start date forward (until overridden by another career event or ended by duration).

---

### 3.2 — 🏠 Major Asset / Liability
> Models home purchases, car loans, student debt, large purchases.

**Form Fields:**
| Field | Type | Notes |
|---|---|---|
| Event name | text | "Bought apartment", "Car loan" |
| Asset/Liability toggle | toggle | Determines sign |
| Principal value | currency | Purchase price or loan amount |
| Down payment | currency | Only for assets |
| Interest rate (APR) | percentage | Mortgage/loan rate |
| Term | years | Loan amortization period |
| Monthly payment | currency | Auto-calculated or manual override |
| Appreciation/Depreciation rate | percentage/year | e.g., real estate +3%/yr, car -15%/yr |

**Calculation impact:** Adds asset value to net worth (appreciating/depreciating over time). Subtracts outstanding liability. Monthly payments reduce liability principal. Creates the classic leverage effect visible on the graph.

---

### 3.3 — 📈 Investment Event
> Models lump-sum investments, recurring contributions, portfolio changes.

**Form Fields:**
| Field | Type | Notes |
|---|---|---|
| Event name | text | "Started index fund", "Crypto allocation" |
| Type | select | Lump sum / Recurring contribution |
| Initial amount | currency | Lump sum or first deposit |
| Monthly contribution | currency | For recurring |
| Expected annual return | percentage | Pre-filled based on asset class |
| Asset class hint | select | Stocks / Bonds / Real Estate / Crypto / Custom |
| Duration | years | Or "ongoing" |

**Calculation impact:** This is the **compound growth hero**. The monthly compounding formula drives the exponential curve. When combined with recurring contributions, the graph shows the hockey stick. This event type should produce the most visually dramatic changes on the graph.

---

### 3.4 — 👶 Life Event
> Models marriages, children, retirement, education — events that reshape expense profiles.

**Form Fields:**
| Field | Type | Notes |
|---|---|---|
| Event name | text | "First child", "Retirement" |
| Type | select | Marriage / Child / Retirement / Education / Custom |
| Monthly expense change | currency | Additional monthly cost (or reduction) |
| One-time cost | currency | Wedding cost, college tuition lump sum |
| Duration | years | e.g., child expenses for 18 years |
| Income impact | percentage | e.g., retirement = income drops to 0% of salary |

**Calculation impact:** Modifies the monthly expense baseline. Retirement events can drastically reshape the curve (income stops, drawdown begins). Children add sustained expense increases. Marriages may combine incomes (positive) or add wedding costs (one-time negative).

---

### 3.5 — 🌍 Macro Economy Environment
> Models the world around the user — inflation, recessions, bull markets.

**Form Fields:**
| Field | Type | Notes |
|---|---|---|
| Environment name | text | "High inflation period", "2008-style crash" |
| Inflation rate | percentage/year | Overrides default (2-3%) |
| Market return modifier | percentage | Applied on top of investment return rates |
| Interest rate environment | percentage | Affects new loans and savings rates |
| Duration | years | How long this environment lasts |
| Severity | slider 1-10 | Quick visual indicator |

**Calculation impact:** This is a **global modifier**. It doesn't add assets or liabilities — it bends every other event's math. High inflation erodes purchasing power (visible as the "real" net worth line flattening). A crash applies a negative modifier to all investment returns during its window. This creates the dramatic dips and recoveries that make compound growth storytelling powerful.

---

### 3.6 — 🎁 Windfall Event
> Models one-time injections of capital — inheritance, gifts, legal settlements.

**Form Fields:**
| Field | Type | Notes |
|---|---|---|
| Event name | text | "Inheritance", "Gift" |
| Amount | currency | One-time nominal credit |

**Calculation impact:** Credits the savings pool (reserve) once on the event's start
month — before any asset down payment in the same month. Used to model large inflows
that fund purchases or investments.

---

## 4. Interaction Flow — Drag & Drop

### Step-by-step:
1. **User browses the carousel** → clicks an event card (e.g., 📈 Investment).
2. **Left panel updates** → shows the Investment form with all relevant fields.
3. **User fills the form** → as they fill it, a preview summary appears at the bottom of the form panel.
4. **Draggable icon appears** → at the bottom of the form panel, a styled, color-coded icon matching the event type appears.
5. **User drags the icon to the graph** → as they drag over the graph, a vertical time indicator follows the cursor, snapping to months/years.
6. **User drops the icon** → the event is placed at that time position. The graph **immediately recalculates and animates** the new curve.
7. **Event marker appears on the graph** → a small icon/dot on the timeline. Hoverable for details. Clickable to re-edit.

### Technical implementation:
- Use the **HTML5 Drag and Drop API** or a library like `@dnd-kit/core` (React) for smoother UX.
- The graph's x-axis serves as the drop zone, mapping pixel position → date.
- On drop, the event is added to the global event timeline state, the calculation engine re-runs, and the graph animates to the new projection.

---

## 5. The Calculation Engine — Deep Dive

This is the mathematical core of the app. It's a **discrete time-step simulator** that walks month-by-month from the present into the future, applying all active events at each step.

### 5.1 — Core Architecture

```
EventTimeline (sorted list of events with start dates)
        │
        ▼
┌──────────────────────────┐
│   Simulation Engine      │
│                          │
│  for each month M:       │
│    1. Check new events   │
│    2. Apply macro mods   │
│    3. Calculate income   │
│    4. Calculate expenses │
│    5. Service debts      │
│    6. Grow investments   │
│    7. Appreciate assets  │
│    8. Sum net worth      │
│    9. Store snapshot     │
└──────────────────────────┘
        │
        ▼
  Array<MonthSnapshot> → Graph renderer
```

### 5.2 — The MonthSnapshot Data Structure

```typescript
interface MonthSnapshot {
  month: number;               // Months from today (0, 1, 2, ... 600 for 50 years)
  date: Date;                  // Absolute date

  // Income & Expenses
  grossIncome: number;
  netIncome: number;           // After tax
  totalExpenses: number;
  monthlySavings: number;      // netIncome - totalExpenses

  // Assets
  liquidAssets: number;        // Cash + savings
  investmentAssets: number;    // Total investment portfolio value
  physicalAssets: number;      // Real estate, vehicles (current market value)
  totalAssets: number;

  // Liabilities
  totalLiabilities: number;   // Sum of outstanding loan balances

  // The Hero Number
  netWorth: number;            // totalAssets - totalLiabilities

  // Inflation-adjusted view
  realNetWorth: number;        // netWorth in today's dollars

  // Breakdown for stacked area chart
  assetBreakdown: {
    label: string;             // "Index Fund", "Apartment", "Savings"
    value: number;
  }[];

  // Active events at this point
  activeEvents: string[];      // Event IDs active during this month
}
```

### 5.3 — Monthly Calculation Loop (Pseudocode)

```
function simulate(events: Event[], startDate: Date, months: number): MonthSnapshot[] {
  let state = initializeState();
  let snapshots = [];
  let cumulativeInflation = 1.0;

  for (let m = 0; m < months; m++) {
    let currentDate = addMonths(startDate, m);

    // ── Phase 1: Activate/deactivate events ──
    for (event of events) {
      if (event.startMonth === m) activate(state, event);
      if (event.endMonth === m) deactivate(state, event);
    }

    // ── Phase 2: Get current macro environment ──
    let macro = getMacroEnvironment(state);
    let monthlyInflation = (1 + macro.inflationRate) ^ (1/12) - 1;
    cumulativeInflation *= (1 + monthlyInflation);

    // ── Phase 3: Income ──
    let grossIncome = state.activeIncome;
    let netIncome = grossIncome * (1 - state.effectiveTaxRate);

    // ── Phase 4: Expenses ──
    let baseExpenses = state.baseExpenses * cumulativeInflation; // Inflation-adjusted
    let eventExpenses = sum(state.activeLifeEvents.map(e => e.monthlyExpenseChange));
    let totalExpenses = baseExpenses + eventExpenses;

    // ── Phase 5: Debt Service ──
    for (loan of state.activeLoans) {
      let payment = calculateAmortizationPayment(loan);
      let interestPortion = loan.balance * (loan.apr / 12);
      let principalPortion = payment - interestPortion;
      loan.balance -= principalPortion;
      totalExpenses += payment;
    }

    // ── Phase 6: Savings → Investment Allocation ──
    let monthlySavings = netIncome - totalExpenses;
    let investmentContribution = monthlySavings * state.savingsRate;
    state.liquidAssets += (monthlySavings - investmentContribution);

    // ── Phase 7: Investment Growth ──
    for (investment of state.activeInvestments) {
      let effectiveReturn = investment.annualReturn + macro.marketModifier;
      let monthlyReturn = (1 + effectiveReturn) ^ (1/12) - 1;
      investment.value *= (1 + monthlyReturn);
      investment.value += investment.monthlyContribution || 0;
    }
    // Add new allocation from savings
    state.primaryInvestment.value += investmentContribution;

    // ── Phase 8: Asset Appreciation/Depreciation ──
    for (asset of state.physicalAssets) {
      let monthlyAppreciation = (1 + asset.annualRate) ^ (1/12) - 1;
      asset.currentValue *= (1 + monthlyAppreciation);
    }

    // ── Phase 9: Snapshot ──
    let totalAssets = state.liquidAssets
      + sum(state.activeInvestments.map(i => i.value))
      + sum(state.physicalAssets.map(a => a.currentValue));
    let totalLiabilities = sum(state.activeLoans.map(l => l.balance));
    let netWorth = totalAssets - totalLiabilities;

    snapshots.push({
      month: m,
      date: currentDate,
      grossIncome, netIncome, totalExpenses, monthlySavings,
      liquidAssets: state.liquidAssets,
      investmentAssets: sum(state.activeInvestments.map(i => i.value)),
      physicalAssets: sum(state.physicalAssets.map(a => a.currentValue)),
      totalAssets, totalLiabilities,
      netWorth,
      realNetWorth: netWorth / cumulativeInflation,
      assetBreakdown: buildBreakdown(state),
      activeEvents: state.activeEventIds,
    });
  }

  return snapshots;
}
```

### 5.4 — Key Mathematical Formulas

#### Compound Growth (the hero)
```
FV = PV × (1 + r/n)^(n×t)

Where:
  FV = Future Value
  PV = Present Value
  r  = Annual interest rate
  n  = Compounding frequency (12 for monthly)
  t  = Time in years
```

#### Future Value of Recurring Contributions (annuity)
```
FV_annuity = PMT × [((1 + r/n)^(n×t) - 1) / (r/n)]

This is what creates the hockey stick. Even small monthly contributions
become massive over 20-30 years. This should be visually celebrated.
```

#### Loan Amortization
```
Monthly Payment = P × [r(1+r)^n] / [(1+r)^n - 1]

Where:
  P = Principal
  r = Monthly interest rate (APR/12)
  n = Total number of payments
```

#### Real (Inflation-Adjusted) Value
```
Real Value = Nominal Value / (1 + inflation_rate)^years

This allows the "real vs nominal" toggle on the graph.
```

### 5.5 — Engine Characteristics & Design Decisions

| Characteristic | Decision | Rationale |
|---|---|---|
| **Time step** | Monthly | Enough granularity for loans and contributions without performance issues |
| **Projection horizon** | Up to 50 years (600 steps) | Covers full career + retirement |
| **Recalculation trigger** | On every event add/remove/edit | Should feel instant (<16ms for 600 steps) |
| **Deterministic mode** | Default | Single projected line, no randomness |
| **Inflation handling** | Cumulative multiplier | Expenses grow with inflation; assets grow at nominal rates; real net worth shown as separate toggle |
| **Event overlap** | Fully supported | Multiple careers, investments, loans can be active simultaneously |
| **Event ordering** | Sorted by start month | Processed sequentially within each month |
| **Negative net worth** | Allowed and displayed | Graph dips below zero — important for realism (student debt, mortgages) |

### 5.6 — Performance Considerations

The engine must be **blazingly fast** because it re-runs on every user interaction:

- 600 months × 5-10 active events = ~6,000 operations per simulation → trivial for modern JS.
- Use **typed arrays** (`Float64Array`) for the snapshot time series to optimize memory layout and charting.
- Avoid object allocation in the hot loop — pre-allocate the snapshot array.
- The engine compiles the event list into an indexed plan once per run (activation/deactivation schedules, pre-resolved investment rows), so the monthly loop is proportional to what changed — see `docs/performance-optimization-report.md` for measurements.

---

## 6. Graph Rendering — The Visual Centrepiece

### 6.1 — Chart Library Choice

The graph is built with **D3.js** for maximum control and beauty. It allows:
- Custom curve interpolation (smooth, organic-feeling growth curves)
- Animated transitions when events are added/removed
- Custom event markers on the timeline
- Gradient fills under the curve
- Stacked area breakdowns
- Interactive tooltips with rich data

### 6.2 — Graph Layers (bottom to top)

```
Layer 1: Background grid (subtle, desaturated)
Layer 2: Stacked area chart (asset breakdown — investments, real estate, cash)
Layer 3: Liability area (shown below x-axis or as negative space)
Layer 4: Net worth line (the hero curve — thick, glowing, animated)
Layer 5: Real net worth line (dashed, toggle-able, shows inflation erosion)
Layer 6: Event markers (icons on the timeline with vertical indicator lines)
Layer 7: Milestone annotations ("First $100K", "$1M net worth", "Debt free")
Layer 8: Interactive cursor (vertical line following mouse, showing values at that date)
```

### 6.3 — Visual Features

- **Animated curve drawing**: When an event is dropped, the curve smoothly morphs from old projection to new. Use D3 transitions with `attrTween` for path interpolation.
- **Gradient fill**: The area under the net worth curve uses a vertical gradient — deeper color at the base, fading to transparent at the top. The color shifts from warm (red/orange) when net worth is low/negative to cool (green/teal) as it grows.
- **Event markers**: Small circular icons on the x-axis at the event's start date. Vertical dashed lines extend up to where they intersect the curve. Hovering shows a tooltip with event details and its cumulative impact.
- **Milestone celebrations**: When the curve crosses $100K, $500K, $1M, etc., a subtle particle burst or glow effect fires at that point. These milestones are annotated directly on the graph.
- **The compound growth "gap"**: Show a faint "linear growth" reference line (what the user's net worth would be without compounding) to visually demonstrate the power of compound returns. The widening gap between linear and exponential IS the story.

### 6.4 — Axes & Scale

- **X-axis**: Time (years from now). Labeled with ages if the user provides their current age, or with calendar years.
- **Y-axis**: Currency (auto-scaling). Use abbreviations ($10K, $500K, $1.2M) for readability. Consider a log-scale toggle for users with very long timelines where early years look flat.
- **Zoom & pan**: Allow the user to zoom into specific periods or pan across the timeline. Scroll-to-zoom on the graph area.

---

## 7. State Management

### 7.1 — Global State Shape

```typescript
interface AppState {
  // User profile
  currentAge?: number;
  currency: string;                    // "USD", "BRL", etc.
  projectionYears: number;             // Default 30

  // Events
  events: FinancialEvent[];            // All events, sorted by startMonth
  selectedEventType: EventType | null; // Currently selected in carousel
  editingEventId: string | null;       // Currently being edited in form

  // Derived (recalculated)
  simulation: MonthSnapshot[];         // Output of calculation engine
  milestones: Milestone[];             // Auto-detected milestones

  // UI state
  isDragging: boolean;
  dragPreviewMonth: number | null;     // Month being hovered over during drag
  graphSettings: {
    showRealValues: boolean;           // Inflation-adjusted toggle
    showLinearReference: boolean;      // Show linear growth comparison
    showAssetBreakdown: boolean;       // Stacked area vs single line
    stressTestActive: boolean;         // Temporary recession overlay (no saved events)
    zoomRange: [number, number];       // Visible month range
  };
}
```

### 7.2 — State Management Approach

For a frontend-only app of this complexity, **Zustand** is ideal:
- Minimal boilerplate
- Supports computed/derived state (simulation results)
- Easy to persist to localStorage
- No provider wrappers needed

Alternatively, React's `useReducer` + Context could work but gets verbose.

---

## 8. Technology Stack Recommendation

| Layer | Choice | Why |
|---|---|---|
| Framework | **React 18+** | Component model fits the modular event system |
| State | **Zustand** | Lightweight, supports derived state, localStorage persistence |
| Graph | **D3.js** (via custom React hooks) | Maximum visual control for the hero graph |
| Drag & Drop | **@dnd-kit/core** | Modern, accessible, works great with React |
| Styling | **Tailwind CSS** + CSS custom properties | Rapid iteration + themeable |
| Animation | **Framer Motion** | Smooth form transitions, carousel animations |
| Math | **Vanilla JS** (no library needed) | The formulas are simple; a library adds unnecessary weight |
| Persistence | **localStorage** | Save/load scenarios, no backend needed |
| Build | **Vite** | Fast HMR, optimized builds |

---

## 9. File / Module Structure

```
src/
├── engine/
│   ├── simulate.ts            # Core simulation loop
│   ├── formulas.ts            # Compound growth, amortization, inflation
│   ├── milestones.ts          # Auto-detect milestone crossings
│   ├── assetPlacement.ts      # Down-payment feasibility (reserve constraints)
│   └── investmentPlacement.ts # Pool-funding feasibility (shortfall constraints)
│
├── events/
│   ├── types.ts               # Event type definitions & schemas
│   ├── career.ts              # Career event logic & defaults
│   ├── asset.ts               # Asset/liability event logic
│   ├── investment.ts          # Investment event logic
│   ├── lifeEvent.ts           # Life event logic
│   └── macro.ts               # Macro economy event logic
│
├── components/
│   ├── Layout/
│   │   └── AppShell.tsx       # Two-column layout container
│   ├── EventForm/
│   │   ├── EventForm.tsx      # Dynamic form renderer
│   │   ├── DraggableIcon.tsx  # The draggable event icon
│   │   └── fields/            # Reusable form field components
│   ├── Graph/
│   │   ├── NetWorthGraph.tsx  # Main graph component
│   │   ├── GraphLayers.tsx    # D3 layer composition
│   │   ├── EventMarkers.tsx   # Event icons on timeline
│   │   ├── Milestones.tsx     # Milestone annotations
│   │   ├── DropZone.tsx       # Drag-and-drop target overlay
│   │   └── Tooltip.tsx        # Interactive cursor tooltip
│   ├── Carousel/
│   │   ├── EventCarousel.tsx  # Horizontal event type selector
│   │   └── EventCard.tsx      # Individual event type card
│   └── shared/
│       ├── CurrencyInput.tsx
│       ├── PercentageSlider.tsx
│       └── DurationPicker.tsx
│
├── store/
│   ├── useAppStore.ts         # Zustand store
│   └── selectors.ts           # Derived state selectors
│
├── hooks/
│   ├── useSimulation.ts       # Runs engine on state changes
│   ├── useDragToTimeline.ts   # Drag-to-graph coordination
│   └── useGraphDimensions.ts  # Responsive graph sizing
│
└── utils/
    ├── formatting.ts          # Currency, date, percentage formatters
    └── colors.ts              # Event type color palette
```

---

## 10. Event Lifecycle — Complete Flow

```
                    ┌─────────────────────────────┐
                    │     EVENT CAROUSEL           │
                    │  User clicks event type      │
                    └─────────┬───────────────────┘
                              │
                              ▼
                    ┌─────────────────────────────┐
                    │     EVENT FORM               │
                    │  Form fields populate        │
                    │  User fills in details       │
                    └─────────┬───────────────────┘
                              │
                              ▼
                    ┌─────────────────────────────┐
                    │     DRAGGABLE ICON           │
                    │  Appears at form bottom      │
                    │  User grabs it               │
                    └─────────┬───────────────────┘
                              │
                              ▼
                    ┌─────────────────────────────┐
                    │     DRAG OVER GRAPH          │
                    │  Time indicator follows      │
                    │  cursor on x-axis            │
                    │  Preview: faint curve shows  │
                    │  what would happen           │
                    └─────────┬───────────────────┘
                              │
                              ▼
                    ┌─────────────────────────────┐
                    │     DROP ON TIMELINE         │
                    │  Event committed to state    │
                    │  Engine recalculates         │
                    │  Graph animates to new curve │
                    │  Marker appears on timeline  │
                    └─────────┬───────────────────┘
                              │
                              ▼
                    ┌─────────────────────────────┐
                    │     POST-DROP                │
                    │  Click marker → re-edit      │
                    │  Drag marker → move in time  │
                    │  Right-click → delete event  │
                    └─────────────────────────────┘
```

---

## 11. Design Direction Notes

### Aesthetic: "Financial Observatory"
The app should feel like looking through a telescope at your financial future. Dark background (deep navy / charcoal), glowing curves, subtle grid lines, high-contrast data. Think Bloomberg terminal meets Apple — data-dense but elegant.

### Color Palette per Event Type
| Event | Primary Color | Accent |
|---|---|---|
| 💼 Career | Amber (#F59E0B) | Gold |
| 🏠 Asset/Liability | Emerald (#10B981) / Rose (#F43F5E) | Jade / Crimson |
| 📈 Investment | Electric Blue (#3B82F6) | Cyan |
| 👶 Life Event | Violet (#8B5CF6) | Lavender |
| 🌍 Macro Economy | Slate (#64748B) | Storm grey |

### The Compound Growth Moment
The single most important visual: when a user adds an investment event with recurring contributions, the graph should **dramatically** show the exponential curve separating from linear. Consider adding a subtle glow or particle trail along the curve where compound growth accelerates most. This is the "aha moment" — the reason the app exists.

---

## 12. Implementation Phases (as built)

### Phase 1 — MVP vertical slice
- Two-column layout + carousel event picker
- Investment event end-to-end (form → timeline → simulation → chart)
- D3 line chart of net worth vs month
- Core calculation engine

### Phase 2 — Full event system
- All six event types (career, asset/liability, investment, life, macro, windfall) with dynamic forms
- Full drag-and-drop to timeline (carousel → graph; marker reposition; delete)
- D3 graph with stacked asset breakdown, markers, tooltips, milestone annotations
- Macro environment modifier (inflation, market returns, pool yield)

### Phase 3 — Polish & delight
- Framer Motion transitions (graph card, carousel, mobile sheet)
- Milestone chips + milestone lines on the graph; income-gap shading
- Real/nominal toggle, linear reference, stress-test overlay, ghost curve
- Savings-pool model with shortfall badges; life-timeline ruler; zoom/pan brush
- localStorage persistence; bilingual UI (en + pt-BR); responsive mobile layout

---

*This document describes the current implementation.*
