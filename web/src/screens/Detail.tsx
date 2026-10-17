import { useApp } from '../appctx'
import { useT } from '../ctx'

export function Detail() {
  const { t } = useT()
  const { route } = useApp()
  return <h1>{t('ph.title')}: Detail{route.id ? ` ${route.id}` : ''}</h1>
}
