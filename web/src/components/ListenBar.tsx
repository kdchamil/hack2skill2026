import { useSyncExternalStore } from 'react'
import { getListenState, listen, RATES, replay, setRate, stopListen, subscribeListen, togglePause } from '../audio'
import { useT } from '../ctx'

export function useListenState() {
  return useSyncExternalStore(subscribeListen, getListenState)
}

export function ListenButton({ text, tag, big, label }: { text: string; tag: string; big?: boolean; label?: string }) {
  const { t, lang } = useT()
  const s = useListenState()
  const active = s.tag === tag && s.status !== 'idle'
  return (
    <button type="button" className={`btn ${big ? 'listen-big' : 'secondary'}`} onClick={() => (active ? stopListen() : void listen(text, lang, tag))}
      aria-pressed={active}>
      <span aria-hidden="true">{active ? '■' : '🔊'}</span> {active ? t('a.stop') : (label ?? t('sum.listen'))}
    </button>
  )
}

/** Always-visible player + on-screen text for whatever is being listened to. */
export function ListenPanel() {
  const { t } = useT()
  const s = useListenState()
  if (s.status === 'idle') return null
  const busy = s.status === 'loading'
  return (
    <section className="listen-panel" aria-label={t('a.listening')}>
      <div className="row wrap">
        <button type="button" className="btn secondary" onClick={togglePause} disabled={busy || s.status === 'text'}>
          {s.status === 'paused' ? t('a.play') : t('a.pause')}
        </button>
        <button type="button" className="btn secondary" onClick={replay}>{t('a.replay')}</button>
        <button type="button" className="btn ghost" onClick={stopListen}>{t('a.stop')}</button>
      </div>
      <div className="row wrap" role="group" aria-label={t('a.speed')}>
        <span className="muted">{t('a.speed')}</span>
        {RATES.map((r) => (
          <button key={r} type="button" className="btn chip-btn" aria-pressed={s.rate === r} onClick={() => setRate(r)}>{r}×</button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="muted">
        {busy ? t('a.loading') : s.note === 'unavailable' ? t('a.unavailable') : s.note === 'speech' ? t('a.speech') : ''}
      </p>
      <p className="listen-text" lang={s.lang}>{s.text}</p>
    </section>
  )
}
