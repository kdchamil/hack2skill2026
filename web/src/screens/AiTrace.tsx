import { useState } from 'react'
import { useApp } from '../appctx'
import { useT } from '../ctx'

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** One quiet line saying how the answer was made, with a tap to see each step. Tolerates missing or new fields. */
export function AiTrace() {
  const { t } = useT()
  const { view } = useApp()
  const [open, setOpen] = useState(false)
  if (view.phase !== 'done' || view.saved || view.modelCalls === undefined) return null
  const calls = view.modelCalls
  const steps = (view.trace ?? []).filter((s) => s && typeof s === 'object')
  const ms = steps.reduce((n, s) => n + (num(s.ms) ?? 0), 0)
  const secs = ms > 0 ? (ms / 1000).toFixed(1) : view.elapsedMs ? (view.elapsedMs / 1000).toFixed(1) : null
  const line = view.cached
    ? t('trace.cached', { n: calls })
    : calls > 0 && secs ? t('trace.read', { s: secs, n: calls })
    : calls > 0 ? t('trace.readNoTime', { n: calls }) : t('trace.rulesOnly')
  return (
    <div className="aitrace" data-testid="ai-trace">
      <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}>{line}</button>
      {open && (
        <ul className="muted" aria-label={t('trace.steps')}>
          {steps.map((s, i) => {
            const tool = typeof s.tool === 'string' ? s.tool : t('trace.unknown')
            const st = num(s.ms)
            const mc = num(s.model_calls) ?? 0
            return <li key={i}><code>{tool}</code>{st !== null ? ` ${st} ms` : ''}{mc > 0 ? ` · ${t('trace.calls', { n: mc })}` : ''}{s.skipped === true ? ` · ${t('trace.skipped')}` : ''}</li>
          })}
          {steps.length === 0 && <li>{t('trace.none')}</li>}
        </ul>
      )}
    </div>
  )
}
