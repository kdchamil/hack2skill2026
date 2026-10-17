import { useSyncExternalStore } from 'react'
import { getListenState, listen, RATES, setRate, stopListen, subscribeListen, togglePause } from '../audio'
import { useT } from '../ctx'
import { LANG_LABELS } from '../i18n'
import type { Lang } from '../types'
import { Basket, Book, Camera, ListIcon, Next, Pause, People, Play } from './icons'

export interface ListenBarProps { text: string; tag: string; onNext?: () => void; onLang?: (l: Lang) => void }

export function ListenBar({ text, tag, onNext, onLang }: ListenBarProps) {
  const { t, lang } = useT()
  const s = useSyncExternalStore(subscribeListen, getListenState)
  const mine = s.tag === tag && s.status !== 'idle'
  const playing = mine && (s.status === 'playing' || s.status === 'speech' || s.status === 'loading')
  const press = () => (!mine ? void listen(text, lang, tag) : s.status === 'text' ? stopListen() : togglePause())
  const cycle = () => setRate(RATES[(RATES.indexOf(s.rate) + 1) % RATES.length])
  return (
    <div className="listenbar" role="group" aria-label={t('listen.bar')}>
      <button type="button" className="lb-btn lb-play" onClick={press} aria-label={playing ? t('listen.pause') : t('listen.play')}>
        {playing ? <Pause /> : <Play />}<span>{t('sum.listen')}</span>
      </button>
      <select className="lb-lang" aria-label={t('listen.lang')} value={lang} onChange={(e) => onLang?.(e.target.value as Lang)}>
        {(Object.keys(LANG_LABELS) as Lang[]).map((l) => <option key={l} value={l} lang={l}>{LANG_LABELS[l].name}</option>)}
      </select>
      <button type="button" className="lb-btn" onClick={cycle} aria-label={t('listen.speed', { r: s.rate })}>{s.rate}×</button>
      {onNext && <button type="button" className="lb-btn" onClick={onNext} aria-label={t('listen.next')}><Next /></button>}
    </div>
  )
}

export type Tab = 'list' | 'library' | 'scan' | 'basket' | 'household'
const SLOTS: { tab: Tab; Icon: typeof Camera }[] = [
  { tab: 'list', Icon: ListIcon }, { tab: 'library', Icon: Book }, { tab: 'scan', Icon: Camera }, { tab: 'basket', Icon: Basket }, { tab: 'household', Icon: People },
]

export function BottomBar({ current, onGo }: { current: Tab | null; onGo: (t: Tab) => void }) {
  const { t } = useT()
  return (
    <nav aria-label={t('nav.main')} className="bar">
      {SLOTS.map(({ tab, Icon }) => (
        <button key={tab} type="button" className={`bar-btn${tab === 'scan' ? ' bar-scan' : ''}`} aria-current={current === tab ? 'page' : undefined} onClick={() => onGo(tab)}>
          <span className="bar-icon"><Icon size={tab === 'scan' ? 28 : 24} /></span>
          <span className="bar-label">{t(`nav.${tab}`)}</span>
        </button>
      ))}
    </nav>
  )
}
