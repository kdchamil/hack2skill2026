import type { Lang } from './types'
import type { Dict } from './i18n/legacy'
import * as legacy from './i18n/legacy'
import core from './i18n/core'
import summary from './i18n/summary'
import library from './i18n/library'
import household from './i18n/household'
import list from './i18n/list'

const parts = [legacy, core, summary, library, household, list] as unknown as Record<Lang, Dict>[]
const merge = (l: Lang): Dict => Object.assign({}, ...parts.map((p) => p[l]))
const en = merge('en')

export const DICTS: Record<Lang, Dict> = { en, si: merge('si'), ta: merge('ta') }
export const LANG_LABELS: Record<Lang, { short: string; name: string }> = {
  en: { short: 'EN', name: 'English' }, si: { short: 'සිං', name: 'සිංහල' }, ta: { short: 'தமிழ்', name: 'தமிழ்' },
}

export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  let s = DICTS[lang][key] ?? en[key] ?? key
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}
