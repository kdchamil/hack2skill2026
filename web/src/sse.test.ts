import { describe, expect, it } from 'vitest'
import { parseSSE } from './sse'

const stream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder()
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
const collect = async (s: ReadableStream<Uint8Array>) => {
  const out = []
  for await (const e of parseSSE(s)) out.push(e)
  return out
}

describe('parseSSE', () => {
  it('parses events', async () => {
    const r = await collect(stream(['event: analysis\ndata: {"a":1}\n\nevent: done\ndata: {}\n\n']))
    expect(r).toEqual([{ event: 'analysis', data: '{"a":1}' }, { event: 'done', data: '{}' }])
  })
  it('handles split chunks, CRLF and multi-line data', async () => {
    const r = await collect(stream(['event: comm', 'entary\r\ndata: a\r\ndata: b\r\n', '\r\n']))
    expect(r).toEqual([{ event: 'commentary', data: 'a\nb' }])
  })
  it('splits multibyte characters across chunks', async () => {
    const bytes = new TextEncoder().encode('event: x\ndata: තල\n\n')
    const s = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(bytes.slice(0, 14)); c.enqueue(bytes.slice(14)); c.close() },
    })
    expect(await collect(s)).toEqual([{ event: 'x', data: 'තල' }])
  })
  it('ignores comments, defaults to message, flushes at EOF', async () => {
    const r = await collect(stream([': keepalive\n\ndata: hi\n\nevent: error\ndata: {"code":"x"}']))
    expect(r).toEqual([{ event: 'message', data: 'hi' }, { event: 'error', data: '{"code":"x"}' }])
  })
})
