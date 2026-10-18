import { useRef, useState } from 'react'
import { MIN_PIN_LENGTH, pinIsValid } from '../crypto'
import { useT } from '../ctx'
import type { Vault } from '../useVault'
import {
  ALLERGENS, DIETS, demoMembers, GOALS, LIFE_STAGES, MAX_ALIAS, MAX_MEMBERS, type AllergenId, type DietId, type GoalId, type LifeStage, type Member,
} from '../verdict'
import { librarySaving, setLibrarySaving } from '../library'
import { Ring } from '../ui'
import { DeleteAll } from './DeleteAll'
import { Sheet } from './Sheet'

const SKIN_TYPES = ['normal', 'dry', 'oily', 'combination', 'sensitive'] as const
function toggle<T>(list: T[], v: T): T[] { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v] }

function Setup({ vault }: { vault: Vault }) {
  const { t } = useT()
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [pk, setPk] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pinIsValid(pin)) return setErr(t('v.pinShort'))
    if (pin !== pin2) return setErr(t('v.pinMismatch'))
    setErr(''); setBusy(true)
    const r = await vault.create(pin, pk)
    if (pk && !r.passkeyOk) setErr(t('v.passkeyFail'))
    setBusy(false)
  }
  return (
    <form onSubmit={submit} className="stack" aria-labelledby="setup-h">
      <h2 id="setup-h">{t('v.setupTitle')}</h2>
      <p>{t('v.setupIntro')}</p>
      <div className="field-pair">
        <label className="field">{t('v.pin')}
          <input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]*" minLength={MIN_PIN_LENGTH} value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
        <label className="field">{t('v.pinConfirm')}
          <input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]*" value={pin2} onChange={(e) => setPin2(e.target.value)} />
        </label>
      </div>
      <p className="note">{t('v.pinWeak')}</p>
      {vault.passkeySupported && (
        <label className="check"><input type="checkbox" checked={pk} onChange={(e) => setPk(e.target.checked)} /> {t('v.passkeyEnable')}</label>
      )}
      {err && <p role="alert" className="error">{err}</p>}
      <button className="btn primary" type="submit" disabled={busy}>{busy ? t('v.working') : t('v.create')}</button>
    </form>
  )
}

function Recovery({ code, onDone }: { code: string; onDone: () => void }) {
  const { t } = useT()
  return (
    <section className="stack" aria-labelledby="rec-h">
      <h2 id="rec-h">{t('v.recTitle')}</h2>
      <p>{t('v.recBody')}</p>
      <p className="recovery" data-testid="recovery-code" translate="no">{code}</p>
      <button type="button" className="btn primary" onClick={onDone}>{t('v.recSaved')}</button>
    </section>
  )
}

function Unlock({ vault }: { vault: Vault }) {
  const { t } = useT()
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [forgot, setForgot] = useState(false)
  const [code, setCode] = useState('')
  const [np, setNp] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!(await vault.unlockPin(pin))) setErr(t('v.wrong'))
  }
  const rec = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pinIsValid(np)) return setErr(t('v.pinShort'))
    if (!(await vault.recover(code, np))) setErr(t('v.recWrong'))
  }
  return (
    <div className="stack">
      <form onSubmit={submit} className="stack" aria-labelledby="unlock-h">
        <h2 id="unlock-h">{t('v.unlockTitle')}</h2>
        <label className="field">{t('v.pin')}
          <input type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => { setPin(e.target.value); setErr('') }} />
        </label>
        {err && !forgot && <p role="alert" className="error">{err}</p>}
        <button className="btn primary" type="submit">{t('v.unlock')}</button>
        {vault.hasPasskey && (
          <button type="button" className="btn secondary" onClick={async () => { if (!(await vault.unlockPasskey())) setErr(t('v.passkeyFail')) }}>{t('v.passkey')}</button>
        )}
        <p className="muted">{t('v.autolock')}</p>
      </form>
      {!forgot ? (
        <button type="button" className="link" onClick={() => { setForgot(true); setErr('') }}>{t('v.forgot')}</button>
      ) : (
        <form onSubmit={rec} className="stack">
          <label className="field">{t('v.recInput')}
            <input value={code} autoComplete="off" autoCapitalize="characters" onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="field">{t('v.newPin')}
            <input type="password" inputMode="numeric" autoComplete="new-password" value={np} onChange={(e) => setNp(e.target.value)} />
          </label>
          {err && <p role="alert" className="error">{err}</p>}
          <button className="btn primary" type="submit">{t('v.reset')}</button>
        </form>
      )}
    </div>
  )
}

function MemberForm({ initial, onSave, onCancel }: { initial: Member; onSave: (m: Member) => void; onCancel: () => void }) {
  const { t } = useT()
  const [m, setM] = useState<Member>(initial)
  const group = <T extends string>(legend: string, ids: readonly T[], prefix: string, sel: T[], set: (v: T[]) => void) => (
    <fieldset>
      <legend>{legend}</legend>
      <div className="checks">
        {ids.map((id) => (
          <label key={id} className="check"><input type="checkbox" checked={sel.includes(id)} onChange={() => set(toggle(sel, id))} /> {t(`${prefix}.${id}`)}</label>
        ))}
      </div>
    </fieldset>
  )
  return (
    <Sheet title={initial.alias ? t('hh2.editTitle', { name: initial.alias }) : t('hh2.newTitle')} labelId="member-h" onClose={onCancel}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (m.alias.trim()) onSave({ ...m, alias: m.alias.trim().slice(0, MAX_ALIAS) }) }}>
        <label className="field">{t('hh.alias')}
          <input value={m.alias} maxLength={MAX_ALIAS} required onChange={(e) => setM({ ...m, alias: e.target.value })} />
        </label>
        <label className="field">{t('hh.stage')}
          <select value={m.life_stage} onChange={(e) => setM({ ...m, life_stage: e.target.value as LifeStage })}>
            {LIFE_STAGES.map((s) => <option key={s} value={s}>{t(`stage.${s}`)}</option>)}
          </select>
        </label>
        <label className="field">{t('hh2.skin')}
          <select value={m.skin_type ?? ''} onChange={(e) => setM({ ...m, skin_type: e.target.value || undefined })}>
            <option value="">{t('hh2.skinNone')}</option>
            {SKIN_TYPES.map((s) => <option key={s} value={s}>{t(`skin.${s}`)}</option>)}
          </select>
        </label>
        {group<AllergenId>(t('hh.allergens'), ALLERGENS, 'allergen', m.allergens, (v) => setM({ ...m, allergens: v }))}
        {group<DietId>(t('hh.diets'), DIETS, 'diet', m.diets, (v) => setM({ ...m, diets: v }))}
        {group<GoalId>(t('hh.goals'), GOALS, 'goal', m.goals, (v) => setM({ ...m, goals: v }))}
        <div className="actions">
          <button className="btn primary" type="submit">{t('hh.save')}</button>
          <button className="btn secondary" type="button" onClick={onCancel}>{t('hh.cancel')}</button>
        </div>
      </form>
    </Sheet>
  )
}

export function Household({ vault, onDeleted }: { vault: Vault; onDeleted: () => void }) {
  const { t } = useT()
  const [editing, setEditing] = useState<Member | null>(null)
  const [msg, setMsg] = useState('')
  const [removing, setRemoving] = useState<Member | null>(null)
  const [saving, setSaving] = useState(librarySaving)
  const fileRef = useRef<HTMLInputElement>(null)
  const { members, status } = vault

  const save = async (m: Member) => {
    const next = members.some((x) => x.id === m.id) ? members.map((x) => (x.id === m.id ? m : x)) : [...members, m]
    await vault.saveMembers(next)
    setEditing(null)
  }
  const exportIt = async () => {
    const url = URL.createObjectURL(new Blob([await vault.exportBackup()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'five-seconds-backup.json'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const importIt = async (f: File | undefined) => {
    if (!f) return
    setMsg((await vault.importBackup(await f.text())) ? '' : t('v.importBad'))
  }

  return (
    <section aria-labelledby="hh-title" className="stack hh">
      <h1 id="hh-title">{t('hh.title')}</h1>
      <p className="banner banner-info" data-testid="privacy-banner"><span aria-hidden="true">🔒</span> {t('hh.banner')}</p>

      {status === 'loading' && <p role="status">{t('common.loading')}</p>}
      {vault.recoveryCode && <Recovery code={vault.recoveryCode} onDone={vault.ackRecovery} />}
      {status === 'none' && <Setup vault={vault} />}
      {status === 'locked' && <Unlock vault={vault} />}
      {status === 'unlocked' && !vault.recoveryCode && (
        <>
          <p className="status status-known" data-testid="lock-status">{t(vault.hasPasskey ? 'hh2.unlockedPk' : 'hh2.unlockedPin')}</p>
          <div className="row between wrap">
            <h2>{t('hh2.members', { n: members.length })}</h2>
            <button type="button" className="btn secondary" onClick={vault.lock}>{t('hh.lock')}</button>
          </div>
          {members.length === 0 && <p>{t('hh.empty')}</p>}
          <ul className="list">
            {members.map((m) => {
              const bits = [...m.allergens.map((a) => t(`allergen.${a}`)), ...m.diets.map((d) => t(`diet.${d}`)), ...m.goals.map((g) => t(`goal.${g}`))]
              return (
                <li key={m.id} className="member">
                  <div className="row">
                    <Ring member={{ id: m.id, name: m.alias, level: 'none' }} compact />
                    <div>
                      <strong>{m.alias}</strong> <span className="muted">· {t(`stage.${m.life_stage}`)}</span>
                      <div className="muted">{bits.length ? bits.join(', ') : t('hh2.noProfile')}</div>
                    </div>
                  </div>
                  <div className="row">
                    <button type="button" className="btn secondary small" aria-label={`${t('hh.edit')} ${m.alias}`} onClick={() => setEditing(m)}>{t('hh.edit')}</button>
                    <button type="button" className="btn ghost small" aria-label={`${t('hh.delete')} ${m.alias}`} onClick={() => setRemoving(m)}>{t('hh.delete')}</button>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="actions">
            <button type="button" className="btn primary" disabled={members.length >= MAX_MEMBERS}
              onClick={() => setEditing({ id: crypto.randomUUID(), alias: '', life_stage: 'adult', allergens: [], diets: [], goals: [] })}>
              {t('hh2.addN', { n: members.length })}
            </button>
            <button type="button" className="btn secondary" disabled={members.length + 3 > MAX_MEMBERS}
              onClick={() => void vault.saveMembers([...members, ...demoMembers().map((d) => ({ ...d, id: crypto.randomUUID() }))])}>
              {t('hh.seed')}
            </button>
          </div>
          {members.length >= MAX_MEMBERS && <p className="muted">{t('hh.max')}</p>}
          <details className="more">
            <summary>{t('hh2.settings')}</summary>
            <div className="hh-settings">
          <div className="member">
            <div><strong>{t('lib.save')}</strong><div className="muted">{t('lib.saveHint')}</div></div>
            <label className="check"><input type="checkbox" role="switch" checked={saving} aria-label={t('lib.save')} onChange={(e) => { setLibrarySaving(e.target.checked); setSaving(e.target.checked) }} /></label>
          </div>
          <div className="member">
            <div><strong>{t('lib.photos')}</strong><div className="muted">{t('lib.photosHint')}</div></div>
          </div>
          <p className="muted">{t('v.backupNote')}</p>
          <div className="actions">
            <button type="button" className="btn secondary" onClick={exportIt}>{t('hh.export')}</button>
          </div>
            </div>
          </details>
        </>
      )}

      {(status === 'locked' || status === 'none') && (
        <button type="button" className="btn secondary" onClick={() => fileRef.current?.click()}>{t('hh.import')}</button>
      )}
      <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" aria-label={t('hh.import')} tabIndex={-1} onChange={(e) => { void importIt(e.target.files?.[0]); e.target.value = '' }} />
      {msg && <p role="alert" className="error">{msg}</p>}

      <hr />
      <p className="muted">{t('hh2.delAllNote')}</p>
      <DeleteAll vault={vault} onDeleted={onDeleted} />

      {removing && (
        <Sheet title={t('hh2.remove', { name: removing.alias })} labelId="rm-h" tall={false} onClose={() => setRemoving(null)}>
          <p>{t('hh2.removeNote', { name: removing.alias })}</p>
          <div className="actions">
            <button type="button" className="btn danger" onClick={() => { void vault.saveMembers(members.filter((x) => x.id !== removing.id)); setRemoving(null) }}>{t('hh.delete')}</button>
            <button type="button" className="btn secondary" onClick={() => setRemoving(null)}>{t('hh.cancel')}</button>
          </div>
        </Sheet>
      )}
      {editing && <MemberForm initial={editing} onSave={save} onCancel={() => setEditing(null)} />}
    </section>
  )
}
