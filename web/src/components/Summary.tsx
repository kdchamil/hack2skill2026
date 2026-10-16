import { useMemo, useState } from 'react'
import { useT, useVerdictText } from '../ctx'
import { LANG_LABELS } from '../i18n'
import type { Analysis, Card, CardId, Commentary, Lang } from '../types'
import { computeVerdicts, type Member } from '../verdict'
import type { VaultStatus } from '../useVault'
import { SevBadge, TierBadge } from './Badges'
import { EvidenceSheet } from './Evidence'
import { ListenButton, ListenPanel } from './ListenBar'

export interface ScanView {
  analysis: Analysis | null
  commentary: Commentary | null
  scanId: string | null
  elapsedMs: number | null
  phase: 'loading' | 'streaming' | 'done' | 'error'
  error: string | null
  cached?: boolean
}

const ICON: Record<CardId, string> = { allergens: '🥜', nutrition: '🍽️', diet: '🌱', ingredients: '📋', claims: '🏷️', packaging: '♻️' }

export function Summary({ view, members, vault, lang, setLang, onNew, onGoHousehold }: {
  view: ScanView; members: Member[]; vault: VaultStatus; lang: Lang; setLang: (l: Lang) => void; onNew: () => void; onGoHousehold: () => void
}) {
  const { t } = useT()
  const vtext = useVerdictText()
  const [open, setOpen] = useState<Card | 'all' | null>(null)
  const a = view.analysis
  const verdicts = useMemo(() => (a ? computeVerdicts(members, a.facts) : []), [a, members])

  const headline = (c: Card) => view.commentary?.cards[c.id]?.headline || c.headline
  const cardReason = (c: Card) => view.commentary?.cards[c.id]?.reason ?? ''
  const name = a?.product.name.value ?? t('sum.unnamed')
  const summaryText = view.commentary?.summary || (a ? [name, ...a.cards.map(headline)].join('. ') : '')

  const bannerText = (b: string) => {
    const [kind, arg = ''] = b.split(':')
    if (kind === 'expired') return { text: t('sum.expired', { date: arg }), sev: 'avoid' as const }
    if (kind === 'near_expiry') return { text: t('sum.near', { date: arg }), sev: 'check' as const }
    if (kind === 'retake') return { text: t(`retake.${arg}`), sev: 'check' as const }
    return { text: b, sev: 'info' as const }
  }

  return (
    <section aria-labelledby="sum-h" className="stack">
      <div className="row between wrap">
        <h1 id="sum-h">{a ? name : t('sum.title')}</h1>
        <div className="row" role="group" aria-label={t('lang.label')}>
          {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
            <button key={l} type="button" className="btn chip-btn" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{LANG_LABELS[l].short}</button>
          ))}
        </div>
      </div>

      <div aria-live="polite" role="status" className="muted">
        {view.phase === 'loading' && t('scan.analysing')}
        {view.phase === 'error' && <span className="error">{t('scan.error', { msg: view.error ?? '' })}</span>}
        {view.elapsedMs !== null && <span data-testid="elapsed">{t('sum.elapsed', { ms: view.elapsedMs })}</span>}
        {view.phase === 'streaming' && ` · ${t('sum.writing')}`}
      </div>

      {a && (
        <>
          {a.product.brand.value && <p className="muted">{a.product.brand.value}</p>}
          {a.banners.length > 0 && (
            <ul className="banners" aria-label="Notices">
              {a.banners.map((b) => { const x = bannerText(b); return <li key={b} className={`banner banner-${x.sev}`}><SevBadge sev={x.sev} /> <span>{x.text}</span></li> })}
            </ul>
          )}
          {a.product.retake_tip && <p className="banner banner-check">{a.product.retake_tip}</p>}

          <div className="listen-row">
            <ListenButton big text={summaryText} tag="summary" />
          </div>
          {!open && <ListenPanel />}

          <section aria-labelledby="hh-h" className="chips-block">
            <h2 id="hh-h">{t('sum.household')}</h2>
            {vault !== 'unlocked' && <p className="muted">{t('sum.unlock')} <button type="button" className="link" onClick={onGoHousehold}>{t('nav.household')}</button></p>}
            {vault === 'unlocked' && members.length === 0 && <p className="muted">{t('sum.noMembers')}</p>}
            <ul className="chips">
              {verdicts.map((v) => (
                <li key={v.memberId} className={`vchip vchip-${v.level}`} data-level={v.level}>
                  <span className="glyph" aria-hidden="true">{v.level === 'avoid' ? '✕' : v.level === 'check' ? '!' : '✓'}</span>
                  <span><strong>{t(`verdict.${v.level}`)}</strong> · {vtext(v)}</span>
                </li>
              ))}
            </ul>
          </section>

          <h2 className="sr-only">{t('sum.cards')}</h2>
          <ul className="cards">
            {a.cards.map((c) => (
              <li key={c.id} className={`card card-${c.status}`} data-card={c.id}>
                <button type="button" className="card-main" onClick={() => setOpen(c)} aria-haspopup="dialog">
                  <span className="card-icon" aria-hidden="true">{ICON[c.id]}</span>
                  <span className="card-text">
                    <span className="card-title">{t(`card.${c.id}`)}</span>
                    <span className="card-headline">{headline(c)}</span>
                    <span className="row wrap"><SevBadge sev={c.status} /><TierBadge tier={c.tier} /></span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="actions">
            <button type="button" className="btn secondary" onClick={() => setOpen('all')}>{t('sum.allEvidence')}</button>
            <button type="button" className="btn secondary" onClick={onNew}>{t('sum.newScan')}</button>
          </div>

          {open && open !== 'all' && (
            <EvidenceSheet
              title={`${t(`card.${open.id}`)}: ${headline(open)}`}
              scanId={view.scanId}
              findings={a.findings.filter((f) => open.finding_ids.includes(f.id) || f.card === open.id)}
              onClose={() => setOpen(null)}
              extra={<><ListenButton text={`${headline(open)}. ${cardReason(open)}`.trim()} tag={`card-${open.id}`} /><ListenPanel /></>}
            />
          )}
          {open === 'all' && <EvidenceSheet title={t('sum.allEvidence')} scanId={view.scanId} findings={a.findings} onClose={() => setOpen(null)} />}
        </>
      )}
      {!a && view.phase === 'error' && <button type="button" className="btn primary" onClick={onNew}>{t('common.retry')}</button>}
    </section>
  )
}
