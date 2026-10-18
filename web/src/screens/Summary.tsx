import { routes, useApp } from '../appctx'
import { useT, useVerdictText } from '../ctx'
import { areaGrades, areaHeadline, areaStatus, AREA_ORDER, GRADES, gradeSentence, relevantTo } from '../grade'
import { isStale, recheck, staleMembers } from '../library'
import { AreaRow, GradeTile, RingRow, Skeleton, icons } from '../ui'
import { FindingRow, Listen, useScanData } from './parts'
import { Thin } from './Thin'
import { AiTrace } from './AiTrace'

export function Summary() {
  const { t, lang } = useT()
  const { navigate, retry, vault, updateSaved } = useApp()
  const vtext = useVerdictText()
  const { view, a, c, sample, rings, name, member, toggle, picked, pickedVerdict } = useScanData()

  if (view.phase === 'error' && !a) {
    return (
      <section className="stack" aria-labelledby="sum-h">
        <h1 id="sum-h">{t('sum.errorHead')}</h1>
        <p role="alert" className="error">{t('sum.error', { msg: view.error ?? '' })}</p>
        <div className="actions">
          <button type="button" className="btn primary" onClick={retry}>{t('common.retry')}</button>
          <button type="button" className="btn secondary" onClick={() => navigate(routes.scan)}>{t('sum.newScan')}</button>
        </div>
      </section>
    )
  }
  if (a && a.grade.letter === null) return <Thin />

  const g = a?.grade
  // What in this product matches the selected member's profile, across every area.
  const watch = a && picked ? a.findings.filter((f) => relevantTo(f, picked)) : []
  const gradeLine = a && g ? gradeSentence(t, a.cards, g.letter) : ''
  const summaryText = c?.summary || (a ? [name, ...a.areas.map((x) => areaHeadline(x, c))].join('. ') : '')
  const bannerText = (b: string) => {
    const [kind, arg = ''] = b.split(':')
    if (kind === 'expired') return t('sum.expired', { date: arg })
    if (kind === 'near_expiry') return t('sum.near', { date: arg })
    if (kind === 'retake') return t(`retake.${arg}`)
    return b
  }

  return (
    <section aria-labelledby="sum-h" className="stack" aria-busy={view.phase !== 'done'}>
      {/* announced once: when the grade arrives */}
      <p className="sr-only" role="status" aria-live="polite">{a ? t('sum.ready', { g: g?.letter ?? '', name }) : t('sum.loading')}</p>
      {!a && (
        <div className="gradehead">
          <Skeleton height={72} width={72} />
          <Skeleton lines={2} height={20} />
        </div>
      )}
      {a && g && (
        <div className="hero glass">
          <div className="gradehead">
            <GradeTile grade={g.letter} size="lg" />
            <div>
              <h1 id="sum-h">{name}</h1>
              <p className="muted">{[a.product.brand.value, t('sum.notAI')].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <p className="hero-line">{gradeLine || t('grade.noDrivers', { g: g.letter ?? '' })}</p>
          <ol className="gscale" aria-label={t('sum.scale')}>
            {GRADES.map((l) => <li key={l} className={l === g.letter ? 'on' : ''} aria-current={l === g.letter ? 'true' : undefined}>{l}</li>)}
          </ol>
          {(g.planet_partial || a.banners.length > 0) && (
            <ul className="banners" aria-label="Notices">
              {a.banners.map((b) => <li key={b} className="banner banner-check"><icons.Triangle size={16} /> <span>{bannerText(b)}</span></li>)}
              {g.planet_partial && <li className="banner banner-info" data-testid="planet-partial"><icons.Planet size={16} /> <span>{t('grade.partial')}</span></li>}
            </ul>
          )}
        </div>
      )}
      {view.saved && (
        <div className="banner banner-info" role="status" data-testid="saved-note">
          <p>{t('lib.offline', { date: new Date(view.saved.ts).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }) })}</p>
          {vault.status === 'unlocked' && isStale(view.saved, vault.members) && (
            <p data-testid="saved-stale">{t('lib.stale', { names: staleMembers(view.saved, vault.members).map((m) => m.alias).join(', ') })}{' '}
              <button type="button" className="btn secondary small" onClick={() => { const s = view.saved; if (s) void recheck(s, vault.members).then(updateSaved) }}>{t('lib.recheck')}</button></p>
          )}
        </div>
      )}
      {!a && <h1 id="sum-h" className="sr-only">{t('sum.title')}</h1>}

      <div className="suit">
        <h2 className="h2s">{t('sum.suitable')}</h2>
        {sample && (
          <p className="sample-chip" data-testid="sample-household">
            <strong>{t('sum.sample')}</strong> <span>{t('sum.sampleNote')}</span>{' '}
            <button type="button" className="link" onClick={() => navigate(routes.household)}>{t('sum.setUpOwn')}</button>
          </p>
        )}
      </div>
      {!sample && vault.status !== 'unlocked' && <p className="muted">{t('sum.unlock')} <button type="button" className="link" onClick={() => navigate(routes.household)}>{t('nav.household')}</button></p>}
      {!sample && vault.status === 'unlocked' && vault.members.length === 0 && <p className="muted">{t('sum.noMembers')}</p>}
      {a && rings.length > 0 && <RingRow members={rings} selectedId={member} onSelect={toggle} />}
      {a && picked && pickedVerdict && (
        <section className={`watch watch-${pickedVerdict.level}`} aria-labelledby="sum-watch-h" data-testid="watch">
          <h2 id="sum-watch-h">{t('area.watch', { name: picked.alias })}</h2>
          <p role="status">{vtext(pickedVerdict)}</p>
          {watch.map((f) => <FindingRow key={f.id} f={f} onOpen={() => navigate(routes.area(f.area))} />)}
        </section>
      )}

      <h2 className="sr-only">{t('sum.areas')}</h2>
      <div className="bento">
        {!a && AREA_ORDER.map((id) => <div key={id} className="area-row" aria-hidden="true"><Skeleton lines={2} height={18} /></div>)}
        {a && a.areas.map((ar) => (
          <AreaRow key={ar.id} area={ar.id} title={t(`area.title.${ar.id}`)} headline={areaHeadline(ar, c) || t('sum.loading')}
            grades={ar.card_ids.length ? areaGrades(a, ar) : undefined} status={ar.card_ids.length ? undefined : areaStatus(ar)}
            onOpen={() => navigate(routes.area(ar.id))} />
        ))}
      </div>
      {a && (
        <div className="sum-foot">
          <AiTrace />
          <button type="button" className="btn secondary small" onClick={() => navigate(routes.scan)}>{t('sum.newScan')}</button>
        </div>
      )}
      {a && <Listen text={summaryText} tag="summary" />}
    </section>
  )
}
