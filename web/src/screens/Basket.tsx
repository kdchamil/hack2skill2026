import { useEffect } from 'react'
import { useApp } from '../appctx'
import { useT } from '../ctx'
import { LETTERS, summarizeBasket } from '../basket'
import { endTrip, expireBasket, useListState } from '../list'
import { GradeTile } from '../ui'

const COLOR: Record<string, string> = { A: 'var(--good-bd)', B: 'var(--good-bd)', C: 'var(--check-bd)', D: 'var(--check-bd)', E: 'var(--avoid-bd)' }

export function Basket() {
  const { t } = useT()
  const { vault } = useApp()
  const s = useListState()
  useEffect(() => { expireBasket() }, [])
  const b = summarizeBasket(s, vault.members)
  const total = b.products.length
  return (
    <div className="stack">
      <header className="page-head"><h1>{t('bsk.title')}</h1>
        <span className="muted">{t('bsk.count', { n: total })}{s.basket?.setAside.length ? ` · ${t('bsk.asideCount', { n: s.basket.setAside.length })}` : ''}</span></header>
      {total === 0 ? <p>{t('bsk.empty')}</p> : (
        <div className="bsk-grid">
          <section className="stack glass span-2" aria-labelledby="h-spread">
            <h2 id="h-spread">{t('bsk.spread')}</h2>
            <p><strong>{t('bsk.spreadLine', { n: b.goodCount, total })}</strong></p>
            <div className="spread" role="img" aria-label={t('bsk.spreadAria', { ...b.spread })}>
              {LETTERS.filter((l) => b.spread[l]).map((l) => (
                <span key={l} aria-hidden="true" style={{ flex: b.spread[l], background: COLOR[l] }}>{l} {b.spread[l]}</span>
              ))}
              {b.spread.none > 0 && <span aria-hidden="true" style={{ flex: b.spread.none, background: 'var(--border)' }}>– {b.spread.none}</span>}
            </div>
          </section>
          <section className="stack glass span-2" aria-labelledby="h-alerts">
            <h2 id="h-alerts">{t('bsk.alerts')}{b.alerts.length ? ` · ${b.alerts.length}` : ''}</h2>
            {vault.members.length === 0 ? <p className="muted">{t('bsk.membersNote')}</p> : b.alerts.length === 0 ? <p>{t('bsk.noAlerts')}</p> : (
              <ul className="cards" data-testid="alerts">
                {b.alerts.map((a) => (
                  <li key={a.memberId + a.scanId} className="card" style={{ padding: 12, minHeight: 48 }}>
                    <strong>{a.level === 'avoid' ? t('bsk.avoid') : t('bsk.check')}</strong> · {t('bsk.alertLine', { name: a.alias, product: a.product })}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="stack glass" aria-labelledby="h-pack">
            <h2 id="h-pack">{t('bsk.packaging')}</h2>
            <ul className="chips" data-testid="packaging">
              {Object.entries(b.packaging).map(([k, n]) => <li key={k}>{k || t('bsk.packNone')}: {n}</li>)}
            </ul>
          </section>
          <section className="stack glass" aria-labelledby="h-prod">
            <h2 id="h-prod">{t('bsk.products')}</h2>
            <ul className="cards">{b.products.map((p) => <li key={p.scanId} className="card row"><GradeTile grade={p.grade} size="sm" /><span>{p.name}</span></li>)}</ul>
          </section>
        </div>
      )}
      <section className="stack" aria-labelledby="h-open">
        <h2 id="h-open">{t('bsk.open')}</h2>
        {b.open.length === 0 ? <p className="muted">{t('bsk.openNone')}</p> : <ul className="chips">{b.open.map((i) => <li key={i.id}>{i.name}</li>)}</ul>}
      </section>
      {(total > 0 || s.items.some((i) => i.found)) && (
        <>
          <p className="muted">{t('bsk.endNote')}</p>
          <button type="button" className="btn danger" onClick={endTrip}>{t('bsk.end')}</button>
        </>
      )}
    </div>
  )
}
