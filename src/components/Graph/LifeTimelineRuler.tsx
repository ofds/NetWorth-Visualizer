import * as d3 from 'd3'
import { useMemo } from 'react'
import type { TFunction } from 'i18next'
import { eventTimelineSegment, simulationHorizonMonths } from '../../engine/simulate'
import type { FinancialEvent } from '../../events/types'
import { eventColorFor, eventTintHex } from '../../utils/colors'
import { GRAPH_MARGIN } from './GraphLayers'

type RowEv = { id: string; name: string; start: number; end: number; color: string }

function assignRows(rows: RowEv[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  const lastEndByRow: number[] = []
  const out = new Map<string, number>()
  for (const e of sorted) {
    let r = 0
    while (lastEndByRow[r] !== undefined && e.start <= lastEndByRow[r]!) {
      r += 1
    }
    out.set(e.id, r)
    lastEndByRow[r] = e.end
  }
  return out
}

const ROW_H = 15
const PAD_TOP = 4
/** First row Y when the section title is rendered in the parent (no title in SVG). */
const BODY_FIRST_ROW_Y = 6
const TRACK_H = 6

export type LifeTimelineHeightOptions = {
  /** When false, height excludes the in-SVG title row (parent renders the heading). */
  titleInSvg?: boolean
}

export function computeLifeTimelineRulerHeight(
  events: FinancialEvent[],
  projectionYears: number,
  options?: LifeTimelineHeightOptions,
): number {
  const titleInSvg = options?.titleInSvg !== false
  const months = simulationHorizonMonths(projectionYears)
  const list: RowEv[] = events.map((e) => {
    const seg = eventTimelineSegment(e, events, months)
    return {
      id: e.id,
      name: e.name,
      start: seg.start,
      end: seg.end,
      color: eventColorFor(e),
    }
  })
  const rowById = assignRows(list)
  const maxR = list.length === 0 ? 0 : Math.max(...[...rowById.values()], 0)
  if (titleInSvg) {
    return Math.min(140, Math.max(32, PAD_TOP + 18 + (maxR + 1) * ROW_H))
  }
  return Math.min(
    140,
    Math.max(20, PAD_TOP + BODY_FIRST_ROW_Y + maxR * ROW_H + TRACK_H),
  )
}

type Props = {
  id?: string
  width: number
  height: number
  events: FinancialEvent[]
  projectionYears: number
  currentAge: number | undefined
  translate: TFunction
  /** When false, the heading is not drawn in SVG (parent provides the clickable title). */
  titleInSvg?: boolean
  /** Opens the event in the editor (same as graph marker / timeline list). */
  onSelectEvent?: (eventId: string) => void
}

export function LifeTimelineRuler({
  id,
  width,
  height,
  events,
  projectionYears,
  currentAge,
  translate,
  titleInSvg = true,
  onSelectEvent,
}: Props) {
  const months = simulationHorizonMonths(projectionYears)
  const xMax = Math.max(1, months - 1)

  const { left, right } = GRAPH_MARGIN
  const innerW = Math.max(0, width - left - right)

  const rows = useMemo(() => {
    const list: RowEv[] = events.map((e) => {
      const seg = eventTimelineSegment(e, events, months)
      return {
        id: e.id,
        name: e.name,
        start: seg.start,
        end: seg.end,
        color: eventColorFor(e),
      }
    })
    const rowById = assignRows(list)
    return { list, rowById }
  }, [events, months])

  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, xMax]).range([0, innerW]),
    [xMax, innerW],
  )

  if (width < 16 || height < 12 || innerW <= 0) return null

  return (
    <svg
      id={id}
      className="block w-full shrink-0 text-slate-400"
      width={width}
      height={height}
      role={onSelectEvent ? 'none' : 'presentation'}
      aria-hidden={!onSelectEvent}
    >
      <g transform={`translate(${left},${PAD_TOP})`}>
        {titleInSvg ? (
          <text
            x={0}
            y={11}
            fill="#64748b"
            fontSize={9}
            fontWeight={600}
            className="tabular-nums"
          >
            {translate('graph.lifeRulerTitle')}
          </text>
        ) : null}
        {rows.list.map((e) => {
          const r = rows.rowById.get(e.id) ?? 0
          const y = (titleInSvg ? 18 : BODY_FIRST_ROW_Y) + r * ROW_H
          const x0 = xScale(e.start)
          const x1 = xScale(e.end)
          const w = Math.max(2, x1 - x0)
          const ageAtStart =
            currentAge !== undefined
              ? translate('graph.lifeRulerAge', {
                  age: String(Math.floor(currentAge + e.start / 12)),
                })
              : null
          return (
            <g key={e.id}>
              <title>
                {e.name}
                {ageAtStart ? ` · ${ageAtStart}` : ''}
              </title>
              <rect
                x={x0}
                y={y}
                width={w}
                height={TRACK_H}
                rx={2}
                fill={eventTintHex(e.color, '28')}
                stroke={e.color}
                strokeOpacity={0.55}
                strokeWidth={1}
                style={{ cursor: onSelectEvent ? 'pointer' : undefined }}
                tabIndex={onSelectEvent ? 0 : undefined}
                role={onSelectEvent ? 'button' : undefined}
                aria-label={onSelectEvent ? e.name : undefined}
                onClick={(ev) => {
                  ev.stopPropagation()
                  onSelectEvent?.(e.id)
                }}
                onKeyDown={(ev) => {
                  if (!onSelectEvent) return
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    ev.stopPropagation()
                    onSelectEvent(e.id)
                  }
                }}
              />
              <text
                x={x0 + 3}
                y={y + TRACK_H - 1}
                fill={e.color}
                fontSize={8}
                className="pointer-events-none"
              >
                {e.name.length > 22 ? `${e.name.slice(0, 20)}…` : e.name}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
