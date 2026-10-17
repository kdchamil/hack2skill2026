import { routes, useApp } from '../appctx'
import { useT } from '../ctx'
import { areaGrades, areaHeadline, areaStatus, AREA_ORDER, GRADES } from '../grade'
import { AreaRow, GradeTile, RingRow, Skeleton, icons } from '../ui'
import { Listen, useScanData } from './parts'
import { Thin } from './Thin'

export function Summary() {
  const { t } = useT()
  const { navigate, retry, vault } = useApp()
  const { view, a, c, rings, name, member, toggle } = useScanData()

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
  const driverNames = g?.drivers.map((d) => t(`card.${d}`)).join(t('grade.and')) ?? ''
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
        <>
          <div className="gradehead">
            <GradeTile grade={g.letter} size="lg" />
            <div>
              <h1 id="sum-h">{name}</h1>
              {a.product.brand.value && <p className="muted">{a.product.brand.value}</p>}
              <p>{g.drivers.length ? t('grade.line', { g: g.letter ?? '', names: driverNames }) : t('grade.noDrivers', { g: g.letter ?? '' })}</p>
              <p className="muted">{t('sum.notAI')}</p>
            </div>
          </div>
          <ol className="gscale" aria-label={t('sum.scale')}>
            {GRADES.map((l) => <li key={l} className={l === g.letter ? 'on' : ''} aria-current={l === g.letter ? 'true' : undefined}>{l}</li>)}
          </ol>
          {g.planet_partial && <p className="note" data-testid="planet-partial">{t('grade.partial')}</p>}
          {a.banners.length > 0 && (
            <ul className="banners" aria-label="Notices">{a.banners.map((b) => <li key={b} className="banner banner-check"><icons.Triangle size={16} /> <span>{bannerText(b)}</span></li>)}</ul>
          )}
        </>
      )}
      {!a && <h1 id="sum-h" className="sr-only">{t('sum.title')}</h1>}

      <h2 className="h2s">{t('sum.suitable')}</h2>
      {vault.status !== 'unlocked' && <p className="muted">{t('sum.unlock')} <button type="button" className="link" onClick={() => navigate(routes.household)}>{t('nav.household')}</button></p>}
      {vault.status === 'unlocked' && vault.members.length === 0 && <p className="muted">{t('sum.noMembers')}</p>}
      {a && rings.length > 0 && <RingRow members={rings} selectedId={member} onSelect={toggle} />}
      {member && <p className="muted" role="status">{t('filter.showing', { name: rings.find((r) => r.id === member)?.name ?? '' })}</p>}

      <h2 className="sr-only">{t('sum.areas')}</h2>
      <div className="stack tight">
        {!a && AREA_ORDER.map((id) => <div key={id} className="area-row" aria-hidden="true"><Skeleton lines={2} height={18} /></div>)}
        {a && a.areas.map((ar) => (
          <AreaRow key={ar.id} area={ar.id} title={t(`area.title.${ar.id}`)} headline={areaHeadline(ar, c) || t('sum.loading')}
            grades={ar.card_ids.length ? areaGrades(a, ar) : undefined} status={ar.card_ids.length ? undefined : areaStatus(ar)}
            onOpen={() => navigate(routes.area(ar.id))} />
        ))}
      </div>
      {a && <div className="actions"><button type="button" className="btn secondary" onClick={() => navigate(routes.scan)}>{t('sum.newScan')}</button></div>}
      {a && <Listen text={summaryText} tag="summary" />}
    </section>
  )
}
