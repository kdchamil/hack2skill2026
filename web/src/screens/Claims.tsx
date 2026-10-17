import { routes, useApp } from '../appctx'
import { useT } from '../ctx'
import { byTopic, claimEvidence, claimVerdict } from '../grade'
import { SummaryStrip, TierBadge } from '../ui'
import { ClaimBadge, claimLabel, Listen, useScanData } from './parts'

export function Claims() {
  const { t } = useT()
  const { navigate } = useApp()
  const { a, rings, name, member, toggle } = useScanData()
  if (!a) return <section className="stack"><h1>{t('claims.title')}</h1><button type="button" className="btn primary" onClick={() => navigate(routes.scan)}>{t('sum.newScan')}</button></section>
  const claims = byTopic(a.findings, 'claims')
  const text = claims.map((f) => `${claimLabel(f)}: ${t(`claim.${claimVerdict(f)}`)}. ${f.reason}`).join(' ') || t('claims.none')
  return (
    <section aria-labelledby="cl-h" className="stack">
      <SummaryStrip grade={a.grade.letter} name={name} members={rings} selectedId={member} onSelectMember={toggle} onBack={() => navigate(routes.area('truth'))} />
      <h1 id="cl-h">{t('claims.title')}</h1>
      <p className="muted">{t('claims.count', { name, n: claims.length })}</p>
      {claims.length === 0 && <p>{t('claims.none')}</p>}
      <ul className="list claimlist">
        {claims.map((f) => (
          <li key={f.id} className="claimcard" data-finding={f.id}>
            <h2>{`“${claimLabel(f)}”`}</h2>
            <ClaimBadge verdict={claimVerdict(f)} />
            {claimEvidence(f).map((e, i) => <p key={i}>{e}</p>)}
            <TierBadge tier={f.tier} />
          </li>
        ))}
      </ul>
      <p className="muted">{t('claims.legend')}</p>
      <Listen text={text} tag="claims" />
    </section>
  )
}
