import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../ctx'

export interface SheetProps {
  title: string; labelId: string; onClose: () => void; children: ReactNode; tall?: boolean
  primary?: { label: string; onClick: () => void }; dismissLabel?: string
}

/** Bottom sheet on a modal dialog: focus moves in and is trapped, Esc and backdrop close. A primary action always comes with an equal-weight dismiss. */
export function Sheet({ title, labelId, onClose, children, tall, primary, dismissLabel }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const { t } = useT()
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    return () => { if (d?.open) d.close() }
  }, [])
  return (
    <dialog ref={ref} className={`sheet${tall ? ' tall' : ''}`} aria-labelledby={labelId} onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="sheet-body">
        <div className="sheet-head">
          <h2 id={labelId}>{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>{t('sheet.close')}</button>
        </div>
        {children}
        {primary && (
          <div className="sheet-actions">
            <button type="button" className="btn secondary" onClick={primary.onClick}>{primary.label}</button>
            <button type="button" className="btn secondary" onClick={onClose}>{dismissLabel ?? t('sheet.notNow')}</button>
          </div>
        )}
      </div>
    </dialog>
  )
}
