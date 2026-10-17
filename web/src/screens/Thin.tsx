import { routes, useApp } from '../appctx'
import { useT } from '../ctx'
import { TierBadge } from '../ui'
import type { Tier } from '../types'
import { Listen, useScanData } from './parts'

export function Thin() {
  const { t } = useT()
  const { navigate, vault } = useApp()
  const { a, name } = useScanData()
  if (!a) return null
  const p = a.product
  const row = (label: string, value: string | null, tier: Tier) => (
    <li className="kv"><span>{label}{value ? `: ${value}` : ''}</span><TierBadge tier={tier} /></li>
  )
  const nameOk = !!(p.name.value || p.brand.value)
  const codes = p.packaging_codes.value ?? []
  const names = vault.members.map((m) => m.alias).join(', ')
  const text = `${t('thin.head')}. ${t('thin.body')}`
  return (
    <section aria-labelledby="thin-h" className="stack">
      <h1 id="thin-h" className="sr-only">{t('thin.head')}</h1>
      <div className="thinbox" data-testid="no-grade">
        <span className="grade grade-none grade-lg" role="img" aria-label={t('grade.noneAria')}>{t('thin.noGrade')}</span>
        <div>
          <h2>{name}</h2>
          <p className="strong">{t('thin.head')}</p>
          <p>{t('thin.body')}</p>
        </div>
      </div>
      <button type="button" className="btn primary" onClick={() => navigate(routes.scan)}>{t('thin.retake')}</button>
      {names ? <p className="note" data-testid="thin-everyone">{t('thin.everyone', { names })}</p> : <p className="muted">{t('thin.noMembers')}</p>}
      <h2 className="h2s">{t('thin.read')}</h2>
      <ul className="kvlist">
        {row(t('thin.name'), nameOk ? [p.name.value, p.brand.value].filter(Boolean).join(' · ') : null, nameOk ? 'label_stated' : 'unknown')}
        {row(t('thin.packaging'), codes.length ? codes.join(', ') : null, codes.length ? 'label_stated' : 'unknown')}
        {row(t('thin.ingredients'), p.ingredients.value ? `${p.ingredients.value.length}` : null, p.ingredients.value ? 'label_stated' : 'unknown')}
        {row(t('thin.nutrition'), p.nutrition.value ? `${p.nutrition.value.length}` : null, p.nutrition.value ? 'label_stated' : 'unknown')}
      </ul>
      <p className="muted">{t('thin.tip')}</p>
      <Listen text={text} tag="thin" />
    </section>
  )
}
