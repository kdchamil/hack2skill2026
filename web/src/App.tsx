import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCommentary, scan, type ScanInput } from './api'
import { stopListen } from './audio'
import { Household } from './components/Household'
import { Scan } from './components/Scan'
import { Summary, type ScanView } from './components/Summary'
import { Ctx, makeCtx } from './ctx'
import type { Lang } from './types'
import { useVault } from './useVault'

type Tab = 'scan' | 'summary' | 'household'
const EMPTY: ScanView = { analysis: null, commentary: null, scanId: null, elapsedMs: null, phase: 'loading', error: null }

function initialLang(): Lang {
  try {
    const l = localStorage.getItem('fivesec.lang')
    if (l === 'en' || l === 'si' || l === 'ta') return l
  } catch { /* ignore */ }
  return 'en'
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [tab, setTab] = useState<Tab>('scan')
  const [view, setView] = useState<ScanView>(EMPTY)
  const vault = useVault()
  const ctx = useMemo(() => makeCtx(lang), [lang])
  const abort = useRef<AbortController | null>(null)
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])
  const { t } = ctx

  useEffect(() => { document.documentElement.lang = lang }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('fivesec.lang', l) } catch { /* ignore */ }
    stopListen()
    const v = viewRef.current
    if (v.scanId && v.commentary?.lang !== l) {
      void fetchCommentary(v.scanId, l).then((c) => setView((cur) => (cur.scanId === v.scanId ? { ...cur, commentary: c } : cur))).catch(() => {})
    }
  }, [])

  const runScan = useCallback((input: Omit<ScanInput, 'lang'>) => {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    stopListen()
    setView({ ...EMPTY })
    setTab('summary')
    scan({ ...input, lang }, {
      onAnalysis: (analysis, ms) => setView((v) => ({ ...v, analysis, elapsedMs: ms, phase: 'streaming' })),
      onCommentary: (commentary) => setView((v) => ({ ...v, commentary })),
      onDone: (r, ms) => {
        setView((v) => ({ ...v, analysis: r.analysis, commentary: r.commentary, scanId: r.scan_id, elapsedMs: v.elapsedMs ?? ms, phase: 'done', cached: r.cached }))
        void vault.remember({ scan_id: r.scan_id, name: r.analysis.product.name.value, analysis: r.analysis }).catch(() => {})
      },
    }, ac.signal).catch((e: unknown) => {
      if ((e as Error).name === 'AbortError') return
      setView((v) => ({ ...v, phase: 'error', error: (e as Error).message }))
    })
  }, [lang, vault])

  const go = (x: Tab) => { stopListen(); setTab(x) }
  const showSummaryTab = view.analysis !== null || tab === 'summary'

  return (
    <Ctx.Provider value={ctx}>
      <a href="#main" className="skip">{t('skip')}</a>
      <header className="top">
        <span className="brand" translate="no"><span aria-hidden="true">⏱</span> {t('app.name')}</span>
        {tab !== 'summary' && (
          <div className="row" role="group" aria-label={t('lang.label')}>
            {(['en', 'si', 'ta'] as Lang[]).map((l) => (
              <button key={l} type="button" className="btn chip-btn" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
                {{ en: 'EN', si: 'සිං', ta: 'தமிழ்' }[l]}
              </button>
            ))}
          </div>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        {tab === 'scan' && <Scan busy={false} onAnalyze={runScan} />}
        {tab === 'summary' && (
          <Summary view={view} members={vault.members} vault={vault.status} lang={lang} setLang={setLang}
            onNew={() => go('scan')} onGoHousehold={() => go('household')} />
        )}
        {tab === 'household' && <Household vault={vault} />}
      </main>
      <nav aria-label={t('nav.main')} className="tabbar">
        <button type="button" aria-current={tab === 'scan' ? 'page' : undefined} onClick={() => go('scan')}><span aria-hidden="true">📷</span>{t('nav.scan')}</button>
        {showSummaryTab ? (
          <button type="button" aria-current={tab === 'summary' ? 'page' : undefined} onClick={() => go('summary')}><span aria-hidden="true">📋</span>{t('sum.title')}</button>
        ) : null}
        <button type="button" aria-current={tab === 'household' ? 'page' : undefined} onClick={() => go('household')}><span aria-hidden="true">👪</span>{t('nav.household')}</button>
      </nav>
      <footer className="foot">{t('pwa.https')}</footer>
    </Ctx.Provider>
  )
}
