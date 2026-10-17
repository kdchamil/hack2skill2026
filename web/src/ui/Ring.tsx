import { useT } from '../ctx'
import { Octagon, Tick, Triangle } from './icons'
import { moreAria, ringAria, splitRings, type RingMember, type VerdictLevel } from './logic'

const Badge = ({ level }: { level: VerdictLevel }) => (
  <span className={`ring-badge ring-badge-${level}`}>{level === 'avoid' ? <Octagon size={16} /> : level === 'check' ? <Triangle size={16} /> : <Tick size={16} />}</span>
)

export interface RingProps { member: RingMember; selected?: boolean; onSelect?: (id: string) => void; compact?: boolean }

export function Ring({ member, selected, onSelect, compact }: RingProps) {
  const { t } = useT()
  const word = t(`ring.${member.level}`)
  const body = (
    <>
      <span className={`ring ring-${member.level}`} aria-hidden="true">
        <span className="ring-initial">{Array.from(member.name)[0]?.toLocaleUpperCase() ?? '?'}</span>
        <Badge level={member.level} />
      </span>
      {onSelect && <span className="sr-only">{compact ? `${member.name}: ${word}` : `${member.name}: `}</span>}
      {!compact && <span className="ring-word" aria-hidden={onSelect ? undefined : true}>{word}</span>}
      {!compact && member.reason && <span className="ring-reason" aria-hidden={onSelect ? undefined : true}>{member.reason}</span>}
    </>
  )
  const label = ringAria(t, member)
  return onSelect ? (
    <button type="button" className="ring-item" aria-pressed={selected ?? false} onClick={() => onSelect(member.id)}>{body}</button>
  ) : (
    <span className="ring-item" role="img" aria-label={label}>{body}</span>
  )
}

export interface RingRowProps { members: RingMember[]; max?: number; selectedId?: string | null; onSelect?: (id: string) => void; compact?: boolean }

export function RingRow({ members, max, selectedId, onSelect, compact }: RingRowProps) {
  const { t } = useT()
  const { shown, hidden, hiddenAvoid, hiddenLevel } = splitRings(members, max)
  return (
    <div className="ring-row">
      {shown.map((m) => <Ring key={m.id} member={m} compact={compact} selected={selectedId === m.id} onSelect={onSelect} />)}
      {hidden.length > 0 && hiddenLevel && (
        <span className="ring-item" role="img" aria-label={moreAria(t, hidden.length, hiddenAvoid)}>
          <span className={`ring ring-more ring-${hiddenLevel}`} aria-hidden="true">
            <span className="ring-initial">+{hidden.length}</span>
            {hiddenAvoid > 0 && <Badge level="avoid" />}
          </span>
          {!compact && <span className="ring-word" aria-hidden="true">{hiddenAvoid > 0 ? t('ring.moreAvoid', { n: hidden.length }) : t('ring.more', { n: hidden.length })}</span>}
        </span>
      )}
    </div>
  )
}
