import { Household as Old } from '../components/Household'
import { useApp } from '../appctx'

export function Household() {
  const { vault, onDeleted } = useApp()
  return <Old vault={vault} onDeleted={onDeleted} />
}
