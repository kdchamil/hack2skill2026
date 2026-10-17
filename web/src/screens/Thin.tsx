import { useApp } from '../appctx'
import { useT } from '../ctx'

export function Thin() {
  const { t } = useT()
  const { route } = useApp()
  return <h1>{t('ph.title')}: Thin{route.id ? ` ${route.id}` : ''}</h1>
}
