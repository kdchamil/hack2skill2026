import { useState } from 'react'
import { reportFinding } from '../api'
import { useT } from '../ctx'
import { Sheet } from './Sheet'

export const MAX_NOTE = 500

/** Sends only {scan_id, finding_id, note?}. Never profile data, never images. */
export function ReportSheet({ scanId, findingId, onClose }: { scanId: string; findingId?: string; onClose: () => void }) {
  const { t } = useT()
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')
    try { await reportFinding(scanId, findingId, note.trim() || undefined); setState('done') } catch { setState('error') }
  }
  return (
    <Sheet title={t('d.report')} labelId="rep-h" tall={false} onClose={onClose}>
      {state === 'done' ? (
        <>
          <p role="status" data-testid="report-ok">{t('rep.thanks')}</p>
          <div className="actions"><button type="button" className="btn primary" onClick={onClose}>{t('d.close')}</button></div>
        </>
      ) : (
        <form className="stack" onSubmit={send}>
          <label className="field">{t('rep.note')}
            <textarea rows={4} maxLength={MAX_NOTE} value={note} aria-describedby="rep-help" onChange={(e) => setNote(e.target.value)} />
          </label>
          <p id="rep-help" className="muted">{t('rep.help')} · {note.length}/{MAX_NOTE}</p>
          {state === 'error' && <p role="alert" className="error">{t('rep.error')}</p>}
          <div className="actions">
            <button type="submit" className="btn primary" disabled={state === 'sending'}>{state === 'error' ? t('common.retry') : t('rep.send')}</button>
            <button type="button" className="btn secondary" onClick={onClose}>{t('hh.cancel')}</button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
