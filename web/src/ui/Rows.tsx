import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../ctx'
import type { Tier } from '../types'
import { GradeTile, StatusBadge, TierBadge } from './Badges'
import { AREA_ICONS } from './icons'
import { clampWords, type GradeLetter, type RingMember, type StatusKind } from './logic'
import { RingRow } from './Ring'

export type AreaKey = keyof typeof AREA_ICONS

export interface AreaRowProps {
  area?: AreaKey; icon?: ReactNode; title: string; headline: string
  grades?: (GradeLetter | null)[]; status?: StatusKind; tier?: Tier; onOpen: () => void
}

export function AreaRow({ area, icon, title, headline, grades, status, tier, onOpen }: AreaRowProps) {
  const Icon = area ? AREA_ICONS[area] : null
  return (
    <button type="button" className="area-row" onClick={onOpen}>
      <span className="area-icon" aria-hidden="true">{icon ?? (Icon && <Icon size={28} />)}</span>
      <span className="area-text">
        <span className="area-title">{title}</span>
        <span className="area-headline">{clampWords(headline)}</span>
        <span className="area-meta">
          {grades?.map((g, i) => <GradeTile key={i} grade={g} size="sm" />)}
          {status && <StatusBadge status={status} />}
          {tier && <TierBadge tier={tier} />}
        </span>
      </span>
    </button>
  )
}

export interface SummaryStripProps {
  grade: GradeLetter | null; name: string; members: RingMember[]
  onBack: () => void; selectedId?: string | null; onSelectMember?: (id: string) => void
}

export function SummaryStrip({ grade, name, members, onBack, selectedId, onSelectMember }: SummaryStripProps) {
  const { t } = useT()
  return (
    <div className="strip">
      <button type="button" className="strip-main" onClick={onBack}>
        <span className="sr-only">{t('strip.back', { name: '' })}</span>
        <GradeTile grade={grade} size="sm" />
        <span className="strip-name">{name}</span>
      </button>
      {members.length > 0 && <RingRow members={members} max={3} compact selectedId={selectedId} onSelect={onSelectMember} />}
    </div>
  )
}

export interface AreaTabsProps { areas: { id: string; label: string }[]; current: string; onSelect: (id: string) => void }

export function AreaTabs({ areas, current, onSelect }: AreaTabsProps) {
  const { t } = useT()
  const nav = useRef<HTMLElement>(null)
  // keep the current tab in view on narrow screens
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
    const n = nav.current
    if (el && n) n.scrollTo({ left: el.offsetLeft - (n.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' })
  }, [current])
  return (
    <nav ref={nav} className="area-tabs" aria-label={t('area.tabs')}>
      {areas.map((a) => (
        <button key={a.id} type="button" aria-current={a.id === current ? 'page' : undefined} onClick={() => onSelect(a.id)}>{a.label}</button>
      ))}
    </nav>
  )
}
