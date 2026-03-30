# Export & Share

## Goal
Let users export their net worth projection as a PNG image or copy a shareable URL that encodes their scenario. No backend required — everything is client-side.

---

## Feature A — Export as PNG

### Trigger
An "Export PNG" button in the graph toggle row (top-right of the graph card).

### Implementation — `src/utils/exportGraph.ts`

New utility `exportGraphAsPng(svgElement: SVGSVGElement, filename: string)`:

1. Clone the SVG node with `svgElement.cloneNode(true)`.
2. Inline all computed CSS styles onto the clone using `window.getComputedStyle` — required because canvas rendering ignores external stylesheets.
3. Serialise the clone to a string with `XMLSerializer`.
4. Create an `<img>` element with a `data:image/svg+xml` src.
5. Once loaded, draw it onto an offscreen `<canvas>` at 2× device pixel ratio for retina quality.
6. Draw a dark background rectangle first (`#0f172a`) so the transparent graph background renders correctly.
7. Call `canvas.toBlob()` → create an object URL → trigger a hidden `<a download>` click.

The exported image must include:
- The graph SVG (curve, grid, milestones, event markers).
- A header strip (16px above the SVG) with: "NetWorth Visualizer" wordmark on the left, the export date on the right, both in white.
- A footer strip (12px below) with the projection's key stats: starting net worth, final net worth, and total years projected.

### Utility function signature
```typescript
export async function exportGraphAsPng(
  svgElement: SVGSVGElement,
  stats: { startNetWorth: number; finalNetWorth: number; projectionYears: number },
  filename?: string
): Promise<void>
```

---

## Feature B — Share via URL

### Trigger
A "Copy Link" button next to the Export button. On click, it encodes the current scenario into the URL hash and copies it to the clipboard. Shows a "Copied!" confirmation for 2 seconds.

### Encoding — `src/lib/shareUrl.ts`

New module with two functions:

**`encodeScenarioToUrl(events: FinancialEvent[], settings: ProjectionSettings): string`**
1. Serialize `{ events, settings }` to a JSON string.
2. Compress with `CompressionStream` (built into modern browsers, no library needed): `new CompressionStream('deflate-raw')`.
3. Base64url-encode the compressed bytes.
4. Return `window.location.origin + window.location.pathname + '#s=' + encoded`.

**`decodeScenarioFromUrl(hash: string): { events: FinancialEvent[], settings: ProjectionSettings } | null`**
1. Extract the `#s=` value.
2. Base64url-decode → decompress with `DecompressionStream('deflate-raw')`.
3. JSON.parse the result.
4. Return `null` on any error (malformed URL, decompression failure, JSON parse error) — never throw.

### Hydration — `src/main.tsx`

After the existing `hydrateStoreFromStorage()` call, check if `window.location.hash` starts with `#s=`. If so, call `decodeScenarioFromUrl` and, if successful, load those events into the store (overriding localStorage). Show a small toast notification: "Scenario loaded from shared link."

---

## Toast notification — `src/components/shared/Toast.tsx`

New lightweight component. A fixed-position bottom-center `div` that:
- Accepts a `message: string` and `duration: number` (default 2500ms).
- Fades in via a 200ms CSS transition, then fades out after `duration`.
- Uses Framer Motion `AnimatePresence` for enter/exit animation.
- Exposed via a simple imperative API: `showToast(message)` — stores state in a module-level Zustand slice or React context.

Used by: "Copied!" (share), "Scenario loaded from shared link" (hydration), and optionally by future features.

---

## Constraints

- No new npm dependencies — use browser-native `CompressionStream`, `canvas`, `Clipboard API`.
- `CompressionStream` is available in all modern browsers (Chrome 80+, Firefox 113+, Safari 16.4+). No polyfill needed; this is a modern-only app.
- The Share URL must be self-contained — opening it in a fresh browser tab with no localStorage must reproduce the full scenario.
- PNG export must work even when the graph has many events and milestones visible.
