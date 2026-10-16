// Minimal SSE parser over a fetch ReadableStream.
export interface SseEvent {
  event: string
  data: string
}

export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let event = 'message'
  let data: string[] = []
  const flush = (): SseEvent | null => {
    if (!data.length) { event = 'message'; return null }
    const out = { event, data: data.join('\n') }
    event = 'message'
    data = []
    return out
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buf += dec.decode(value ?? new Uint8Array(), { stream: !done })
      const lines = buf.split(/\r\n|\n|\r/)
      buf = done ? '' : (lines.pop() ?? '')
      if (done && lines.length && lines[lines.length - 1] !== '') lines.push('')
      for (const line of lines) {
        if (line === '') {
          const e = flush()
          if (e) yield e
        } else if (line.startsWith(':')) {
          continue
        } else {
          const i = line.indexOf(':')
          const field = i === -1 ? line : line.slice(0, i)
          let val = i === -1 ? '' : line.slice(i + 1)
          if (val.startsWith(' ')) val = val.slice(1)
          if (field === 'event') event = val
          else if (field === 'data') data.push(val)
        }
      }
      if (done) break
    }
  } finally {
    reader.releaseLock()
  }
}
