// Listen: server TTS (cached blob URLs) -> speechSynthesis -> text only.
import { fetchTts } from './api'
import type { Lang } from './types'

export type ListenStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'speech' | 'text'
export interface ListenState {
  status: ListenStatus
  text: string
  lang: Lang
  rate: number
  note: string | null
  tag: string | null // which UI element started it
}
export const RATES = [0.75, 1, 1.25, 1.5]
export const SPEECH_LANG: Record<Lang, string> = { en: 'en-US', si: 'si-LK', ta: 'ta-IN' }

const cache = new Map<string, string>()
let audio: HTMLAudioElement | null = null
let state: ListenState = { status: 'idle', text: '', lang: 'en', rate: 1, note: null, tag: null }
const subs = new Set<() => void>()
const set = (p: Partial<ListenState>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }

export const getListenState = () => state
export const subscribeListen = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const _resetAudioForTests = () => { cache.clear(); audio = null }

function speechVoiceFor(lang: Lang): SpeechSynthesisVoice | null {
  const ss = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null
  if (!ss) return null
  const want = SPEECH_LANG[lang].toLowerCase()
  const voices = ss.getVoices()
  return voices.find((v) => v.lang.toLowerCase() === want) ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null
}

export function stopListen(): void {
  audio?.pause()
  audio = null
  try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel() } catch { /* ignore */ }
  set({ status: 'idle', note: null, tag: null })
}

function trySpeech(text: string, lang: Lang): boolean {
  const voice = speechVoiceFor(lang)
  if (!voice || typeof SpeechSynthesisUtterance === 'undefined') return false
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = SPEECH_LANG[lang]
  u.rate = state.rate
  u.onend = () => set({ status: 'idle' })
  u.onerror = () => set({ status: 'text', note: 'unavailable' })
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
  return true
}

export async function listen(text: string, lang: Lang, tag: string | null = null): Promise<void> {
  stopListen()
  set({ status: 'loading', text, lang, tag, note: null })
  const key = `${lang}\n${text}`
  try {
    let url = cache.get(key)
    if (!url) {
      url = URL.createObjectURL(await fetchTts(text, lang))
      cache.set(key, url)
    }
    const a = new Audio(url)
    audio = a
    a.playbackRate = state.rate
    a.onended = () => set({ status: 'idle' })
    a.onerror = () => fallback(text, lang)
    await a.play()
    set({ status: 'playing' })
  } catch {
    fallback(text, lang)
  }
}

function fallback(text: string, lang: Lang) {
  audio = null
  if (trySpeech(text, lang)) set({ status: 'speech', note: 'speech' })
  else set({ status: 'text', note: 'unavailable' })
}

export function togglePause(): void {
  if (audio) {
    if (audio.paused) { void audio.play(); set({ status: 'playing' }) }
    else { audio.pause(); set({ status: 'paused' }) }
  } else if (state.status === 'speech') {
    speechSynthesis.pause(); set({ status: 'paused' })
  } else if (state.status === 'paused') {
    speechSynthesis.resume(); set({ status: 'speech' })
  }
}
export function replay(): void { void listen(state.text, state.lang, state.tag) }
export function setRate(rate: number): void {
  set({ rate })
  if (audio) audio.playbackRate = rate
}
