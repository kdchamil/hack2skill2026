// Basket aggregates, all computed in code from cached findings; no model call (FR-53).
import type { GradeLetter } from './types'
import { computeVerdicts, type Member } from './verdict'
import type { ListItem, ListState } from './list'

export const LETTERS: GradeLetter[] = ['A', 'B', 'C', 'D', 'E']
export interface BasketAlert { memberId: string; alias: string; level: 'avoid' | 'check'; scanId: string; product: string }
export interface BasketSummary {
  products: { scanId: string; name: string; grade: GradeLetter | null }[]
  open: ListItem[]
  spread: Record<GradeLetter | 'none', number>
  goodCount: number
  alerts: BasketAlert[]
  packaging: Record<string, number>
}

export function summarizeBasket(s: Pick<ListState, 'items' | 'scans' | 'basket'>, members: Member[]): BasketSummary {
  const ids = s.basket?.chosen ?? []
  const products = ids.filter((id) => s.scans[id]).map((id) => ({ scanId: id, name: s.scans[id].name, grade: s.scans[id].grade }))
  const spread = { A: 0, B: 0, C: 0, D: 0, E: 0, none: 0 }
  products.forEach((p) => { spread[p.grade ?? 'none']++ })
  const alerts: BasketAlert[] = []
  const packaging: Record<string, number> = {}
  for (const p of products) {
    const a = s.scans[p.scanId].analysis
    computeVerdicts(members, a.facts).forEach((v) => { if (v.level !== 'none') alerts.push({ memberId: v.memberId, alias: v.alias, level: v.level, scanId: p.scanId, product: p.name }) })
    const abbrs = a.findings.filter((f) => f.topic === 'packaging' && typeof f.data.abbr === 'string').map((f) => String(f.data.abbr))
    for (const x of abbrs.length ? abbrs : ['']) packaging[x] = (packaging[x] ?? 0) + 1
  }
  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'avoid' ? -1 : 1))
  return {
    products, spread, alerts, packaging, goodCount: spread.A + spread.B,
    open: s.items.filter((i) => !i.found),
  }
}
