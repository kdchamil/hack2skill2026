import { useT } from '../ctx'
import type { Vault } from '../useVault'
import { DeleteAll } from './DeleteAll'

export function Privacy({ vault, onDeleted }: { vault: Vault; onDeleted: () => void }) {
  const { t } = useT()
  return (
    <section aria-labelledby="priv-title" className="stack">
      <h1 id="priv-title">{t('priv.title')}</h1>
      <ul className="priv-list">
        <li><span aria-hidden="true">📸</span><span>{t('priv.photos')}</span></li>
        <li><span aria-hidden="true">🔒</span><span>{t('priv.local')}</span></li>
        <li><span aria-hidden="true">🚩</span><span>{t('priv.report')}</span></li>
      </ul>
      <h2>{t('priv.deleteH')}</h2>
      <p>{t('priv.deleteBody')}</p>
      <DeleteAll vault={vault} onDeleted={onDeleted} />
    </section>
  )
}
