import { useT } from '../ctx'

export function List() {
  const { t } = useT()
  return <h1>{t('nav.list')}</h1>
}
