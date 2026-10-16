import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchFixtures, PLACEHOLDER_PNG, type FixtureInfo, type ScanInput } from '../api'
import { useT } from '../ctx'
import { analyzeFrame, type FrameQuality } from '../quality'
import { Sheet } from './Sheet'

interface Shot { blob: Blob; url: string }
type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

const STABLE_MS = 600
const MAX_IMAGES = 4

export function Scan({ onAnalyze, busy }: { onAnalyze: (i: Omit<ScanInput, 'lang'>) => void; busy: boolean }) {
  const { t } = useT()
  const video = useRef<HTMLVideoElement>(null)
  const small = useRef<HTMLCanvasElement | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const okSince = useRef<number | null>(null)
  const armed = useRef(true)
  const shotsRef = useRef<Shot[]>([])
  const [shots, setShots] = useState<Shot[]>([])
  const [cam, setCam] = useState<'starting' | 'on' | 'off'>('starting')
  const [q, setQ] = useState<FrameQuality | null>(null)
  const [stable, setStable] = useState(false)
  const [armedUi, setArmedUi] = useState(true)
  const [barcode, setBarcode] = useState<string | null>(null)
  const [demoOpen, setDemoOpen] = useState(false)
  const [fixtures, setFixtures] = useState<FixtureInfo[] | null>(null)
  const [fxErr, setFxErr] = useState(false)
  const detector = useRef<Detector | null>(null)

  const setShotList = (f: (s: Shot[]) => Shot[]) => {
    const next = f(shotsRef.current).slice(0, MAX_IMAGES)
    shotsRef.current = next
    setShots(next)
  }
  const addBlob = useCallback((blob: Blob) => {
    if (shotsRef.current.length >= MAX_IMAGES) return
    setShotList((s) => [...s, { blob, url: URL.createObjectURL(blob) }])
    armed.current = false
    setArmedUi(false)
    okSince.current = null
    setStable(false)
  }, [])

  const capture = useCallback(() => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale)
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
    c.toBlob((b) => { if (b) { addBlob(b); navigator.vibrate?.(30) } }, 'image/jpeg', 0.85)
  }, [addBlob])

  // camera lifecycle
  useEffect(() => {
    let dead = false
    const md = navigator.mediaDevices
    if (!md?.getUserMedia) { setCam('off'); return }
    md.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (dead) { s.getTracks().forEach((x) => x.stop()); return }
        stream.current = s
        if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}) }
        setCam('on')
      })
      .catch(() => { if (!dead) setCam('off') })
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
    try { if (BD) detector.current = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'] }) } catch { /* unsupported */ }
    return () => {
      dead = true
      stream.current?.getTracks().forEach((x) => x.stop())
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url))
    }
  }, [])

  // quality loop
  useEffect(() => {
    if (cam !== 'on') return
    let scanning = false
    const id = window.setInterval(() => {
      const v = video.current
      if (!v || !v.videoWidth || v.paused) return
      const c = (small.current ??= document.createElement('canvas'))
      c.width = 160; c.height = Math.max(1, Math.round((160 * v.videoHeight) / v.videoWidth))
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(v, 0, 0, c.width, c.height)
      const fq = analyzeFrame(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
      setQ(fq)
      if (detector.current && !scanning) {
        scanning = true
        detector.current.detect(v).then((r) => { if (r[0]?.rawValue) setBarcode(r[0].rawValue) }).catch(() => {}).finally(() => { scanning = false })
      }
      if (!armed.current || shotsRef.current.length >= MAX_IMAGES) return
      if (fq.ok) {
        okSince.current ??= performance.now()
        setStable(true)
        if (performance.now() - okSince.current >= STABLE_MS) capture()
      } else { okSince.current = null; setStable(false) }
    }, 200)
    return () => window.clearInterval(id)
  }, [cam, capture])

  const openDemo = () => {
    setDemoOpen(true)
    if (!fixtures) fetchFixtures().then(setFixtures).catch(() => { setFxErr(true); setFixtures([]) })
  }
  const demo = (name: string) => {
    setDemoOpen(false)
    onAnalyze({ images: [new Blob([PLACEHOLDER_PNG], { type: 'image/png' })], fixture: name })
  }

  const full = shots.length >= MAX_IMAGES
  const hint = q && !q.ok && q.issue ? t(`scan.tip.${q.issue}`) : stable ? t('scan.ready') : t('scan.hint')

  return (
    <section aria-labelledby="scan-h" className="stack">
      <h1 id="scan-h">{t('scan.title')}</h1>
      {cam !== 'off' && (
        <div className="viewfinder">
          <video ref={video} playsInline muted aria-label={t('scan.title')} />
        </div>
      )}
      {cam === 'off' && (
        <p className="note" role="status">{t('scan.noCamera')} {t('scan.https')}</p>
      )}
      {cam === 'on' && <p className="muted" role="status" aria-live="polite">{shots.length > 0 && !armedUi ? t('scan.captured') : hint}</p>}
      {barcode && <p className="muted">{t('scan.barcode', { code: barcode })}</p>}

      {shots.length > 0 && (
        <div>
          <p className="muted">{t('scan.photos', { n: shots.length })}</p>
          <ul className="thumbs">
            {shots.map((s, i) => (
              <li key={s.url}>
                <img src={s.url} alt="" />
                <button type="button" className="btn ghost small" onClick={() => setShotList((l) => l.filter((x) => x !== s))}>
                  {t('scan.remove', { n: i + 1 })}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        {shots.length > 0 ? (
          <button type="button" className="btn primary" disabled={busy} onClick={() => onAnalyze({ images: shots.map((s) => s.blob), barcode })}>
            {t('scan.analyze')}
          </button>
        ) : (
          cam === 'on' && <button type="button" className="btn primary" onClick={capture}>{t('scan.shutter')}</button>
        )}
        {shots.length > 0 && !full && cam === 'on' && (
          <button type="button" className="btn secondary" onClick={() => { armed.current = true; setArmedUi(true); okSince.current = null }}>{t('scan.addBack')}</button>
        )}
        {full && <p className="muted">{t('scan.maxPhotos')}</p>}
        <label className="btn secondary file-btn">
          {t('scan.upload')}
          <input type="file" accept="image/*" capture="environment" multiple className="visually-hidden"
            onChange={(e) => { Array.from(e.target.files ?? []).forEach((f) => addBlob(f)); e.target.value = '' }} />
        </label>
        <button type="button" className="btn secondary" onClick={openDemo}>{t('scan.demo')}</button>
      </div>

      {demoOpen && (
        <Sheet title={t('scan.demoTitle')} labelId="demo-h" onClose={() => setDemoOpen(false)}>
          <p className="muted">{t('scan.demoNote')}</p>
          {fixtures === null && <p role="status">{t('scan.loading')}</p>}
          {fixtures?.length === 0 && <p role="status">{fxErr ? t('common.offline') : t('scan.noFixtures')}</p>}
          <ul className="list">
            {fixtures?.map((f) => (
              <li key={f.name}><button type="button" className="btn row-btn" onClick={() => demo(f.name)}>{f.title}</button></li>
            ))}
          </ul>
        </Sheet>
      )}
    </section>
  )
}
