import { useApp } from '../appctx'
import { useT } from '../ctx'
import { chooseProduct, useListState, type ScanLite } from '../list'
import { GradeTile, RingRow, TierBadge, type RingMember } from '../ui'
import { computeVerdicts } from '../verdict'

type ReasonT = (k: string, v?: Record<string, string | number>) => string

function Column({ p, members, t, onChoose }: { p: ScanLite; members: RingMember[]; t: ReasonT; onChoose: () => void }) {
  const a = p.analysis
  return (
    <section className="stack glass cmp-col" aria-labelledby={`cmp-${p.scan_id}`}>
      <h2 id={`cmp-${p.scan_id}`} style={{ fontSize: '1rem' }}>{p.name}</h2>
      <GradeTile grade={a.grade.letter} size="lg" />
      <ul className="cards" aria-label={t('cmp.cards', { name: p.name })}>
        {a.cards.map((c) => (
          <li key={c.id} className="card">
            <div className="row between"><span>{t(`cmp.card.${c.id}`)}</span><GradeTile grade={c.grade} size="sm" /></div>
            <TierBadge tier={c.tier} />
          </li>
        ))}
      </ul>
      {members.length > 0 && <div aria-label={t('cmp.rings', { name: p.name })}><RingRow members={members} compact /></div>}
      <button type="button" className="btn primary" aria-describedby={`cmp-${p.scan_id}`} onClick={onChoose}>{t('cmp.choose')}</button>
    </section>
  )
}

export function ringsFor(p: ScanLite, members: import('../verdict').Member[], t: ReasonT): RingMember[] {
  return computeVerdicts(members, p.analysis.facts).map((v) => ({
    id: v.memberId, name: v.alias, level: v.level,
    reason: v.reasons.length ? v.reasons.map((r) => t(`r.${r.code}`, { x: r.arg ? t(`${r.code.startsWith('nutrient') ? 'nutrient' : r.code.startsWith('diet') ? 'diet' : 'allergen'}.${r.arg}`).toLocaleLowerCase() : '' })).join(', ') : undefined,
  }))
}

/** Two products side by side. No ranking, no "better" wording; price only if a budget is declared (none exists yet). */
export function Compare({ a, b }: { a?: ScanLite; b?: ScanLite } = {}) {
  const { t } = useT()
  const { vault, navigate } = useApp()
  const s = useListState()
  const c = s.comparing
  const A = a ?? (c ? s.scans[c.firstScanId] : undefined)
  const B = b ?? (c ? s.scans[c.secondScanId] : undefined)
  if (!A || !B) return <div className="stack"><h1>{t('cmp.title')}</h1><p>{t('cmp.missing')}</p></div>
  const done = (win: ScanLite, other: ScanLite) => { chooseProduct(win.scan_id, other.scan_id, c?.itemId); navigate({ tab: 'basket' }) }
  return (
    <div className="stack">
      <h1>{t('cmp.title')}</h1>
      <p className="muted">{t('cmp.sub')}</p>
      {vault.members.length === 0 && <p className="muted">{t('cmp.noMembers')}</p>}
      <div className="cmp-grid">
        <Column p={A} members={ringsFor(A, vault.members, t)} t={t} onChoose={() => done(A, B)} />
        <Column p={B} members={ringsFor(B, vault.members, t)} t={t} onChoose={() => done(B, A)} />
      </div>
    </div>
  )
}
