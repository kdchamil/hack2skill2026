import { useT } from '../ctx'
import type { Vault } from '../useVault'
import { DeleteAll } from './DeleteAll'

export function Privacy({ vault, onDeleted }: { vault: Vault; onDeleted: () => void }) {
  const { t } = useT()
  return (
    <section aria-labelledby="priv-title" className="stack">
      <h1 id="priv-title">{t('priv.title')}</h1>
      <ul className="list">
        <li>{t('priv.photos')}</li>
        <li>{t('priv.local')}</li>
        <li>{t('priv.report')}</li>
      </ul>
      <h2>{t('priv.deleteH')}</h2>
      <p>{t('priv.deleteBody')}</p>
      <DeleteAll vault={vault} onDeleted={onDeleted} />
    </section>
  )
}
