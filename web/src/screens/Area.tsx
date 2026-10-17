import { routes, useApp } from '../appctx'
import { useT, useVerdictText } from '../ctx'
import { areaHeadline, nextArea, relevantTo } from '../grade'
import type { AreaId } from '../types'
import { AreaTabs, SummaryStrip } from '../ui'
import { AREA_ORDER } from '../grade'
import { Body, Choice, People, Planet, Truth } from './AreaParts'
import { FindingRow, Listen, useScanData } from './parts'

const isArea = (s?: string): s is AreaId => AREA_ORDER.includes(s as AreaId)

export function Area() {
  const { t } = useT()
  const vtext = useVerdictText()
  const { route, navigate } = useApp()
  const d = useScanData()
  const { a, c, rings, name, member, toggle, picked, pickedVerdict } = d
  const id: AreaId = isArea(route.id) ? route.id : 'body'
  const area = a?.areas.find((x) => x.id === id)
  if (!a || !area) {
    return (
      <section className="stack" aria-labelledby="area-h">
        <h1 id="area-h">{t(`area.title.${id}`)}</h1>
        <p className="muted">{t('sum.loading')}</p>
        <button type="button" className="btn primary" onClick={() => navigate(routes.scan)}>{t('sum.newScan')}</button>
      </section>
    )
  }
  const watch = picked ? a.findings.filter((f) => relevantTo(f, picked) && f.area === id) : []
  const reason = c?.areas[id]?.reason
  const listenText = [t(`area.title.${id}`), areaHeadline(area, c), reason].filter(Boolean).join('. ')
  const next = nextArea(id)
  const go = (x: string) => navigate(routes.area(x))
  const props = { a, c, member: picked, scanId: d.scanId }

  return (
    <section aria-labelledby="area-h" className="stack">
      <SummaryStrip grade={a.grade.letter} name={name} members={rings} selectedId={member} onSelectMember={toggle} onBack={() => navigate(a.grade.letter ? routes.summary : routes.thin)} />
      <AreaTabs areas={AREA_ORDER.map((x) => ({ id: x, label: t(`tab.${x}`) }))} current={id} onSelect={go} />
      <h1 id="area-h">{t(`area.title.${id}`)}</h1>
      <p className="muted">{t(`area.sub.${id}`)}</p>
      {picked && pickedVerdict && (
        <section className="watch" aria-labelledby="watch-h" data-testid="watch">
          <h2 id="watch-h">{t('area.watch', { name: picked.alias })}</h2>
          {id === 'body' && <p>{vtext(pickedVerdict)}</p>}
          {watch.length ? watch.map((f) => <FindingRow key={f.id} f={f} />) : <p className="muted">{t('area.noWatch', { name: picked.alias })}</p>}
        </section>
      )}
      {id === 'body' && <Body {...props} />}
      {id === 'planet' && <Planet {...props} />}
      {id === 'people' && <People {...props} />}
      {id === 'truth' && <Truth {...props} />}
      {id === 'choice' && <Choice {...props} />}
      <Listen text={listenText} tag={`area-${id}`} onNext={() => (next ? go(next) : navigate(routes.summary))} />
    </section>
  )
}
