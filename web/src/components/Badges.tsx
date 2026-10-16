import { useT } from '../ctx'
import type { Severity, Tier } from '../types'

export function TierBadge({ tier }: { tier: Tier }) {
  const { t } = useT()
  return <span className={`tier tier-${tier}`} title={t('d.confidence')}>{t(`tier.${tier}`)}</span>
}
const GLYPH: Record<Severity, string> = { avoid: '✕', check: '!', info: 'i', good: '✓' }
export function SevBadge({ sev }: { sev: Severity }) {
  const { t } = useT()
  return <span className={`sev sev-${sev}`}><span aria-hidden="true" className="glyph">{GLYPH[sev]}</span>{t(`sev.${sev}`)}</span>
}
