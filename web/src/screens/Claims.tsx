import { useApp } from '../appctx'
import { useT } from '../ctx'

export function Claims() {
  const { t } = useT()
  const { route } = useApp()
  return <h1>{t('ph.title')}: Claims{route.id ? ` ${route.id}` : ''}</h1>
}
