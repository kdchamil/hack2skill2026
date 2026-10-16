import { useState } from 'react'
import { useT } from '../ctx'
import type { Finding } from '../types'
import { SevBadge, TierBadge } from './Badges'
import { ReportSheet } from './ReportSheet'
import { Sheet } from './Sheet'

function FindingItem({ f, scanId }: { f: Finding; scanId: string | null }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <li className="finding" data-finding={f.id}>
      <div className="row wrap"><SevBadge sev={f.severity} /><TierBadge tier={f.tier} /></div>
      <h3>{f.title}</h3>
      <p><strong>{t('d.reason')}: </strong>{f.reason}</p>
      {f.next_step && <p><strong>{t('d.next')}: </strong>{f.next_step}</p>}
      {f.sources.length > 0 && (
        <p className="muted"><strong>{t('d.sources')}: </strong>
          {f.sources.map((s, i) => (
            <span key={i}>{i > 0 && ', '}{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a> : s.label}</span>
          ))}
        </p>
      )}
      <button type="button" className="btn ghost small" disabled={!scanId} aria-label={`${t('d.report')}: ${f.title}`} onClick={() => setOpen(true)}>
        {t('d.report')}
      </button>
      {open && scanId && <ReportSheet scanId={scanId} findingId={f.id} onClose={() => setOpen(false)} />}
    </li>
  )
}

export function EvidenceSheet({ title, findings, scanId, onClose, extra }: {
  title: string; findings: Finding[]; scanId: string | null; onClose: () => void; extra?: React.ReactNode
}) {
  const { t } = useT()
  const [reporting, setReporting] = useState(false)
  return (
    <Sheet title={title} labelId="ev-h" onClose={onClose}>
      {extra}
      <div>
        <button type="button" className="btn secondary" disabled={!scanId} onClick={() => setReporting(true)}>{t('d.report')}</button>
      </div>
      {reporting && scanId && <ReportSheet scanId={scanId} onClose={() => setReporting(false)} />}
      {findings.length === 0 ? <p>{t('d.none')}</p> : (
        <ul className="list findings">{findings.map((f) => <FindingItem key={f.id} f={f} scanId={scanId} />)}</ul>
      )}
    </Sheet>
  )
}
