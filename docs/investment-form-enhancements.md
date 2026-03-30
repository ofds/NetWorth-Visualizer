# Investment Event Form — Planned Enhancements

> Documented: 2026-03-30
> Context: Analysis of the current `InvestmentFields` component in `EventForm.tsx` and related engine/type files.

---

## Background

The `InvestmentEvent` type already has fields that are unused in the UI (`assetClass`, `showVolatilityCone`). The form currently has two sections: **Contributions** and **Growth & Horizon**. The proposals below build on the existing architecture without breaking current behavior.

---

## 1. Asset Class Selector *(Low effort, High value)*

**Status:** `assetClass` is already defined in `InvestmentEvent` and hardcoded to `'stocks'` in defaults. No engine changes needed.

**What to add:**
- A segmented control or icon-based selector for `assetClass`:
  `'stocks' | 'bonds' | 'real_estate' | 'crypto' | 'custom'`
- Should influence the default `expectedAnnualReturn` hint (e.g., 12% for stocks, 8% for real estate, 5% for bonds)
- Unlocks the **Payment Plan** section when `real_estate` is selected (see below)

**Files to touch:**
- `src/components/EventForm/EventForm.tsx` — add selector UI to `InvestmentFields`
- `src/events/defaults.ts` — no change needed (already defaults to `'stocks'`)

---

## 2. Payment Plan Section *(Medium effort, High value)*

**Status:** Not implemented for investments. Asset/Liability events already have loan logic in the engine (`loanMonthlyPayment`, `amortizationStep` in `formulas.ts`). PRICE is already implemented; SAC needs a new formula.

**When to show:** Only when `assetClass === 'real_estate'` (or a new "is financed?" toggle).

### Fields

| Field | Description |
|---|---|
| Is financed? | Toggle to enable/disable the payment plan section |
| Down payment | Portion paid upfront — maps to `initialAmount` or a new dedicated field |
| Financed amount | `principal - downPayment`, read-only or editable |
| Amortization system | `PRICE` or `SAC` — see below |
| Annual interest rate (APR) | Loan interest rate |
| Term (years) | Loan duration |
| Monthly payment | Calculated, read-only — updates live as fields change |

### PRICE vs SAC

Both are standard Brazilian amortization systems.

| | PRICE | SAC |
|---|---|---|
| Total monthly payment | **Fixed** | **Decreasing** over time |
| Principal portion | Increasing each month | **Fixed** (`principal / n`) |
| Interest portion | Decreasing each month | Decreasing each month |
| Formula status | **Already in `formulas.ts`** as `loanMonthlyPayment()` | **Needs adding** |

**SAC formula (to add in `formulas.ts`):**
```
monthly_principal = principal / term_months
monthly_interest  = remaining_balance × (annualApr / 12)
monthly_payment   = monthly_principal + monthly_interest
```
Payment decreases each month as the balance shrinks.

### Engine Changes Required

- Add `sacMonthlyPayment(balance, principal, annualApr, termMonths)` to `formulas.ts`
- Add `amortizationSystem: 'price' | 'sac'`, `financedAmount`, `loanApr`, `loanTermYears` fields to `InvestmentEvent` type (all optional/nullable)
- In `simulate.ts`, deduct the monthly financing cost from net worth when these fields are set, separate from the investment's compound growth

---

## 3. Risk & Volatility Section *(Low effort, Medium value)*

**Status:** `showVolatilityCone` is already in the type and hardcoded to `false`. No engine changes needed.

**What to add:**
- **Volatility cone toggle** — exposes `showVolatilityCone` boolean in the UI
- **Risk level** selector (Low / Medium / High) — cosmetic for now, could later influence return range hints or cone width

**Files to touch:**
- `src/components/EventForm/EventForm.tsx` — add toggle and selector to `InvestmentFields`

---

## 4. Contribution Escalation *(Medium effort, High value)*

**Status:** Not implemented. Monthly contributions are currently flat throughout the investment's lifetime.

**What to add:**
- **Annual contribution increase (%)** — e.g., "increase monthly contribution by 5% each year"
- Models salary raises being channeled into investments over time
- Optional field — `null` means no escalation (current behavior)

**Engine changes required:**
- Add `contributionEscalationRate: number | null` to `InvestmentEvent` type
- In `simulate.ts`, multiply `monthlyContribution` by `(1 + rate)^year` for each simulation month

---

## 5. Withdrawal / Exit Strategy *(High effort, High value)*

**Status:** Not implemented. Investments currently grow indefinitely or until `endMonth`.

**What to add:**
- **Withdrawal start month** — when to begin drawing from this investment
- **Monthly withdrawal amount or %** — fixed amount or percentage of balance
- Useful for modeling retirement drawdown, FIRE strategies, etc.

**Engine changes required:**
- Add `withdrawalStartMonth`, `withdrawalAmount`, `withdrawalMode: 'fixed' | 'percent'` to `InvestmentEvent` type
- In `simulate.ts`, subtract monthly withdrawal from investment balance after the start month

---

## Implementation Priority

| # | Feature | Effort | Value | Engine change? |
|---|---|---|---|---|
| 1 | Asset Class selector | Low | High | No |
| 2 | Payment Plan — PRICE | Medium | High | Yes (minor) |
| 3 | Payment Plan — SAC | Medium | High | Yes (add formula) |
| 4 | Risk & Volatility toggles | Low | Medium | No |
| 5 | Contribution Escalation | Medium | High | Yes |
| 6 | Withdrawal Strategy | High | High | Yes (significant) |

**Recommended order:** Asset Class → Payment Plan (PRICE first, then SAC) → Contribution Escalation → Risk & Volatility → Withdrawal Strategy.
