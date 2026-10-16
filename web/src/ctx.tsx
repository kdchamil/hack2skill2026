import { createContext, useContext } from 'react'
import { t as tr } from './i18n'
import type { Lang } from './types'
import type { Reason, Verdict } from './verdict'

export interface LangCtx {
  lang: Lang
  t: (key: string, vars?: Record<string, string | number>) => string
}
export const Ctx = createContext<LangCtx>({ lang: 'en', t: (k) => k })
export const useT = () => useContext(Ctx)
export const makeCtx = (lang: Lang): LangCtx => ({ lang, t: (k, v) => tr(lang, k, v) })

export function useVerdictText() {
  const { t, lang } = useT()
  const reason = (r: Reason) => {
    const x = r.arg ? t(`${r.code.startsWith('nutrient') ? 'nutrient' : r.code.startsWith('diet') ? 'diet' : 'allergen'}.${r.arg}`).toLocaleLowerCase(lang) : ''
    return t(`r.${r.code}`, { x })
  }
  return (v: Verdict) =>
    v.level === 'none'
      ? t('v.none', { name: v.alias })
      : t(v.level === 'avoid' ? 'v.avoid' : 'v.check', { name: v.alias, reasons: v.reasons.map(reason).join(', ') })
}
