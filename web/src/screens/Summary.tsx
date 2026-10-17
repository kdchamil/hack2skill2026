import { Summary as Old } from '../components/Summary'
import { routes, useApp } from '../appctx'
import { useT } from '../ctx'

export function Summary() {
  const { view, vault, navigate, setLang } = useApp()
  const { lang } = useT()
  return <Old view={view} members={vault.members} vault={vault.status} lang={lang} setLang={setLang}
    onNew={() => navigate(routes.scan)} onGoHousehold={() => navigate(routes.household)} />
}
