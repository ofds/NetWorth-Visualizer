import { motion } from 'framer-motion'
import type { EventType } from '../../events/types'

type Props = {
  type: EventType
  label: string
  description: string
  emoji: string
  color: string
  selected: boolean
  /** Dense strip: no description, flex-shrinks to fit row without horizontal scroll */
  compact?: boolean
  onSelect: () => void
}

export function EventCard({
  label,
  description,
  emoji,
  color,
  selected,
  compact,
  onSelect,
}: Props) {
  const tint = selected ? `${color}33` : `${color}14`

  return (
    <motion.button
      layout
      type="button"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      role="tab"
      aria-selected={selected}
      className={`relative flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center transition-colors sm:px-2 sm:py-2 ${
        selected ? 'shadow-md' : 'hover:border-slate-600'
      }`}
      style={{
        borderColor: selected ? color : 'rgba(51, 65, 85, 0.9)',
        backgroundColor: tint,
      }}
    >
      <span className={`leading-none ${compact ? 'text-xl sm:text-2xl' : 'text-3xl'}`} aria-hidden>
        {emoji}
      </span>
      <span
        className={`w-full truncate px-0.5 font-semibold ${selected ? 'text-slate-50' : 'text-slate-200'} ${compact ? 'text-[10px] sm:text-xs' : 'text-sm'}`}
      >
        {label}
      </span>
      {!compact && (
        <span className="line-clamp-2 text-[10px] leading-snug text-slate-500">{description}</span>
      )}
    </motion.button>
  )
}
