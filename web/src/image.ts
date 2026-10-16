// Client-side downscale before upload: longest side <= MAX_SIDE px, JPEG q0.8. Falls back to the original blob.
export const MAX_SIDE = 1600
export const JPEG_QUALITY = 0.8

export async function downscale(blob: Blob): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function' || !blob.type.startsWith('image/')) return blob
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    if (scale === 1 && blob.type === 'image/jpeg' && blob.size < 600_000) { bmp.close?.(); return blob }
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close?.()
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', JPEG_QUALITY))
    return out && out.size < blob.size ? out : blob
  } catch {
    return blob
  }
}
