export type VerdictLevel = 'avoid' | 'check' | 'none'
export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'E'
export type StatusKind = 'known' | 'partial' | 'thin' | 'unknown'
export interface RingMember { id: string; name: string; level: VerdictLevel; reason?: string }
export const MAX_RINGS = 4
export const MAX_HEADLINE_WORDS = 12

export function splitRings(members: RingMember[], max = MAX_RINGS) {
  const shown = members.slice(0, max)
  const hidden = members.slice(max)
  const hiddenAvoid = hidden.filter((m) => m.level === 'avoid').length
  const hiddenCheck = hidden.filter((m) => m.level === 'check').length
  const hiddenLevel: VerdictLevel | null = hidden.length === 0 ? null : hiddenAvoid ? 'avoid' : hiddenCheck ? 'check' : 'none'
  return { shown, hidden, hiddenAvoid, hiddenLevel }
}

type T = (key: string, vars?: Record<string, string | number>) => string

export function ringAria(t: T, m: RingMember): string {
  const verdict = t(`ring.${m.level}`)
  return m.reason ? t('ring.aria', { name: m.name, verdict, reason: m.reason.replace(/\.$/, '') }) : t('ring.ariaBare', { name: m.name, verdict })
}

export function moreAria(t: T, hiddenCount: number, hiddenAvoid: number): string {
  return t('ring.moreAria', { n: hiddenCount, avoid: hiddenAvoid })
}

export function clampWords(s: string, max = MAX_HEADLINE_WORDS): string {
  const w = s.trim().split(/\s+/)
  return w.length <= max ? s.trim() : w.slice(0, max).join(' ') + '…'
}
