import { useState } from 'react'
import { routes, useApp } from '../appctx'
import { ReportSheet } from '../components/ReportSheet'
import { useT } from '../ctx'
import { byTopic, cardHeadline, claimVerdict, findingsOf, isPlaceholder, sortFor } from '../grade'
import type { Analysis, Commentary, DateField } from '../types'
import { StatusBadge, TierBadge } from '../ui'
import type { Member } from '../verdict'
import { CardRow, ClaimBadge, claimLabel, FindingRow } from './parts'

export interface PartProps { a: Analysis; c: Commentary | null; member: Member | undefined; scanId: string | null }

export function Body({ a, c, member }: PartProps) {
  const { t } = useT()
  const { navigate } = useApp()
  const fs = findingsOf(a, 'body')
  const al = byTopic(fs, 'allergens')
  const tierOf = (pre: string) => al.find((f) => f.id.startsWith(pre))?.tier ?? 'label_stated'
  const mine = (xs: string[]) => [...xs.filter((x) => member?.allergens.includes(x as never)), ...xs.filter((x) => !member?.allergens.includes(x as never))]
  const list = (xs: string[]) => (xs.length ? mine(xs).map((x) => t(`allergen.${x}`)).join(', ') : t('body.noneFound'))
  const recall = byTopic(fs, 'recalls')[0]
  const dates = byTopic(fs, 'dates')
  const dateText = (f: (typeof dates)[number]) => {
    const kind = String(f.data.kind ?? '') as DateField['kind']
    const iso = typeof f.data.iso === 'string' ? f.data.iso : ''
    return iso ? t(`dates.${kind}`, { d: iso }) : f.reason
  }
  return (
    <div className="stack tight">
      <h2 className="h2s">{t('body.allergens')}</h2>
      <div className="frow" data-testid="contains">
        <span className="frow-text"><span className="frow-title">{t('body.contains')}</span><span className="frow-reason">{list(a.facts.allergens_contains)}</span><TierBadge tier={tierOf('allergen.contains')} /></span>
      </div>
      <div className="frow" data-testid="may-contain">
        <span className="frow-text"><span className="frow-title">{t('body.may')}</span><span className="frow-reason">{list(a.facts.allergens_may_contain)}</span><TierBadge tier={tierOf('allergen.may')} /></span>
      </div>
      <div className="duo">
        {sortFor(byTopic(fs, 'diet'), member).map((f) => (
          <FindingRow key={f.id} f={{ ...f, title: `${t(`diet.${String(f.data.diet)}`)}: ${t(`diet.val.${String(f.data.value ?? 'unknown')}`)}` }}>{' '}</FindingRow>
        ))}
      </div>
      <h2 className="h2s">{t('body.cards')}</h2>
      {a.cards.filter((x) => ['nutrition', 'processing', 'additives'].includes(x.id)).map((card) => (
        <CardRow key={card.id} card={card} headline={cardHeadline(a, card.id, c)} onOpen={() => navigate(routes.detail(card.id))} />
      ))}
      <h2 className="h2s">{t('body.recalls')}</h2>
      <div className="frow"><span className="frow-text">
        <span className="frow-reason">{!recall || isPlaceholder(recall) ? t('body.noRecall') : recall.reason}</span><TierBadge tier={recall?.tier ?? 'unknown'} />
      </span></div>
      <h2 className="h2s">{t('body.dates')}</h2>
      {dates.length ? dates.map((f) => <FindingRow key={f.id} f={f}><span className="frow-reason">{dateText(f)}</span></FindingRow>)
        : <div className="frow"><span className="frow-text"><span className="frow-reason">{t('dates.none')}</span><TierBadge tier="unknown" /></span></div>}
      <p className="muted">{t('body.pro')}</p>
    </div>
  )
}

export function Planet({ a, c }: PartProps) {
  const { t } = useT()
  const { navigate } = useApp()
  const pk = a.findings.find((f) => f.topic === 'packaging' && !isPlaceholder(f))
  return (
    <div className="stack tight">
      {a.cards.filter((x) => ['carbon', 'water_land', 'packaging'].includes(x.id)).map((card) => (
        <CardRow key={card.id} card={card} headline={cardHeadline(a, card.id, c)} onOpen={() => navigate(routes.detail(card.id))} />
      ))}
      {pk && <p className="note">{t('planet.tip')}</p>}
    </div>
  )
}

export function People({ a, scanId }: PartProps) {
  const { t } = useT()
  const [rep, setRep] = useState(false)
  const fs = findingsOf(a, 'people')
  return (
    <div className="stack tight">
      {(['labour', 'sourcing', 'animal_welfare'] as const).map((tp) => {
        const f = byTopic(fs, tp)[0]
        return (
          <div className="frow" key={tp} data-topic={tp}>
            <span className="frow-text">
              <span className="frow-title">{t(`people.${tp}`)}</span>
              <span className="frow-reason">{f && !isPlaceholder(f) ? f.reason : t('planet.noData')}</span>
              {f ? <TierBadge tier={f.tier} /> : <StatusBadge status="unknown" />}
            </span>
          </div>
        )
      })}
      <p className="muted">{t('people.note')}</p>
      {scanId && <button type="button" className="btn ghost" onClick={() => setRep(true)}>{t('d.report')}</button>}
      {rep && scanId && <ReportSheet scanId={scanId} onClose={() => setRep(false)} />}
    </div>
  )
}

export function Truth({ a }: PartProps) {
  const { t } = useT()
  const { navigate } = useApp()
  const fs = findingsOf(a, 'truth')
  const claims = byTopic(fs, 'claims')
  const clarity = byTopic(fs, 'label_clarity')[0]
  const auth = byTopic(fs, 'authenticity')[0]
  const checklist = (clarity?.data.checklist ?? {}) as Record<string, boolean>
  return (
    <div className="stack tight">
      <h2 className="h2s">{t('truth.claims')}</h2>
      {claims.length === 0 && <p className="muted">{t('truth.none')}</p>}
      {claims.map((f) => (
        <button key={f.id} type="button" className="frow frow-btn" data-finding={f.id} onClick={() => navigate(routes.claims)}>
          <span className="frow-text"><span className="frow-title">{`“${claimLabel(f)}”`}</span><ClaimBadge verdict={claimVerdict(f)} /></span>
        </button>
      ))}
      {claims.length > 0 && <button type="button" className="btn secondary" onClick={() => navigate(routes.claims)}>{t('truth.open')}</button>}
      {clarity && (
        <>
          <h2 className="h2s">{t('truth.clarity', { d: String(clarity.data.disclosed ?? 0), n: String(clarity.data.total ?? 0) })}</h2>
          <ul className="checklist">
            {Object.entries(checklist).map(([k, v]) => <li key={k}><span aria-hidden="true">{v ? '✓' : '✕'}</span> {t(`truth.c.${k}`)}: {v ? t('truth.shown') : t('truth.missing')}</li>)}
          </ul>
          <TierBadge tier={clarity.tier} />
        </>
      )}
      <h2 className="h2s">{t('truth.auth')}</h2>
      <div className="frow"><span className="frow-text">
        {auth && !isPlaceholder(auth) && <span className="frow-reason">{auth.reason}</span>}
        <span className="frow-reason">{t('truth.authNote')}</span>
        <TierBadge tier={auth?.tier ?? 'unknown'} />
      </span></div>
    </div>
  )
}

export function Choice({ a, member }: PartProps) {
  const { t } = useT()
  const { navigate, vault } = useApp()
  const [budget, setBudget] = useState(false)
  const ms = member ? [member] : vault.members
  const pr: { label: string; on: boolean }[] = []
  for (const m of ms) {
    if (m.goals.includes('low_sugar')) pr.push({ label: t('choice.lessSugar'), on: true })
    if (m.goals.includes('low_sodium')) pr.push({ label: `${t('choice.lessSalt')} (${m.alias})`, on: true })
    if (m.goals.includes('low_sat_fat')) pr.push({ label: t('choice.lessSat'), on: true })
    for (const al of m.allergens) pr.push({ label: t('choice.noAllergen', { a: t(`allergen.${al}`).toLocaleLowerCase(), name: m.alias }), on: true })
  }
  pr.push({ label: t('choice.recyclable'), on: false }, { label: t('choice.lowCarbon'), on: false })
  void a
  return (
    <div className="stack">
      <h2 className="h2s">{t('choice.priorities')}</h2>
      <ul className="checklist">
        {pr.map((p, i) => <li key={i}><span aria-hidden="true">{p.on ? '✓' : '○'}</span> {p.label}<span className="sr-only">: {p.on ? t('choice.on') : t('choice.off')}</span></li>)}
      </ul>
      <label className="switch"><input type="checkbox" role="switch" checked={budget} onChange={(e) => setBudget(e.target.checked)} /> <span>{t('choice.budget')}<br /><small className="muted">{t('choice.budgetNote')}</small></span></label>
      {budget && <p className="note" data-testid="no-price">{t('choice.noPrice')}</p>}
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => navigate(routes.scan)}>{t('choice.scanAnother')}</button>
        <button type="button" className="btn secondary" onClick={() => navigate(routes.library)}>{t('choice.library')}</button>
        <button type="button" className="btn secondary" onClick={() => navigate({ tab: 'scan', sub: 'compare' })}>{t('choice.compare')}</button>
      </div>
      <p className="muted">{t('choice.fair')}</p>
    </div>
  )
}
