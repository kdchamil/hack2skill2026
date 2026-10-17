import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCommentary, scan, type ScanInput } from './api'
import { stopListen } from './audio'
import { Privacy } from './components/Privacy'
import type { ScanView } from './components/Summary'
import { AppContext, type AppCtx, type Route } from './appctx'
import { Area } from './screens/Area'
import { Basket } from './screens/Basket'
import { Claims } from './screens/Claims'
import { Compare } from './screens/Compare'
import { Detail } from './screens/Detail'
import { Household } from './screens/Household'
import { Library } from './screens/Library'
import { List } from './screens/List'
import { Scan } from './screens/Scan'
import { Summary } from './screens/Summary'
import { Thin } from './screens/Thin'
import { BottomBar } from './ui'
import { Ctx, makeCtx } from './ctx'
import type { Lang } from './types'
import { useVault } from './useVault'

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
  const [route, setRoute] = useState<Route>({ tab: 'scan' })
  const [member, setMember] = useState<string | null>(null)
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
    setMember(null)
    setRoute({ tab: 'scan', sub: 'summary' })
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

  // after delete-all: drop the in-memory scan, stop audio and requests, back to first-run language
  const onDeleted = useCallback(() => {
    abort.current?.abort()
    stopListen()
    setView({ ...EMPTY })
    setLangState('en')
    setMember(null)
    setRoute((r) => (r.tab === 'scan' && r.sub ? { tab: 'scan' } : r))
  }, [])

  const navigate = useCallback((r: Route) => { stopListen(); setRoute(r) }, [])
  const app = useMemo<AppCtx>(() => ({ route, navigate, member, setMember, view, vault, runScan, setLang, onDeleted }),
    [route, navigate, member, view, vault, runScan, setLang, onDeleted])
  const sub = route.sub

  return (
    <Ctx.Provider value={ctx}>
      <AppContext.Provider value={app}>
        <a href="#main" className="skip">{t('skip')}</a>
        <header className="top">
          <span className="brand" translate="no"><span aria-hidden="true">⏱</span> {t('app.name')}</span>
          <div className="row">
            {sub !== 'summary' && (
              <div className="row" role="group" aria-label={t('lang.label')}>
                {(['en', 'si', 'ta'] as Lang[]).map((l) => (
                  <button key={l} type="button" className="btn chip-btn" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
                    {{ en: 'EN', si: 'සිං', ta: 'தமிழ்' }[l]}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="btn ghost" aria-current={route.tab === 'privacy' ? 'page' : undefined} onClick={() => navigate({ tab: 'privacy' })}>{t('nav.privacy')}</button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {route.tab === 'scan' && (!sub ? <Scan /> : sub === 'summary' ? <Summary /> : sub === 'thin' ? <Thin /> : sub === 'area' ? <Area /> : sub === 'detail' ? <Detail /> : <Claims />)}
          {route.tab === 'list' && (sub === 'compare' ? <Compare /> : <List />)}
          {route.tab === 'library' && <Library />}
          {route.tab === 'basket' && <Basket />}
          {route.tab === 'household' && <Household />}
          {route.tab === 'privacy' && <Privacy vault={vault} onDeleted={onDeleted} />}
        </main>
        <BottomBar current={route.tab === 'privacy' ? null : route.tab} onGo={(x) => navigate({ tab: x })} />
        <footer className="foot">{t('pwa.https')}</footer>
      </AppContext.Provider>
    </Ctx.Provider>
  )
}
