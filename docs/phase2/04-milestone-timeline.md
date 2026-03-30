# Milestone Timeline Bar

## Goal
A secondary horizontal bar directly below the graph that shows when each financial milestone is hit: debt-free, first $100K, $500K, $1M, retirement-ready, etc. Clicking a milestone marker scrolls the graph to that point in time.

---

## Existing foundation

`src/engine/milestones.ts` already has `detectMilestones()` returning crossings for $100K, $500K, $1M. The Zustand store already holds `milestones: Milestone[]`. The graph has placeholder components `Milestones.tsx` and `EventMarkers.tsx` that currently return `null`.

---

## Engine updates — `src/engine/milestones.ts`

Extend `detectMilestones()` to also detect:

| Milestone | Condition |
|---|---|
| Debt-Free | `totalLiabilities` drops to 0 for the first time |
| $100K | `netWorth` crosses $100,000 upward |
| $500K | `netWorth` crosses $500,000 upward |
| $1M | `netWorth` crosses $1,000,000 upward |
| $2M | `netWorth` crosses $2,000,000 upward |
| Negative → Zero | `netWorth` crosses 0 upward (recovery from negative) |

Return type stays `Milestone[]`. Add a `type` field to the `Milestone` interface:
```
interface Milestone {
  type: 'debt-free' | '100k' | '500k' | '1m' | '2m' | 'zero-crossing'
  month: number
  value: number
  label: string   // human-readable: "Debt Free", "First $100K", etc.
}
```

---

## Timeline bar component — `src/components/Graph/MilestoneTimeline.tsx`

New component. Rendered as a thin horizontal strip (~32px tall) directly below the main graph SVG, sharing the same left/right padding so the x-axis aligns perfectly.

- Uses the same D3 x-scale from the parent `NetWorthGraph` (pass it as a prop).
- For each milestone, render a small vertical tick + icon + label:
  - Tick: 1px vertical line, 8px tall, colour matches milestone type.
  - Icon: small emoji or SVG icon (🏁 debt-free, 💰 $100K–$2M).
  - Label: milestone name in 10px text, rotated 45° if tight spacing.
- On hover, show a tooltip with: label, exact date, net worth at that month.
- On click, call a `onMilestoneClick(month)` callback — the parent `NetWorthGraph` uses this to animate the graph's `zoomRange` to centre on that month (±24 months around the milestone).

---

## Implement `src/components/Graph/Milestones.tsx`

This stub currently returns `null`. Replace it with rendering logic for the **vertical milestone lines on the graph** (already described in the architecture §6.2 Layer 7):

- For each milestone, draw a vertical dashed line at the milestone's x-position, full height of the graph, low opacity (0.3).
- Draw a small annotation label at the top of the line (e.g. "💰 $1M · 2041").
- The label background should be a semi-transparent dark pill to remain readable over the curve.

---

## Implement `src/components/Graph/EventMarkers.tsx`

This stub currently returns `null`. Replace it with:

- For each event in `events` that has a `startMonth`, draw a small circular marker on the x-axis at that month's x-position.
- The marker uses the event's colour from `utils/colors.ts` and the event type's emoji.
- On hover: show a tooltip with event name, type, start date, and a one-line impact summary (e.g. "Monthly contribution: $500 · Return: 8%").
- On click: call `setEditingEventId(event.id)` to open the event in the form panel.

---

## Integration in `NetWorthGraph.tsx`

- Render `<MilestoneTimeline />` below the SVG, passing the x-scale and milestones.
- Render `<Milestones />` and `<EventMarkers />` as SVG `<g>` layers inside the main SVG (they are already architecture Layer 7 and Layer 6).
- The milestone chip strip already exists below the graph (from Stage 9). Keep it — the new `MilestoneTimeline` complements it as a more precise timeline-aligned version.

---

## Constraints

- No new npm dependencies.
- If no milestones are detected (empty events), the timeline bar is hidden entirely (zero height).
- Milestone lines on the graph respect the existing `zoomRange` — only show markers in the visible month range.
