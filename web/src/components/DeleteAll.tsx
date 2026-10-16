import { useState } from 'react'
import { useT } from '../ctx'
import type { Vault } from '../useVault'
import { Sheet } from './Sheet'

/** One tap to open, one tap to confirm. Wipes all on-device data and returns the app to first run. */
export function DeleteAll({ vault, onDeleted }: { vault: Vault; onDeleted: () => void }) {
  const { t } = useT()
  const [confirm, setConfirm] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { await vault.wipe(); onDeleted(); setDone(true) } finally { setBusy(false); setConfirm(false) }
  }
  return (
    <div className="stack">
      <button type="button" className="btn danger" onClick={() => { setDone(false); setConfirm(true) }}>{t('hh.deleteAll')}</button>
      <p role="status" className={done ? 'banner banner-info' : 'sr-only'} data-testid="deleted-msg">{done ? t('del.done') : ''}</p>
      {confirm && (
        <Sheet title={t('hh.deleteAll')} labelId="del-h" tall={false} onClose={() => setConfirm(false)}>
          <p>{t('hh.confirmDelete')}</p>
          <div className="actions">
            <button type="button" className="btn danger" disabled={busy} onClick={run}>{t('hh.confirmYes')}</button>
            <button type="button" className="btn secondary" onClick={() => setConfirm(false)}>{t('hh.cancel')}</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
