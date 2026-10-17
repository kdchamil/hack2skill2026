import { useT } from '../ctx'

export function Library() {
  const { t } = useT()
  return <h1>{t('nav.library')}</h1>
}
