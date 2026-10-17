import { useT } from '../ctx'
import type { Tier } from '../types'
import { Dash, Doc, Help, ShieldTick } from './icons'
import type { GradeLetter, StatusKind } from './logic'

export function GradeTile({ grade, size = 'md' }: { grade: GradeLetter | null; size?: 'sm' | 'md' | 'lg' }) {
  const { t } = useT()
  return grade ? (
    <span className={`grade grade-${grade} grade-${size}`} role="img" aria-label={t('grade.aria', { g: grade })}>{grade}</span>
  ) : (
    <span className={`grade grade-none grade-${size}`} role="img" aria-label={t('grade.noneAria')}>{t('grade.none')}</span>
  )
}

const TIER_ICON = { verified: ShieldTick, label_stated: Doc, inferred: Help, unknown: Dash }
export function TierBadge({ tier }: { tier: Tier }) {
  const { t } = useT()
  const I = TIER_ICON[tier]
  return <span className={`tier2 tier2-${tier}`}><I size={14} />{t(`tier.${tier}`)}</span>
}

const STATUS_ICON = { known: ShieldTick, partial: Doc, thin: Help, unknown: Dash }
export function StatusBadge({ status }: { status: StatusKind }) {
  const { t } = useT()
  const I = STATUS_ICON[status]
  return <span className={`status status-${status}`}><I size={14} />{t(`status.${status}`)}</span>
}
