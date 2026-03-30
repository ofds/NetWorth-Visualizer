# Plan: Language Translation — English + Portuguese (pt-BR)

## Goal

Add internationalization (i18n) support to NetWorth Visualizer, enabling users to switch between **English (en)** and **Brazilian Portuguese (pt-BR)**. All UI strings are currently hardcoded in English; this plan extracts them into translation files and wires up a language switcher.

---

## Chosen Library: `react-i18next`

**Why:** Mature, well-maintained, tree-shakeable, works seamlessly with React 19 + Vite + TypeScript. Minimal runtime overhead. Supports lazy-loading translation files.

**Packages to install:**
```bash
npm install i18next react-i18next
```

No backend plugin needed — translations will be bundled as static JSON files.

---

## File Structure

```
src/
  i18n/
    index.ts              ← i18next initialization
    locales/
      en.json             ← English strings (source of truth)
      pt-BR.json          ← Portuguese strings
```

---

## Implementation Steps

### Step 1 — Install & configure i18next

Create `src/i18n/index.ts`:

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

i18n.use(initReactI18next).init({
  resources: {
    en:    { translation: en },
    'pt-BR': { translation: ptBR },
  },
  lng: localStorage.getItem('lang') ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
```

Import it in `src/main.tsx` before the app renders:
```ts
import './i18n';
```

---

### Step 2 — Persist language choice in Zustand store

Add `lang: 'en' | 'pt-BR'` to `AppState` in `src/store/useAppStore.ts`:

```ts
lang: 'en' | 'pt-BR';
setLang: (lang: 'en' | 'pt-BR') => void;
```

In `setLang`, call `i18n.changeLanguage(lang)` and `localStorage.setItem('lang', lang)`.

Include `lang` in the persisted keys alongside `currency`.

---

### Step 3 — Replace hardcoded strings in components

Use the `useTranslation` hook:

```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
// Before: <span>Settings</span>
// After:  <span>{t('settings.title')}</span>
```

#### Components to update

| Component | Key strings |
|---|---|
| `AppShell.tsx` | App title, sidebar section headers, toggles, footer note |
| `HeroKpiStrip.tsx` | "End", "Savings pool", delta labels |
| `EventCarousel.tsx` | Category names & descriptions (Career, Asset/Loan, etc.) |
| `EventForm.tsx` | Section titles, field labels, presets ("Now", "In 3 months"), help text |
| `NetWorthGraph` + tooltips | Axis labels, legend entries, tooltip text |
| Event defaults (`src/events/`) | Event name defaults shown in form |

---

### Step 4 — Build translation files

#### `src/i18n/locales/en.json` (excerpt)

```json
{
  "app": {
    "title": "NetWorth Visualizer",
    "tagline": "Local only · data stays in this browser"
  },
  "settings": {
    "title": "Settings",
    "horizon": "Horizon (years)",
    "realDollars": "Real $",
    "linearRef": "Linear ref",
    "breakdown": "Breakdown",
    "mcNote": "MC note"
  },
  "editor": {
    "title": "Event editor"
  },
  "carousel": {
    "career":     { "label": "Career",      "desc": "Salary, tax & savings rate" },
    "assetLoan":  { "label": "Asset / Loan","desc": "House, car, mortgage" },
    "investment": { "label": "Investment",  "desc": "Portfolio, stocks, funds" },
    "life":       { "label": "Life",        "desc": "Kids, education, big expenses" },
    "macro":      { "label": "Macro",       "desc": "Inflation, market returns" }
  },
  "form": {
    "sections": {
      "basics": "Basics",
      "timing": "Timing",
      "projection": "Projection"
    },
    "presets": {
      "now":        "Now",
      "in3months":  "In 3 months",
      "in1year":    "In 1 year",
      "in3years":   "In 3 years",
      "in5years":   "In 5 years"
    }
  },
  "graph": {
    "netWorth": "Net Worth",
    "savingsPool": "Savings pool",
    "end": "End"
  },
  "lang": {
    "en":   "English",
    "ptBR": "Português"
  }
}
```

#### `src/i18n/locales/pt-BR.json` (excerpt)

```json
{
  "app": {
    "title": "Visualizador de Patrimônio",
    "tagline": "Apenas local · dados ficam neste navegador"
  },
  "settings": {
    "title": "Configurações",
    "horizon": "Horizonte (anos)",
    "realDollars": "R$ real",
    "linearRef": "Ref. linear",
    "breakdown": "Detalhamento",
    "mcNote": "Nota MC"
  },
  "editor": {
    "title": "Editor de eventos"
  },
  "carousel": {
    "career":     { "label": "Carreira",      "desc": "Salário, impostos e taxa de poupança" },
    "assetLoan":  { "label": "Ativo / Dívida","desc": "Casa, carro, financiamento" },
    "investment": { "label": "Investimento",  "desc": "Carteira, ações, fundos" },
    "life":       { "label": "Vida",          "desc": "Filhos, educação, grandes gastos" },
    "macro":      { "label": "Macro",         "desc": "Inflação, retornos de mercado" }
  },
  "form": {
    "sections": {
      "basics": "Básico",
      "timing": "Período",
      "projection": "Projeção"
    },
    "presets": {
      "now":        "Agora",
      "in3months":  "Em 3 meses",
      "in1year":    "Em 1 ano",
      "in3years":   "Em 3 anos",
      "in5years":   "Em 5 anos"
    }
  },
  "graph": {
    "netWorth": "Patrimônio Líquido",
    "savingsPool": "Reserva",
    "end": "Final"
  },
  "lang": {
    "en":   "English",
    "ptBR": "Português"
  }
}
```

> **Note:** A full audit pass over all components is required to capture every string before shipping. The excerpts above cover the most prominent ones.

---

### Step 5 — Language switcher UI

Add a small toggle/dropdown to `AppShell.tsx` in the settings panel:

```tsx
const { i18n } = useTranslation();

<select
  value={i18n.language}
  onChange={e => setLang(e.target.value as 'en' | 'pt-BR')}
  className="..."
>
  <option value="en">English</option>
  <option value="pt-BR">Português</option>
</select>
```

Placement: bottom of the settings sidebar (desktop) / settings section in mobile sheet.

---

### Step 6 — Number & currency formatting

The app already uses `Intl.NumberFormat` in `src/utils/formatting.ts`. Update the locale parameter to follow the active language:

```ts
// Before (hardcoded):
new Intl.NumberFormat('en-US', { currency: 'USD', ... })

// After (dynamic):
new Intl.NumberFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en-US', {
  currency: store.currency,
  ...
})
```

This ensures number separators (1.000,00 vs 1,000.00) match the selected locale automatically.

---

### Step 7 — Update e2e tests

The Playwright tests in `/e2e` use hardcoded English text selectors. After migration:

- Add a helper `setLanguage(page, 'en')` fixture that forces English before each test, keeping existing assertions intact.
- Add a new `i18n.spec.ts` test that switches to Portuguese and verifies key strings render correctly.

---

## Out of Scope (this iteration)

- RTL language support
- More than two languages
- Server-side or CDN-hosted translation bundles
- Automatic locale detection via browser `navigator.language` (can be added later)

---

## Audit: hardcoded strings (full pass)

Inventory of user-visible English (or English-derived) copy as of this audit. Excludes **user-authored** event names, `data-testid` values, and purely numeric formatting where no words are involved. **System-generated** milestone titles (from the engine) and any future UI that reads `assetBreakdown[].label` still need translation keys.

### How this list was built (and what it might still miss)

The first pass was **manual**: glob `src/**/*.tsx`, read each layout/form/graph/carousel file end-to-end, plus `index.html`, `src/events/defaults.ts`, and `e2e/`. That is **not** the same as an exhaustive static search.

A **second verification** used `rg` over `src/` for `aria-label`, `title`, `placeholder`, and loose JSX text patterns, and a scan of `src/engine/` / `src/store/` for `label:` / `message:` literals. That turned up **`src/engine/milestones.ts`**, which the manual component-only pass had missed.

**Residual risk:** strings built only from template literals without matching those patterns, copy in new files, or UI added after this doc. Before shipping translations, re-run a targeted search (e.g. `label: '`, `` `Edit ${` ``, `FieldHint text=`, and JSX text between `>` and `<`) and walk any file that defines `label:` / `title:` for the DOM.

### Engine & data layer (not only components)

- **`src/engine/milestones.ts`** — `NET_WORTH_MILESTONE_THRESHOLDS` **labels**: “$100K net worth”, “$500K net worth”, “$1M net worth” (shown in the shell milestone strip and graph milestone tooltips via `{label}`).
- **`src/engine/simulate.ts`** — `assetBreakdown` entries use English **labels** (“Cash”, “Savings Pool”, “Investments”, “Physical”). Not referenced by the React UI today; include in i18n if any view starts rendering `snapshot.assetBreakdown`.

### Shell & layout

- **`index.html`** — Document `<title>`; `<html lang="en">` should follow active locale when i18n ships.
- **`src/components/Layout/AppShell.tsx`** — “Settings”; “Horizon (years)”; toggle labels “Real $”, “Linear ref”, “Breakdown”, “MC note”; “Event editor”; “NetWorth Visualizer”; tagline “Local only · data stays in this browser”; mobile title “NetWorth”; “Edit events”; empty-state headline “Map your financial future”, body “Pick a category in the strip below, then add events.”, cue “↓ Carousel”; milestone chips `{label} @ M{month}` (`label` from **`milestones.ts`**); sheet title “Events”; button “Close”.
- **`src/components/Layout/HeroKpiStrip.tsx`** — “End · {years}y / {months}m”; “Savings pool”; “start …”; “alt …”.
- **`src/components/Layout/TimelineList.tsx`** — *(not imported by the app today; still contains copy)* — heading “Timeline”; “{n} event(s)”; `aria-label` “Delete {name}”, “Reorder {name}”.

### Carousel & drag affordances

- **`src/components/Carousel/EventCarousel.tsx`** — Hint “Pick a type below”; `aria-label` “Event types”; five category **labels** and **descriptions** (Career, Asset / Loan, Investment, Life, Macro — descriptions differ slightly from the excerpt table in Step 4 for Investment / Life / Macro).
- **`src/components/Carousel/EventCard.tsx`** — No literals; displays strings passed from `EventCarousel`.
- **`src/components/EventForm/DraggableIcon.tsx`** — `title` “Drag onto the chart to place on the timeline (sets start month)”; `aria-label` “Drag onto chart to add or move this event on the timeline”; helper “Grab the handle — drop on the glowing chart area.”

### Event form

- **`src/components/EventForm/EventForm.tsx`** — Empty-state paragraph (mentions “Event editor”, chart, strip); **HorizonPreviewLine** strings (“Horizon: …”, “Δ negligible”, “vs current plan at horizon”, “total”); section titles **Basics**, **Income**, **Tax & savings**, **Duration**, **Asset / loan**, **Contributions**, **Growth & horizon**, **Life impact**, **Macro**; **StartMonthField** — label “When it starts”; presets **Now**, **In 3 months**, **In 6 months**, **In 1 year**, **In 2 years**, **In 5 years**; option “Custom (month index)…”; help “Month 0 is the first month…”; label **Name**; all **FieldHint** tooltips and **AmountPercentSlider** `percentLabel` / `amountSuffix` / `hint` fragments (e.g. “% of net”, “/mo tax”, “Net …/mo after tax”, “No financed balance”, “Lump sum” / “Recurring” options, “Monthly gross”, “Savings rate”, “Effective tax rate”, “Mode”, **Asset** / **Liability**, **Principal**, **Down payment**, **APR**, **Term (years)**, **Value change / yr (asset)**, investment pool callout block (“Savings pool — money for investments”, “Entering month …”, “After month …”, “(plan)”, shortfall copy, etc.), life/macro field labels and hints; macro labels including **Duration (years)**, **Severity (1–10)**.

### Graph & axis helpers

- **`src/components/Graph/NetWorthGraph.tsx`** — `kindShortLabel` per event kind (Career, Investment, Life, Macro, Asset / loan); **axisMoney** uses a **$** prefix and **M**/**k** suffixes; SVG `<title>` for milestones “{label} · first crossed in month {n}”; placeholder text “Monte Carlo cone — Phase 2”; `aria-label` “Net worth projection”; tooltip header uses `xAxisMonthTicks` format plus “ · month {n}”; pin help (“Pinned — click…”, “Unpin”, “Click the plot to pin…”); breakdown labels **Cash**, **Savings Pool**, **Pool interest**, **Inv. shortfall**, **Investments**, **Physical**; **Active events**; “None (baseline only).”; buttons **Edit**; `aria-label` “Edit {name}” / “Delete {name}”.
- **`src/components/Graph/GraphLayers.ts`** — X-axis tick labels **`M{m}`** and **`Y{y}`** (year index, not calendar).
- **`src/components/Graph/DropZone.tsx`**, **`Tooltip.tsx`**, **`EventMarkers.tsx`**, **`Milestones.tsx`** — No user-facing strings (stubs or chrome only).

### Shared inputs

- **`src/components/shared/DurationPicker.tsx`** — Presets “Ongoing (∞)”, “12 months”, “24 months”, “60 months”; “Custom…”; placeholder “Months”.
- **`src/components/shared/DurationPicker.tsx` (`DurationYearPicker`)** — Presets “Ongoing (∞)”, “5 years”, “10 years”, “20 years”; “Custom…”; placeholder “Years”.
- **`src/components/shared/PercentageSlider.tsx`** (`AmountPercentSlider`) — No fixed English; parents pass all wording.
- **`src/components/shared/CurrencyInput.tsx`**, **`FieldHint.tsx`** — No fixed sentences (`FieldHint` shows “?” only; hint text comes from `EventForm`).

### Defaults & app root

- **`src/events/defaults.ts`** — Default **name** strings for new events: “New role”, “Home purchase”, “Index fund”, “Life change”, “Economic phase”.
- **`src/App.tsx`** — No copy.

### Tests (follow-up, not components)

- **`e2e/graph.spec.ts`** — Assertions on English heading text; plan Step 7 covers migrating selectors.

---

## Rollout Checklist

- [ ] Install `i18next` + `react-i18next`
- [ ] Create `src/i18n/index.ts`
- [ ] Import i18n in `main.tsx`
- [ ] Add `lang` field to Zustand store + persistence
- [ ] Audit all components for hardcoded strings — see [Audit: hardcoded strings (full pass)](#audit-hardcoded-strings-full-pass) above
- [ ] Build `en.json` (source of truth, complete)
- [ ] Build `pt-BR.json` (complete translation)
- [ ] Replace hardcoded strings in all components with `t()` calls
- [ ] Update `formatting.ts` locale
- [ ] Add language switcher to `AppShell`
- [ ] Manual QA: switch language, reload, verify persistence
- [ ] Update e2e tests
