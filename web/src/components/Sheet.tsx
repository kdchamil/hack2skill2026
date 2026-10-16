import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../ctx'

export function Sheet({ title, onClose, children, labelId, tall = true }: { title: string; onClose: () => void; children: ReactNode; labelId: string; tall?: boolean }) {
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
          <button type="button" className="btn ghost" onClick={onClose}>{t('d.close')}</button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
