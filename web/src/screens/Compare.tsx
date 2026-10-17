import { useApp } from '../appctx'
import { useT } from '../ctx'

export function Compare() {
  const { t } = useT()
  const { route } = useApp()
  return <h1>{t('ph.title')}: Compare{route.id ? ` ${route.id}` : ''}</h1>
}
