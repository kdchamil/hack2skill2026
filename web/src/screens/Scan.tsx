import { Scan as Old } from '../components/Scan'
import { useApp } from '../appctx'

export function Scan() {
  const { runScan } = useApp()
  return <Old busy={false} onAnalyze={runScan} />
}
