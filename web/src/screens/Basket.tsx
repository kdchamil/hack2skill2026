import { useT } from '../ctx'

export function Basket() {
  const { t } = useT()
  return <h1>{t('nav.basket')}</h1>
}
