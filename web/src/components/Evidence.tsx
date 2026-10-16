import { useState } from 'react'
import { reportFinding } from '../api'
import { useT } from '../ctx'
import type { Finding } from '../types'
import { SevBadge, TierBadge } from './Badges'
import { Sheet } from './Sheet'

function FindingItem({ f, scanId }: { f: Finding; scanId: string | null }) {
  const { t } = useT()
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const report = async () => {
    if (!scanId) return
    setState('sending')
    try { await reportFinding(scanId, f.id); setState('done') } catch { setState('error') }
  }
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
      <button type="button" className="btn ghost small" disabled={!scanId || state === 'sending' || state === 'done'} onClick={report}>
        {t('d.report')}
      </button>
      <span role="status" className="muted"> {state === 'done' ? t('d.reported') : state === 'error' ? t('common.offline') : ''}</span>
    </li>
  )
}

export function EvidenceSheet({ title, findings, scanId, onClose, extra }: {
  title: string; findings: Finding[]; scanId: string | null; onClose: () => void; extra?: React.ReactNode
}) {
  const { t } = useT()
  return (
    <Sheet title={title} labelId="ev-h" onClose={onClose}>
      {extra}
      {findings.length === 0 ? <p>{t('d.none')}</p> : (
        <ul className="list findings">{findings.map((f) => <FindingItem key={f.id} f={f} scanId={scanId} />)}</ul>
      )}
    </Sheet>
  )
}
