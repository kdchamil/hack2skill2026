export function Skeleton({ lines = 1, height = 16, width = '100%' }: { lines?: number; height?: number; width?: number | string }) {
  return (
    <div className="skel-wrap" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skel" style={{ height, width: i === lines - 1 && lines > 1 ? '60%' : width }} />)}
    </div>
  )
}
