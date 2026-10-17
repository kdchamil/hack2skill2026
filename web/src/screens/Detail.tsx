import { useState } from 'react'
import { routes, useApp } from '../appctx'
import { ReportSheet } from '../components/ReportSheet'
import { useT, useVerdictText } from '../ctx'
import { cardHeadline, topNutrient } from '../grade'
import type { GradeCardId, NutrientKey, Source } from '../types'
import { GradeTile, StatusBadge, SummaryStrip, TierBadge } from '../ui'
import { FindingRow, Listen, useScanData } from './parts'

const NUTS: NutrientKey[] = ['energy_kcal', 'sugars_total', 'fat_saturated', 'sodium_mg', 'salt_g', 'protein', 'fibre', 'carbohydrate', 'fat_total']
const fmt = (n: unknown) => (typeof n === 'number' ? String(Math.round(n * 10) / 10) : '—')

export function Detail() {
  const { t } = useT()
  const vtext = useVerdictText()
  const { route, navigate } = useApp()
  const d = useScanData()
  const { a, c, rings, name, member, toggle, verdicts, scanId } = d
  const [rep, setRep] = useState(false)
  const card = a?.cards.find((x) => x.id === (route.id as GradeCardId))
  if (!a || !card) {
    return <section className="stack"><h1>{t('sum.title')}</h1><button type="button" className="btn primary" onClick={() => navigate(routes.scan)}>{t('sum.newScan')}</button></section>
  }
  const title = t(`card.${card.id}`)
  const fs = a.findings.filter((f) => card.finding_ids.includes(f.id) || f.card === card.id)
  const top = card.id === 'nutrition' ? topNutrient(fs) : null
  const summary = fs.find((f) => f.id === 'nutrition.summary')?.data as { per_100g?: Record<string, number>; per_serving?: Record<string, number>; pct_ri?: Record<string, number>; ri_basis?: string; serving_size_g?: number } | undefined
  const sources: (Source & { tier: typeof card.tier })[] = []
  for (const f of fs) for (const s of f.sources) if (!sources.some((x) => x.label === s.label)) sources.push({ ...s, tier: f.tier })
  const shown = fs.filter((f) => f.id !== 'nutrition.summary' && f.data.placeholder !== true)
  const headline = cardHeadline(a, card.id, c)
  const reason = c?.cards[card.id]?.reason ?? ''
  // household note: only reasons about nutrients, and only for nutrition
  const notes = card.id === 'nutrition'
    ? verdicts.filter((v) => (!member || v.memberId === member)).map((v) => ({ ...v, reasons: v.reasons.filter((r) => r.code.startsWith('nutrient')) })).filter((v) => v.reasons.length).map((v) => ({ ...v, level: 'check' as const }))
    : []
  const topKey = top ? String(top.finding.data.nutrient) : ''
  const topName = top ? t(`nut.${topKey}`).replace(/ \(.*\)$/, '').toLocaleLowerCase() : ''
  const bar = top ? Math.min(100, top.pct) : null

  return (
    <section aria-labelledby="det-h" className="stack">
      <SummaryStrip grade={a.grade.letter} name={name} members={rings} selectedId={member} onSelectMember={toggle} onBack={() => navigate(routes.summary)} />
      <div className="gradehead">
        {card.grade ? <GradeTile grade={card.grade} size="lg" /> : <StatusBadge status="unknown" />}
        <div>
          <h1 id="det-h">{title}</h1>
          <p className="strong">{top ? t('detail.pctRef', { p: Math.round(top.pct), n: topName }) : card.grade ? headline : t('detail.noGrade')}</p>
          <TierBadge tier={card.tier} />
        </div>
      </div>
      {bar !== null && <div className="meter" role="img" aria-label={t('detail.pctRef', { p: Math.round(top!.pct), n: topName })}><span style={{ width: `${bar}%` }} /></div>}
      {reason && <p>{reason}</p>}

      {summary?.per_100g && (
        <table className="ntable">
          <caption className="sr-only">{title}{summary.ri_basis ? ` (${summary.ri_basis})` : ''}</caption>
          <thead><tr><th scope="col" /><th scope="col">{t('detail.perServing')}</th><th scope="col">{t('detail.per100')}</th><th scope="col">{t('detail.pct')}</th></tr></thead>
          <tbody>
            {NUTS.filter((k) => summary.per_100g?.[k] !== undefined).map((k) => (
              <tr key={k}><th scope="row">{t(`nut.${k}`)}</th><td>{fmt(summary.per_serving?.[k])}</td><td>{fmt(summary.per_100g?.[k])}</td><td>{summary.pct_ri?.[k] !== undefined ? `${fmt(summary.pct_ri[k])}%` : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      {notes.length > 0 && (
        <section aria-labelledby="hh-n"><h2 id="hh-n" className="h2s">{t('detail.household')}</h2>
          {notes.map((v) => <p key={v.memberId} className="note">{vtext(v)}</p>)}
        </section>
      )}

      <h2 className="h2s">{t('detail.findings')}</h2>
      {shown.length === 0 && <p className="muted">{t('detail.noGrade')}</p>}
      {shown.map((f) => <FindingRow key={f.id} f={f} />)}

      <h2 className="h2s">{t('detail.sources', { n: sources.length })}</h2>
      <ul className="kvlist">
        {sources.map((s) => <li key={s.label} className="kv"><span>{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a> : s.label}</span><TierBadge tier={s.tier} /></li>)}
      </ul>
      <div className="actions"><button type="button" className="btn ghost" disabled={!scanId} onClick={() => setRep(true)}>{t('d.report')}</button></div>
      {rep && scanId && <ReportSheet scanId={scanId} findingId={fs[0]?.id} onClose={() => setRep(false)} />}
      <Listen text={`${title}. ${headline}. ${reason}`.trim()} tag={`card-${card.id}`} />
    </section>
  )
}
