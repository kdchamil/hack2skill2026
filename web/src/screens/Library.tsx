import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../appctx'
import { useT } from '../ctx'
import {
  deleteAll, deleteEntry, filterEntries, isStale, librarySaving, listEntries, recheck, setLibrarySaving, staleMembers, type LibraryEntry, type SnapshotItem,
} from '../library'
import { GradeTile, RingRow, Sheet, TierBadge, type RingMember } from '../ui'
import type { Reason } from '../verdict'

type Filter = 'all' | 'week' | 'avoid' | 'ab'
const WEEK = 7 * 864e5
const dayKey = (ts: number) => new Date(ts).toDateString()

export function Library({ onOpen }: { onOpen?: (e: LibraryEntry) => void }) {
  const { t, lang } = useT()
  const { vault, navigate } = useApp()
  const [all, setAll] = useState<LibraryEntry[]>([])
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [saving, setSaving] = useState(librarySaving)
  const [open, setOpen] = useState<LibraryEntry | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [note, setNote] = useState('')
  const unlocked = vault.status === 'unlocked'
  const members = vault.members

  const reload = useCallback(() => { void listEntries().then(setAll).catch(() => setAll([])) }, [])
  useEffect(() => { if (unlocked) reload() }, [unlocked, reload, members.length])

  const reasonText = (r: Reason) => {
    const x = r.arg ? t(`${r.code.startsWith('nutrient') ? 'nutrient' : r.code.startsWith('diet') ? 'diet' : 'allergen'}.${r.arg}`).toLocaleLowerCase(lang) : ''
    return t(`r.${r.code}`, { x })
  }
  const rings = (snap: SnapshotItem[]): RingMember[] => snap.flatMap((s) => {
    const m = members.find((x) => x.id === s.m)
    return m ? [{ id: m.id, name: m.alias, level: s.v, reason: s.r.map(reasonText).join(', ') || undefined }] : []
  })

  const shown = useMemo(() => filterEntries(all, {
    text, from: filter === 'week' ? Date.now() - WEEK : undefined, verdict: filter === 'avoid' ? 'avoid' : undefined, grades: filter === 'ab' ? ['A', 'B'] : undefined,
  }), [all, text, filter])
  const groups = useMemo(() => {
    const g: { key: string; ts: number; items: LibraryEntry[] }[] = []
    for (const e of shown) {
      const k = dayKey(e.ts)
      const last = g[g.length - 1]
      if (last && last.key === k) last.items.push(e); else g.push({ key: k, ts: e.ts, items: [e] })
    }
    return g
  }, [shown])
  const dayLabel = (ts: number) => dayKey(ts) === dayKey(Date.now()) ? t('lib.today') : new Date(ts).toLocaleDateString(lang, { day: 'numeric', month: 'short' })
  const time = (ts: number) => new Date(ts).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
  const nm = (e: LibraryEntry) => e.name ?? t('lib.unnamed')

  const doOpen = (e: LibraryEntry) => (onOpen ? onOpen(e) : setOpen(e))
  const doRecheck = async (e: LibraryEntry) => {
    const n = await recheck(e, members)
    setAll((a) => a.map((x) => (x.id === n.id ? n : x))); setOpen((o) => (o?.id === n.id ? n : o)); setNote(t('lib.rechecked'))
  }
  const doDelete = async (e: LibraryEntry) => { await deleteEntry(e.id); setOpen(null); reload() }
  const toggleSaving = (on: boolean) => { setLibrarySaving(on); setSaving(on) }

  if (!unlocked) {
    return (
      <section className="stack" aria-labelledby="lib-h">
        <h1 id="lib-h">{t('lib.title')}</h1>
        <p>{t('lib.locked')}</p>
        <button type="button" className="btn primary" onClick={() => navigate({ tab: 'household' })}>{t('lib.goHousehold')}</button>
      </section>
    )
  }

  const filters: [Filter, string][] = [['all', 'lib.fAll'], ['week', 'lib.fWeek'], ['avoid', 'lib.fAvoid'], ['ab', 'lib.fAB']]
  return (
    <section className="stack lib" aria-labelledby="lib-h">
      <div>
        <h1 id="lib-h">{t('lib.title')}</h1>
        <p className="muted" data-testid="lib-sub">{t('lib.sub', { n: all.length })}</p>
      </div>
      {!saving && <p className="banner banner-info" role="status">{t('lib.paused')}</p>}
      <label className="field"><span className="sr-only">{t('lib.search')}</span>
        <input type="search" placeholder={t('lib.search')} aria-label={t('lib.search')} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="row wrap" role="group" aria-label={t('lib.filters')}>
        {filters.map(([f, k]) => <button key={f} type="button" className="btn chip-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(k)}</button>)}
      </div>
      {note && <p className="banner banner-info" role="status">{note}</p>}
      {all.length === 0 && <p data-testid="lib-empty">{t('lib.empty')}</p>}
      {all.length > 0 && shown.length === 0 && <p>{t('lib.noMatch')}</p>}
      {groups.map((g) => (
        <section key={g.key} className="stack" aria-label={dayLabel(g.ts)}>
          <h2 className="caption">{dayLabel(g.ts)}</h2>
          <ul className="list">
            {g.items.map((e) => {
              const stale = isStale(e, members)
              return (
                <li key={e.id} className="member lib-entry" data-testid="lib-entry">
                  <button type="button" className="row lib-open" style={{ flex: 1, minHeight: 48, textAlign: 'left', background: 'none', border: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                    aria-label={t('lib.open', { name: nm(e) })} onClick={() => doOpen(e)}>
                    <GradeTile grade={e.grade} />
                    <span className="stack" style={{ gap: 2 }}>
                      <strong>{nm(e)}</strong>
                      <span className="muted">{time(e.ts)}{e.brand ? ` · ${e.brand}` : ''}{e.list_item_id ? ` · ${t('lib.from')}` : ''}</span>
                    </span>
                  </button>
                  <RingRow members={rings(e.snapshot)} />
                  {stale && (
                    <div className="row wrap" style={{ width: '100%' }}>
                      <span className="muted" data-testid="lib-stale">{t('lib.stale', { names: staleMembers(e, members).map((m) => m.alias).join(', ') })}</span>
                      <button type="button" className="btn secondary small" onClick={() => void doRecheck(e)}>{t('lib.recheck')}</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <div className="member">
        <div><strong>{t('lib.save')}</strong><div className="muted">{t('lib.saveHint')}</div></div>
        <label className="check"><input type="checkbox" role="switch" checked={saving} aria-label={t('lib.save')} onChange={(e) => toggleSaving(e.target.checked)} /></label>
      </div>
      {all.length > 0 && <button type="button" className="btn danger" onClick={() => setConfirmAll(true)}>{t('lib.deleteAll')}</button>}

      {confirmAll && (
        <Sheet title={t('lib.deleteAll')} labelId="lib-del-h" onClose={() => setConfirmAll(false)}>
          <p>{t('lib.confirmAll', { n: all.length })}</p>
          <div className="actions">
            <button type="button" className="btn danger" onClick={() => { void deleteAll().then(() => { setConfirmAll(false); reload() }) }}>{t('lib.confirmYes')}</button>
            <button type="button" className="btn secondary" onClick={() => setConfirmAll(false)}>{t('lib.cancel')}</button>
          </div>
        </Sheet>
      )}
      {open && (
        <Sheet title={nm(open)} labelId="lib-entry-h" tall onClose={() => setOpen(null)}>
          <div className="stack">
            <div className="row"><GradeTile grade={open.grade} size="lg" /><span className="muted">{new Date(open.ts).toLocaleString(lang)}</span></div>
            {rings(open.snapshot).length > 0 ? <RingRow members={rings(open.snapshot)} /> : <p className="muted">{t('lib.noRings')}</p>}
            {open.original && (
              <>
                <h3>{t('lib.original')}</h3>
                <RingRow members={rings(open.original)} />
              </>
            )}
            {isStale(open, members) && <button type="button" className="btn secondary" onClick={() => void doRecheck(open)}>{t('lib.recheck')}</button>}
            <h3>{t('lib.cards')}</h3>
            <ul className="list">
              {open.cards.map((c) => (
                <li key={c.id} className="member"><span className="row"><GradeTile grade={c.grade} size="sm" /><span>{t(`lib.card.${c.id}`)}</span></span><TierBadge tier={c.tier} /></li>
              ))}
            </ul>
            <h3>{t('lib.findings')}</h3>
            <ul className="list">{open.findings.filter((f) => !f.data?.placeholder).map((f) => <li key={f.id}><strong>{f.title}</strong> <span className="muted">{f.reason}</span></li>)}</ul>
            <button type="button" className="btn danger" aria-label={t('lib.deleteAria', { name: nm(open) })} onClick={() => void doDelete(open)}>{t('lib.delete')}</button>
          </div>
        </Sheet>
      )}
    </section>
  )
}
