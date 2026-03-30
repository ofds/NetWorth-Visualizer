# Income & Expense Sparklines

## Goal
Show small inline sparklines (mini charts) in the event form panel so users can see the cash-flow impact of their events over time while they are filling in the form — before they commit the event to the timeline.

---

## Where they appear

At the bottom of the left-column event form, below the form fields and above the draggable icon. Render a compact two-row sparkline panel:

```
Monthly Cash Flow
Income  ████████████████████▓▓▓░░░░
Savings ▓▓▓▓▓▓▓████████████████████
```

Each sparkline is ~100% width of the form panel × 32px tall.

---

## Component — `src/components/EventForm/CashFlowSparklines.tsx`

New component. Props:
```typescript
interface CashFlowSparklinesProps {
  simulation: MonthSnapshot[]   // from the store
  highlightEventId: string | null  // the event currently being edited
}
```

Renders two SVG sparklines side by side (or stacked):

### Sparkline 1 — Monthly Net Income
- Data: `simulation.map(s => s.netIncome)`.
- Colour: Amber (`#F59E0B`) — matches Career event colour.
- Y-axis: auto-scaled to min/max of the data.
- No axes, no labels — pure sparkline.

### Sparkline 2 — Monthly Savings
- Data: `simulation.map(s => s.monthlySavings)`.
- Colour: Electric Blue (`#3B82F6`) for positive values, Rose (`#F43F5E`) for negative (months where expenses exceed income).
- Render as a filled area chart — positive values fill upward from the zero baseline, negative values fill downward.

### Highlight band
If `highlightEventId` is set, shade the months during which that event is active with a faint vertical band (opacity 0.15, colour matches the event type). This visually shows "this event changes your cash flow here".

### Hover interaction
On mouse move over either sparkline, show a shared vertical cursor line and a small tooltip with:
- Month + year
- Net income at that month
- Monthly savings at that month

---

## When to show

Show the sparklines whenever:
1. `simulation` has at least 1 month of data (i.e., at least one event has been committed to the timeline).
2. The user is in the form panel (i.e., `selectedEventType` is not null).

If no simulation exists yet (empty timeline), show a placeholder text: "Add an event to the timeline to see cash flow projections."

---

## Implementation notes

Use D3 `line()` and `area()` generators directly — same pattern as `GraphLayers.ts`. Mount them via `useEffect` on an SVG ref. Rerender when `simulation` changes.

The sparklines share the same x-scale (months 0..projectionYears×12) as the main graph so the visual rhythm feels consistent.

Keep the SVG rendering lightweight — no transitions or animations needed here. These are informational glanceable charts, not the hero visualisation.

---

## Layout in `AppShell.tsx`

In the left column, between the form fields section and the draggable icon section, insert:
```jsx
{simulation.length > 0 && editingEventId && (
  <CashFlowSparklines
    simulation={simulation}
    highlightEventId={editingEventId}
  />
)}
```

Wrap in a collapsible section labelled "Cash Flow Preview" with a small chevron toggle so users can hide it if they want more form space.

---

## Constraints

- No new npm dependencies.
- The sparklines must never affect simulation state — read-only consumers of the existing `simulation` from the store.
- On mobile (narrow screens), hide the sparklines entirely to save vertical space. Use the existing `useMediaQuery` hook to detect `< 640px`.
