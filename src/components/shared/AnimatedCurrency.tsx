import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AppLang } from '../../store/useAppStore'
import { useAnimatedMetric } from '../../hooks/useAnimatedMetric'
import { formatCurrency } from '../../utils/formatting'

function splitIntoCells(s: string): { isDigit: boolean; ch: string }[] {
  return [...s].map((ch) => ({ isDigit: ch >= '0' && ch <= '9', ch }))
}

type Props = {
  amount: number
  currency: string
  lang: AppLang
  durationMs?: number
  enabled?: boolean
  /** When false, shows formatted amount only (no RAF / digit roll). Use while dragging markers to avoid feedback with rapid target updates. */
  animate?: boolean
  className?: string
}

/**
 * Currency display with scalar easing plus a short per-digit motion on each amount change
 * (including digits that match before/after), so unchanged columns still “tick” like an odometer.
 */
export function AnimatedCurrency({
  amount,
  currency,
  lang,
  durationMs = 280,
  enabled = true,
  animate = true,
  className,
}: Props) {
  const display = useAnimatedMetric(amount, { durationMs, enabled: enabled && animate })
  const str = formatCurrency(display, currency, lang)

  const roundedTarget = Math.round(amount)
  const prevRoundedRef = useRef(roundedTarget)
  const [rollGen, setRollGen] = useState(0)

  useLayoutEffect(() => {
    if (!animate) return
    if (roundedTarget !== prevRoundedRef.current) {
      prevRoundedRef.current = roundedTarget
      setRollGen((g) => g + 1)
    }
  }, [roundedTarget, animate])

  if (!animate) {
    return <span className={className}>{str}</span>
  }

  const cells = splitIntoCells(str)

  let digitIndex = 0
  const nodes: ReactNode[] = []
  for (let i = 0; i < cells.length; i++) {
    const { isDigit, ch } = cells[i]!
    if (!isDigit) {
      nodes.push(<span key={`t-${i}`}>{ch}</span>)
      continue
    }
    const di = digitIndex
    digitIndex += 1
    nodes.push(
      <span
        key={`d-${rollGen}-${di}`}
        className="nw-digit-roll inline-block tabular-nums"
        style={{ animationDelay: `${di * 18}ms` }}
      >
        {ch}
      </span>,
    )
  }

  return <span className={className}>{nodes}</span>
}
