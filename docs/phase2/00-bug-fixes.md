# Bug Fixes — Pre-Phase 2 Cleanup

Fix these issues before starting any Phase 2 feature work.

---

## Bug 1 — HTML title still says "vite-tmp"

**File:** `index.html`, line 7

**Fix:** Change `<title>vite-tmp</title>` to `<title>NetWorth Visualizer</title>`

---

## Bug 2 — Unused `recharts` dependency

**File:** `package.json`

**Fix:** Remove `"recharts"` from the `dependencies` block and run `npm install` to update `package-lock.json`. The app uses D3 for all graph rendering; recharts is never imported anywhere in the codebase.

---

## Bug 3 — Three graph sub-components return `null`

**Files:**
- `src/components/Graph/Tooltip.tsx`
- `src/components/Graph/Milestones.tsx`
- `src/components/Graph/EventMarkers.tsx`

These are placeholder stubs that render nothing. They are exported but never used in `NetWorthGraph.tsx` or anywhere else.

**Fix:** The underlying logic already exists in the engine (`detectMilestones` in `src/engine/milestones.ts`) and the D3 rendering in `src/components/Graph/GraphLayers.ts`. These three component files should be implemented as part of Phase 2 feature work (see `04-milestone-timeline.md`). For now, leave them as stubs — do **not** delete them.

---

## Verification

After fixes, confirm:
- `npm run build` — green
- `npm run test` — all 37 tests pass
- `npm run lint` — zero errors
- Browser tab shows "NetWorth Visualizer"
