import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { eventEmoji } from '../../events/eventEmoji'
import type { FinancialEvent } from '../../events/types'
import { eventColorFor, eventTintHex } from '../../utils/colors'

type Props = {
  draft: FinancialEvent
  disabled?: boolean
  /** `inline` = icon only, for the timeline / editor divider */
  variant?: 'default' | 'inline'
  /** When the graph has a pinned month, click places the draft there (alternative to drag-and-drop). */
  pinPlaceEnabled?: boolean
  onPinPlace?: () => void
}

export function DraggableIcon({
  draft,
  disabled,
  variant = 'default',
  pinPlaceEnabled = false,
  onPinPlace,
}: Props) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `nw-drag-${draft.id}`,
    disabled,
    data: { draft },
  })

  const base = eventColorFor(draft)
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.9 : 1,
    backgroundColor: base,
    boxShadow: `0 0 0 3px ${eventTintHex(base, '55')}`,
  }

  const emoji = eventEmoji(draft.kind)

  const inline = variant === 'inline'
  const sizeCls = inline ? 'h-11 w-11 text-lg' : 'h-14 w-14 text-xl'
  const gripCls = inline ? 'h-5 w-5' : 'h-6 w-6'

  const title =
    pinPlaceEnabled && onPinPlace ? t('draggable.titlePinned') : t('draggable.title')
  const ariaLabel =
    pinPlaceEnabled && onPinPlace ? t('draggable.ariaLabelPinned') : t('draggable.ariaLabel')

  const button = (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      className={`relative flex ${sizeCls} shrink-0 cursor-grab items-center justify-center rounded-full shadow-lg ring-2 ring-slate-950/80 transition-transform active:cursor-grabbing active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
        pinPlaceEnabled && onPinPlace ? 'ring-amber-500/55' : ''
      }`}
      title={title}
      {...listeners}
      {...attributes}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={() => {
        if (!pinPlaceEnabled || !onPinPlace || disabled) return
        onPinPlace()
      }}
    >
      <span className="pointer-events-none" aria-hidden>
        {emoji}
      </span>
      <span
        className={`pointer-events-none absolute -bottom-0.5 -right-0.5 flex ${gripCls} items-center justify-center rounded-full bg-slate-900 text-slate-400 ring-2 ring-slate-800`}
        aria-hidden
      >
        <svg className={inline ? 'h-2.5 w-2.5' : 'h-3 w-3'} viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5h2v14H8V5zm6 0h2v14h-2V5z" />
        </svg>
      </span>
    </button>
  )

  if (inline) return button

  return (
    <div className="flex items-center gap-2">
      {button}
      <span className="text-[10px] leading-tight text-slate-500">{t('draggable.hint')}</span>
    </div>
  )
}
