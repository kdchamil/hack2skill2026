import { useEffect, useState } from 'react'
import { useApp } from '../appctx'
import { getRanges, parseList } from '../api-list'
import { useT } from '../ctx'
import { answerAsk, clearList, dismissCompare, openCompare, progress, removeItem, saveItems, toItems, useListState, type ComparePair, type ListItem } from '../list'
import type { Range } from '../types'
import { GradeTile, Sheet } from '../ui'
import { Compare } from './Compare'

const MAX = 2000
type Draft = ListItem[]

function Review({ draft, setDraft, ranges, onSave, onDiscard }: { draft: Draft; setDraft: (d: Draft) => void; ranges: Range[]; onSave: () => void; onDiscard: () => void }) {
  const { t, lang } = useT()
  const upd = (id: string, p: Partial<ListItem>) => setDraft(draft.map((i) => (i.id === id ? { ...i, ...p } : i)))
  return (
    <section className="stack" aria-labelledby="h-review">
      <h2 id="h-review">{t('list.review')}</h2>
      <p className="muted">{t('list.reviewHint')}</p>
      <ul className="cards" data-testid="review">
        {draft.map((i) => (
          <li key={i.id} className="card" style={{ padding: 12 }}>
            <div className="stack">
              <label className="field">{t('list.name')}<input value={i.name} onChange={(e) => upd(i.id, { name: e.target.value })} /></label>
              <div className="row wrap">
                <label className="field" style={{ flex: 1 }}>{t('list.qty')}
                  <input inputMode="decimal" value={i.quantity ?? ''} onChange={(e) => upd(i.id, { quantity: e.target.value === '' || isNaN(Number(e.target.value)) ? null : Number(e.target.value) })} /></label>
                <label className="field" style={{ flex: 1 }}>{t('list.unit')}<input value={i.unit ?? ''} onChange={(e) => upd(i.id, { unit: e.target.value || null })} /></label>
              </div>
              <label className="field">{t('list.brand')}<input value={i.brand ?? ''} onChange={(e) => upd(i.id, { brand: e.target.value || null })} /></label>
              <label className="field">{t('list.range')}
                <select value={i.range_id ?? ''} onChange={(e) => upd(i.id, { range_id: e.target.value || null })}>
                  <option value="">{t('list.rangeAny')}</option>
                  {ranges.map((r) => <option key={r.id} value={r.id}>{r.keywords[lang][0] ?? r.name}</option>)}
                </select></label>
              <button type="button" className="btn danger small" aria-label={t('list.remove', { name: i.name })} onClick={() => setDraft(draft.filter((x) => x.id !== i.id))}>{t('list.remove', { name: i.name })}</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="row"><button type="button" className="btn primary" disabled={!draft.length} onClick={onSave}>{t('list.save')}</button>
        <button type="button" className="btn secondary" onClick={onDiscard}>{t('list.discard')}</button></div>
    </section>
  )
}

export function List() {
  const { t, lang } = useT()
  const { vault } = useApp()
  const s = useListState()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [ranges, setRanges] = useState<Range[]>([])
  useEffect(() => { void getRanges().then(setRanges).catch(() => {}) }, [])

  if (s.comparing) return <Compare />
  const parse = async () => {
    setBusy(true); setErr('')
    try { setDraft(toItems(await parseList(text, lang))) } catch { setErr(t('list.err')) } finally { setBusy(false) }
  }
  const pr = progress(s.items)
  return (
    <div className="stack">
      <h1>{t('list.title')}</h1>
      {vault.status !== 'unlocked' && <p className="muted" role="note">{t('list.memoryOnly')}</p>}
      {draft ? (
        <Review draft={draft} setDraft={setDraft} ranges={ranges} onSave={() => { saveItems(draft); setDraft(null); setText('') }} onDiscard={() => setDraft(null)} />
      ) : (
        <>
          <section className="stack" aria-labelledby="h-paste">
            <h2 id="h-paste">{t('list.paste')}</h2>
            <label className="field"><span className="muted">{t('list.pasteHint')}</span>
              <textarea rows={5} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('list.paste')} /></label>
            <div className="muted" aria-live="polite">{text.length}/{MAX}</div>
            {err && <p role="alert">{err}</p>}
            <button type="button" className="btn primary" disabled={busy || !text.trim()} onClick={() => void parse()}>{busy ? t('list.parsing') : t('list.parse')}</button>
          </section>
          <section className="stack" aria-labelledby="h-items">
            <h2 id="h-items">{t('list.items')}</h2>
            {s.items.length === 0 ? <p className="muted">{t('list.empty')}</p> : (
              <>
                <p data-testid="progress" aria-label={t('list.progressAria', { found: pr.found, total: s.items.length, open: pr.open })}>{t('list.progress', { found: pr.found, open: pr.open })}</p>
                <ul className="cards">
                  {s.items.map((i) => {
                    const sc = i.found ? s.scans[i.found.scanId] : null
                    return (
                      <li key={i.id} className="card" style={{ padding: 12 }} data-item={i.name}>
                        <div className="row between">
                          <div><strong>{i.name}</strong>
                            <div className="muted">{[i.quantity, i.unit, i.brand].filter((x) => x !== null && x !== '').join(' ')}</div></div>
                          <span className="muted">{i.found ? `✓ ${t('list.found')}` : t('list.open')}</span>
                        </div>
                        {sc && <div className="row" style={{ marginTop: 8 }}><GradeTile grade={sc.grade} size="sm" /><span>{t('list.foundAs', { name: sc.name })}</span></div>}
                        <button type="button" className="btn ghost small" aria-label={t('list.remove', { name: i.name })} onClick={() => removeItem(i.id)}>{t('list.remove', { name: i.name })}</button>
                      </li>
                    )
                  })}
                </ul>
                <p className="muted">{t('list.scanNote')}</p>
                <div className="row"><button type="button" className="btn secondary" onClick={() => setDraft(s.items)}>{t('list.edit')}</button>
                  <button type="button" className="btn secondary" onClick={clearList}>{t('list.clear')}</button></div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** Mount once near the app root. "Is this for...?" (FR-51) and "Compare these two?" (FR-52). Not now has equal weight; each pair is offered once. */
export function ListPrompts({ onCompare }: { onCompare?: (p: ComparePair) => void }) {
  const { t } = useT()
  const s = useListState()
  const nm = (id: string) => s.scans[id]?.name || '…'
  if (s.ask) {
    const cands = s.ask.candidates.map((id) => s.items.find((i) => i.id === id)).filter((i): i is ListItem => !!i)
    if (cands.length) {
      const product = nm(s.ask.scanId)
      const dismiss = () => answerAsk(null)
      return cands.length === 1 ? (
        <Sheet title={t('ask.title', { item: cands[0].name })} labelId="ask-h" onClose={dismiss} primary={{ label: t('ask.yes'), onClick: () => answerAsk(cands[0].id) }}>
          <p>{t('ask.body', { product, item: cands[0].name })}</p>
        </Sheet>
      ) : (
        <Sheet title={t('ask.pick', { product })} labelId="ask-h" onClose={dismiss}>
          {cands.map((i) => <button key={i.id} type="button" className="btn secondary" onClick={() => answerAsk(i.id)}>{i.name}</button>)}
          <button type="button" className="btn secondary" onClick={dismiss}>{t('sheet.notNow')}</button>
        </Sheet>
      )
    }
  }
  if (s.compare) {
    const c = s.compare
    return (
      <Sheet title={t('cmpq.title')} labelId="cmpq-h" onClose={dismissCompare}
        primary={{ label: t('cmpq.yes'), onClick: () => { openCompare(c); onCompare?.(c) } }}>
        <p>{t('cmpq.body', { a: nm(c.firstScanId), b: nm(c.secondScanId) })}</p>
      </Sheet>
    )
  }
  return null
}
