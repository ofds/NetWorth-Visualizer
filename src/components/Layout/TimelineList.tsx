import type { TFunction } from 'i18next'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import type { FinancialEvent } from '../../events/types'
import { eventColorFor, eventTintHex } from '../../utils/colors'

function SortableRow({
  ev,
  index,
  onSelect,
  onRemove,
  t,
}: {
  ev: FinancialEvent
  index: number
  onSelect: () => void
  onRemove: () => void
  t: TFunction
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ev.id,
  })
  const color = eventColorFor(ev)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftColor: color,
    backgroundColor: eventTintHex(color, '22'),
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-0.5 rounded-md border border-slate-800/90 border-l-[3px] bg-slate-900/50 pl-0.5 pr-0.5 ${
        isDragging ? 'z-10 opacity-90 shadow-lg ring-1 ring-teal-500/30' : ''
      }`}
    >
      <button
        type="button"
        className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-rose-950/50 hover:text-rose-400"
        aria-label={t('timeline.deleteAria', { name: ev.name })}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
      <button
        type="button"
        className="cursor-grab touch-none shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing"
        aria-label={t('timeline.reorderAria', { name: ev.name })}
        {...attributes}
        {...listeners}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 6h2v2H8V6zm0 5h2v2H8v-2zm0 5h2v2H8v-2zm5-10h2v2h-2V6zm0 5h2v2h-2v-2zm0 5h2v2h-2v-2z" />
        </svg>
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 truncate py-1.5 text-left text-sm text-slate-300 hover:text-white"
        onClick={onSelect}
      >
        {ev.name}
      </button>
      <span className="font-figures shrink-0 pr-1 text-[10px] text-slate-600 tabular-nums">#{index + 1}</span>
    </li>
  )
}

type Props = {
  events: FinancialEvent[]
  onSelect: (ev: FinancialEvent) => void
  onRemove: (id: string) => void
}

export function TimelineList({ events, onSelect, onRemove }: Props) {
  const { t } = useTranslation()
  const count = events.length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('timeline.title')}</h3>
        <span className="font-figures rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 tabular-nums">
          {t('timeline.event', { count })}
        </span>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-0.5 text-sm [scrollbar-gutter:stable]">
        <SortableContext items={events.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          {events.map((ev, index) => (
            <SortableRow
              key={`${ev.id}__${index}`}
              ev={ev}
              index={index}
              t={t}
              onSelect={() => onSelect(ev)}
              onRemove={() => onRemove(ev.id)}
            />
          ))}
        </SortableContext>
      </ul>
    </div>
  )
}
