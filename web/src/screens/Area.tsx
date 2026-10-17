import { useApp } from '../appctx'
import { useT } from '../ctx'

export function Area() {
  const { t } = useT()
  const { route } = useApp()
  return <h1>{t('ph.title')}: Area{route.id ? ` ${route.id}` : ''}</h1>
}
