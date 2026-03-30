import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { EventType } from '../../events/types'
import { eventTypeColors } from '../../utils/colors'
import { EventCard } from './EventCard'

type CarouselItem = {
  type: EventType
  label: string
  description: string
  emoji: string
  color: string
}

type Props = {
  selected: EventType | null
  onSelect: (t: EventType) => void
  highlightCue?: boolean
}

export function EventCarousel({ selected, onSelect, highlightCue }: Props) {
  const { t } = useTranslation()

  const items = useMemo((): CarouselItem[] => {
    return [
      {
        type: 'career',
        label: t('carousel.career.label'),
        description: t('carousel.career.desc'),
        emoji: '💼',
        color: eventTypeColors.career,
      },
      {
        type: 'asset_liability',
        label: t('carousel.assetLoan.label'),
        description: t('carousel.assetLoan.desc'),
        emoji: '🏠',
        color: eventTypeColors.asset,
      },
      {
        type: 'investment',
        label: t('carousel.investment.label'),
        description: t('carousel.investment.desc'),
        emoji: '📈',
        color: eventTypeColors.investment,
      },
      {
        type: 'life',
        label: t('carousel.life.label'),
        description: t('carousel.life.desc'),
        emoji: '👶',
        color: eventTypeColors.life,
      },
      {
        type: 'macro',
        label: t('carousel.macro.label'),
        description: t('carousel.macro.desc'),
        emoji: '🌍',
        color: eventTypeColors.macro,
      },
    ]
  }, [t])

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden">
      {highlightCue && (
        <p
          className="shrink-0 text-center text-[9px] font-medium tracking-wide text-teal-400/90"
          aria-hidden
        >
          {t('carousel.pickTypeHint')}
        </p>
      )}
      <motion.div
        layout
        className={`flex min-h-0 min-w-0 flex-nowrap gap-1 overflow-hidden ${highlightCue ? 'rounded-lg ring-1 ring-teal-500/25' : ''}`}
        role="tablist"
        aria-label={t('carousel.ariaEventTypes')}
      >
        {items.map((item) => (
          <EventCard
            key={item.type}
            type={item.type}
            label={item.label}
            description={item.description}
            emoji={item.emoji}
            color={item.color}
            selected={selected === item.type}
            compact
            onSelect={() => onSelect(item.type)}
          />
        ))}
      </motion.div>
    </div>
  )
}
