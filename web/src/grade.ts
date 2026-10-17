// Display helpers for the v2 grade, areas and member filter. Pure functions; no I/O.
import type { Analysis, Area, AreaId, Commentary, Finding, GradeCardId } from './types'
import type { GradeLetter, RingMember, StatusKind } from './ui'
import { GOAL_NUTRIENT, type Member, type Verdict } from './verdict'

export const AREA_ORDER: AreaId[] = ['body', 'planet', 'people', 'truth', 'choice']
export const GRADES: GradeLetter[] = ['A', 'B', 'C', 'D', 'E']
type T = (key: string, vars?: Record<string, string | number>) => string

export const isPlaceholder = (f: Finding) => f.data.placeholder === true
export const nextArea = (id: AreaId): AreaId | null => AREA_ORDER[AREA_ORDER.indexOf(id) + 1] ?? null

export const areaHeadline = (a: Area, c: Commentary | null) => c?.areas[a.id]?.headline || a.headline
export const cardHeadline = (a: Analysis, id: GradeCardId, c: Commentary | null) => c?.cards[id]?.headline || a.cards.find((x) => x.id === id)?.headline || ''
export const areaGrades = (a: Analysis, area: Area) => area.card_ids.map((id) => a.cards.find((c) => c.id === id)?.grade ?? null)
export const areaStatus = (area: Area): StatusKind => (area.tier === 'unknown' ? 'unknown' : area.tier === 'inferred' ? 'partial' : 'known')
export const findingsOf = (a: Analysis, area: AreaId) => a.findings.filter((f) => f.area === area)
export const byTopic = (fs: Finding[], ...topics: string[]) => fs.filter((f) => topics.includes(f.topic))

/** Short reason for a ring: the first reason's subject, e.g. "Sesame". */
export function shortReason(t: T, v: Verdict): string | undefined {
  const r = v.reasons[0]
  if (!r) return undefined
  const ns = r.code === 'contains' || r.code === 'may_contain' ? 'allergen' : r.code.startsWith('diet') ? 'diet' : r.code.startsWith('nutrient') ? 'nutrient' : ''
  const s = ns && r.arg ? t(`${ns}.${r.arg}`) : t(`r.${r.code}`, { x: '' }).trim()
  return s.charAt(0).toLocaleUpperCase() + s.slice(1)
}

export const ringMembers = (t: T, vs: Verdict[]): RingMember[] =>
  vs.map((v) => ({ id: v.memberId, name: v.alias, level: v.level, reason: shortReason(t, v) }))

const NUT_SHORT: Record<string, string> = { sodium_mg: 'sodium', sugars_total: 'sugars', fat_saturated: 'fat_saturated' }

/** Is this finding about something the member watches? Used to sort a member's findings first. */
export function relevantTo(f: Finding, m: Member): boolean {
  if (f.topic === 'allergens') return m.allergens.includes(f.data.allergen as never)
  if (f.topic === 'diet') return m.diets.includes(f.data.diet as never)
  if (f.topic === 'nutrition') return m.goals.some((g) => GOAL_NUTRIENT[g] === NUT_SHORT[String(f.data.nutrient)])
  return false
}
export const sortFor = (fs: Finding[], m: Member | undefined) => (m ? [...fs.filter((f) => relevantTo(f, m)), ...fs.filter((f) => !relevantTo(f, m))] : fs)

/** The nutrient finding with the highest share of the daily reference, for the Card detail headline. */
export function topNutrient(fs: Finding[]): { finding: Finding; pct: number } | null {
  let best: { finding: Finding; pct: number } | null = null
  for (const f of fs) {
    const p = f.topic === 'nutrition' && typeof f.data.pct_ri === 'number' ? f.data.pct_ri : null
    if (p !== null && (!best || p > best.pct)) best = { finding: f, pct: p }
  }
  return best
}

export type ClaimVerdict = 'supported' | 'unsupported' | 'contradicted' | 'unverifiable'
export const claimVerdict = (f: Finding): ClaimVerdict => {
  const v = f.data.verdict
  return v === 'supported' || v === 'unsupported' || v === 'contradicted' ? v : 'unverifiable'
}
export const claimEvidence = (f: Finding): string[] => {
  const e = f.data.evidence
  const lines = Array.isArray(e) ? e.map((x) => (typeof x === 'string' ? x : '')).filter(Boolean) : []
  return [f.reason, ...lines]
}
