import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useApp } from '../appctx'
import { getListenState, subscribeListen } from '../audio'
import { useT } from '../ctx'
import { ringMembers } from '../grade'
import type { Analysis, Commentary } from '../types'
import { GradeTile, ListenBar, TierBadge, type GradeLetter } from '../ui'
import type { Finding } from '../types'
import { computeVerdicts, type Member, type Verdict } from '../verdict'

/** The scan, household verdicts and member filter every post-scan screen needs. */
export function useScanData() {
  const { view, vault, member, setMember } = useApp()
  const { t } = useT()
  const a: Analysis | null = view.analysis
  const c: Commentary | null = view.commentary
  const verdicts = useMemo<Verdict[]>(() => (a ? computeVerdicts(vault.members, a.facts) : []), [a, vault.members])
  const rings = useMemo(() => ringMembers(t, verdicts), [t, verdicts])
  const picked: Member | undefined = vault.members.find((m) => m.id === member)
  const pickedVerdict = verdicts.find((v) => v.memberId === member)
  const name = a?.product.name.value ?? t('sum.unnamed')
  const toggle = (id: string) => setMember(member === id ? null : id)
  return { view, a, c, verdicts, rings, picked, pickedVerdict, name, member, toggle, scanId: view.scanId }
}

/** One finding as a labelled row with its evidence tier. */
export function FindingRow({ f, grade, onOpen, children }: { f: Finding; grade?: GradeLetter | null; onOpen?: () => void; children?: ReactNode }) {
  const body = (
    <>
      {grade !== undefined && <GradeTile grade={grade} size="sm" />}
      <span className="frow-text">
        <span className="frow-title">{f.title}</span>
        {children ?? <span className="frow-reason">{f.reason}</span>}
        <TierBadge tier={f.tier} />
      </span>
    </>
  )
  return onOpen ? <button type="button" className="frow frow-btn" data-finding={f.id} onClick={onOpen}>{body}</button> : <div className="frow" data-finding={f.id}>{body}</div>
}

import { icons, StatusBadge } from '../ui'
import { claimVerdict, type ClaimVerdict } from '../grade'
import type { Card } from '../types'

const CLAIM_ICON = { supported: icons.Tick, unsupported: icons.Triangle, contradicted: icons.Octagon, unverifiable: icons.Help } as const
/** Four distinct shapes (tick circle, triangle, octagon, question circle) plus the word; never colour alone. */
export function ClaimBadge({ verdict }: { verdict: ClaimVerdict }) {
  const { t } = useT()
  const I = CLAIM_ICON[verdict]
  return <span className={`claimb claimb-${verdict}`}><I size={18} />{t(`claim.${verdict}`)}</span>
}
export const claimLabel = (f: Finding) => (typeof f.data.claim === 'string' ? f.data.claim : f.title)
export { claimVerdict }

/** A graded card as a row; ungraded cards say "No reliable data" instead of a grade. */
export function CardRow({ card, headline, onOpen }: { card: Card; headline: string; onOpen: () => void }) {
  const { t } = useT()
  return (
    <button type="button" className="frow frow-btn" data-card={card.id} onClick={onOpen}>
      {card.grade ? <GradeTile grade={card.grade} size="sm" /> : <StatusBadge status="unknown" />}
      <span className="frow-text">
        <span className="frow-title">{t(`card.${card.id}`)}</span>
        <span className="frow-reason">{card.grade ? headline : t('planet.noData')}</span>
        <TierBadge tier={card.tier} />
      </span>
    </button>
  )
}

/** ListenBar plus an on-screen transcript when audio is unavailable (text-only fallback). */
export function Listen({ text, tag, onNext }: { text: string; tag: string; onNext?: () => void }) {
  const { t } = useT()
  const { setLang } = useApp()
  const s = useSyncExternalStore(subscribeListen, getListenState)
  const mine = s.tag === tag && (s.status === 'text' || s.note === 'unavailable')
  return (
    <>
      {mine && (
        <div className="listen-note" role="status">
          <p className="muted">{t('a.unavailable')}</p>
          <p className="listen-text" lang={s.lang}>{s.text}</p>
        </div>
      )}
      <ListenBar text={text} tag={tag} onLang={setLang} onNext={onNext} />
    </>
  )
}
