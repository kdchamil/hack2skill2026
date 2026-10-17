import { createContext, useContext } from 'react'
import type { ScanInput } from './api'
import type { Tab } from './ui'
import type { Analysis, Commentary, Lang } from './types'
import type { useVault } from './useVault'

export interface ScanView {
  analysis: Analysis | null
  commentary: Commentary | null
  scanId: string | null
  elapsedMs: number | null
  phase: 'loading' | 'streaming' | 'done' | 'error'
  error: string | null
  cached?: boolean
}

export type Sub = 'summary' | 'thin' | 'area' | 'detail' | 'claims' | 'compare'
/** tab: the bottom-bar slot; sub: scan/list sub-route; id: area id or card id. 'privacy' is reachable from the header. */
export interface Route { tab: Tab | 'privacy'; sub?: Sub; id?: string }

export const routes = {
  list: { tab: 'list' }, library: { tab: 'library' }, scan: { tab: 'scan' }, basket: { tab: 'basket' }, household: { tab: 'household' },
  summary: { tab: 'scan', sub: 'summary' }, thin: { tab: 'scan', sub: 'thin' }, claims: { tab: 'scan', sub: 'claims' }, compare: { tab: 'list', sub: 'compare' },
  area: (id: string): Route => ({ tab: 'scan', sub: 'area', id }),
  detail: (cardId: string): Route => ({ tab: 'scan', sub: 'detail', id: cardId }),
} as const satisfies Record<string, Route | ((id: string) => Route)>

export interface AppCtx {
  route: Route
  navigate: (r: Route) => void
  /** household member id the area screens are filtered to; null = everyone */
  member: string | null
  setMember: (id: string | null) => void
  view: ScanView
  vault: ReturnType<typeof useVault>
  runScan: (input: Omit<ScanInput, 'lang'>) => void
  /** re-run the last scan input (error state) */
  retry: () => void
  setLang: (l: Lang) => void
  onDeleted: () => void
}

export const AppContext = createContext<AppCtx | null>(null)
export function useApp(): AppCtx {
  const c = useContext(AppContext)
  if (!c) throw new Error('useApp outside App')
  return c
}
