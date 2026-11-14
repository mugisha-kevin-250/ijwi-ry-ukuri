import { chunksForSpeech, speechScript, wordCount } from './storyBody'
import type { Article } from '../types'

/**
 * RADAR Audio: the day's stories read aloud by the voice the reader's own device
 * already has. Nothing is recorded, uploaded or streamed - a browser speech
 * engine turns text into sound on the phone or laptop in front of the reader,
 * which is why the switch below is honest about whether that engine exists.
 */

const RATE_KEY = 'radar-voice-rate'
const DEFAULT_RATE = 1
export const RATE_CHOICES = [0.8, 1, 1.25, 1.5]

export interface AnnounceItem {
  id: string
  title: string
  href: string
  chunks: string[]
  words: number
}

export type AnnouncerStatus = 'idle' | 'playing' | 'paused'

export interface AnnouncerState {
  /** Whether this browser has a speech engine at all. */
  supported: boolean
  /** Whether it has an English voice to speak with. Both can be true while this is false. */
  hasEnglishVoice: boolean
  voiceName: string
  status: AnnouncerStatus
  current: AnnounceItem | null
  /** 1-based position of the story inside the playlist, for "story 3 of 12". */
  position: number
  total: number
  /** 1-based progress through the current story, for the "how far in" line. */
  part: number
  partCount: number
  rate: number
  /** Set when the engine itself refused, so the page can say so instead of leaving a dead button. */
  failure: string
}

type Listener = (state: AnnouncerState) => void

const listeners = new Set<Listener>()

function readSavedRate(): number {
  try {
    const stored = Number(window.localStorage.getItem(RATE_KEY))
    return RATE_CHOICES.includes(stored) ? stored : DEFAULT_RATE
  } catch {
    return DEFAULT_RATE
  }
}

function engine(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  return window.speechSynthesis
}

export function speechSupported(): boolean {
  return engine() !== null
}

// English first: the desk only promises to read the English edition. A device
// with only a Kinyarwanda or French voice cannot honour that promise, so it is
// reported as no voice rather than reading English text with the wrong sounds.
const PREFERRED_LANGS = ['en-gb', 'en-us', 'en-ie', 'en-au', 'en-ca', 'en-in', 'en-za', 'en-ke', 'en-ng']

export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  const voices = engine()?.getVoices() ?? []
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang || ''))
  if (!english.length) return null
  const score = (voice: SpeechSynthesisVoice) => {
    const lang = (voice.lang || '').toLowerCase().replace('_', '-')
    const exact = PREFERRED_LANGS.indexOf(lang)
    let value = exact >= 0 ? exact : 4 + (lang.startsWith('en') ? 0 : 10)
    // A voice that lives on the device keeps working with the network down.
    if (voice.localService) value -= 0.5
    return value
  }
  return [...english].sort((a, b) => score(a) - score(b))[0] ?? null
}

let snapshot: AnnouncerState = {
  supported: speechSupported(),
  hasEnglishVoice: pickEnglishVoice() !== null,
  voiceName: pickEnglishVoice()?.name ?? '',
  status: 'idle',
  current: null,
  position: 0,
  total: 0,
  part: 0,
  partCount: 0,
  rate: readSavedRate(),
  failure: '',
}

function emit(change: Partial<AnnouncerState>) {
  snapshot = { ...snapshot, ...change }
  listeners.forEach((listener) => listener(snapshot))
}

export function announcerState(): AnnouncerState {
  return snapshot
}

export function subscribeToAnnouncer(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function voiceItem(article: Article): AnnounceItem | null {
  const chunks = chunksForSpeech(speechScript(article))
  if (!chunks.length) return null
  return {
    id: article._id,
    title: article.title,
    href: `/article/${article.slug}`,
    chunks,
    words: chunks.reduce((total, chunk) => total + wordCount(chunk), 0),
  }
}

export function voiceItems(articles: Article[]): AnnounceItem[] {
  // A story with no readable text would leave a silent row in the playlist.
  return articles.map(voiceItem).filter((item): item is AnnounceItem => item !== null)
}

/**
 * The presenter's own words, as a row in the playlist.
 *
 * A bulletin is not just headlines: the desk writes an opening line that says what
 * programme is on air and a closing one, and the reader should hear those in the
 * same press of one button rather than having them printed on the page and skipped.
 */
export function scriptItem(text: string, { id, title, href = '/radio' }: { id: string; title: string; href?: string }): AnnounceItem | null {
  const chunks = chunksForSpeech(text)
  if (!chunks.length) return null
  return {
    id,
    title,
    href,
    chunks,
    words: chunks.reduce((total, chunk) => total + wordCount(chunk), 0),
  }
}

// The engine fires the callbacks of an utterance it has already been told to
// throw away, so every start carries a number and a late callback is dropped.
let generation = 0
let queue: AnnounceItem[] = []
let storyIndex = 0
let chunkIndex = 0

function refreshVoice() {
  const voice = pickEnglishVoice()
  emit({ hasEnglishVoice: voice !== null, voiceName: voice?.name ?? '' })
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  // Chrome hands back an empty list until it has loaded them, then fires once.
  const syn = window.speechSynthesis
  refreshVoice()
  syn.addEventListener?.('voiceschanged', refreshVoice)
}

function speakCurrentChunk() {
  const syn = engine()
  const item = queue[storyIndex]
  if (!syn || !item) {
    emit({ status: 'idle', current: item ?? snapshot.current, part: item ? snapshot.part : 0 })
    return
  }
  const voice = pickEnglishVoice()
  if (!voice) {
    stop()
    emit({ failure: 'voice' })
    return
  }

  const chunk = item.chunks[chunkIndex]
  if (chunk === undefined) {
    advanceStory()
    return
  }

  const token = generation
  const utterance = new SpeechSynthesisUtterance(chunk)
  utterance.voice = voice
  utterance.lang = voice.lang
  utterance.rate = snapshot.rate
  utterance.volume = 1

  utterance.onend = () => {
    if (token !== generation) return
    chunkIndex += 1
    if (chunkIndex >= item.chunks.length) {
      advanceStory()
      return
    }
    emit({ part: chunkIndex + 1, partCount: item.chunks.length })
    speakCurrentChunk()
  }

  // A single chunk failing is not the end of the bulletin: the next one is
  // tried, and only a whole story that will not speak is reported.
  utterance.onerror = () => {
    if (token !== generation) return
    if (chunkIndex + 1 >= item.chunks.length) {
      advanceStory()
      return
    }
    chunkIndex += 1
    emit({ part: chunkIndex + 1, partCount: item.chunks.length, failure: 'engine' })
    speakCurrentChunk()
  }

  syn.cancel()
  syn.speak(utterance)
}

function advanceStory() {
  const finished = queue[storyIndex]
  storyIndex += 1
  chunkIndex = 0
  if (!finished) return
  if (storyIndex >= queue.length) {
    // The playlist is done. Stop cleanly instead of pretending something is still on.
    queue = []
    storyIndex = 0
    generation += 1
    engine()?.cancel()
    emit({ status: 'idle', current: null, position: 0, part: 0, partCount: 0, total: 0 })
    return
  }
  const next = queue[storyIndex]
  emit({ current: next, position: storyIndex + 1, total: queue.length, part: 1, partCount: next.chunks.length })
  speakCurrentChunk()
}

export function play(items: AnnounceItem[], fromIndex = 0) {
  const list = items.filter((item) => item.chunks.length > 0)
  if (!list.length) {
    emit({ failure: 'empty' })
    return
  }
  const syn = engine()
  if (!syn) {
    emit({ failure: 'unsupported' })
    return
  }
  if (!pickEnglishVoice()) {
    emit({ failure: 'voice' })
    return
  }
  generation += 1
  queue = list
  storyIndex = Math.min(Math.max(fromIndex, 0), list.length - 1)
  chunkIndex = 0
  const item = queue[storyIndex]
  syn.cancel()
  emit({
    status: 'playing',
    current: item,
    position: storyIndex + 1,
    total: list.length,
    part: 1,
    partCount: item.chunks.length,
    failure: '',
    supported: true,
    hasEnglishVoice: true,
  })
  speakCurrentChunk()
}

export function togglePause() {
  const syn = engine()
  if (!syn) return
  if (snapshot.status === 'playing') {
    syn.pause()
    emit({ status: 'paused' })
    return
  }
  if (snapshot.status === 'paused') {
    syn.resume()
    emit({ status: 'playing' })
  }
}

export function skipStory(step: number) {
  if (!queue.length) return
  const target = storyIndex + step
  if (target < 0 || target >= queue.length) return
  storyIndex = target
  chunkIndex = 0
  const item = queue[storyIndex]
  generation += 1
  engine()?.cancel()
  emit({ status: 'playing', current: item, position: storyIndex + 1, total: queue.length, part: 1, partCount: item.chunks.length, failure: '' })
  speakCurrentChunk()
}

export function stop() {
  generation += 1
  queue = []
  storyIndex = 0
  chunkIndex = 0
  engine()?.cancel()
  emit({ status: 'idle', current: null, position: 0, total: 0, part: 0, partCount: 0, failure: '' })
}

export function setRate(rate: number) {
  const value = RATE_CHOICES.includes(rate) ? rate : DEFAULT_RATE
  try {
    window.localStorage.setItem(RATE_KEY, String(value))
  } catch {
    // A private window that refuses storage simply does not remember the speed.
  }
  const changed = value !== snapshot.rate
  emit({ rate: value })
  // Speaking text already queued would keep the old speed, so the current story
  // restarts from its beginning at the new one.
  if (changed && snapshot.status !== 'idle' && queue.length) {
    chunkIndex = 0
    generation += 1
    engine()?.cancel()
    emit({ status: 'playing', part: 1, partCount: queue[storyIndex]?.chunks.length ?? 0 })
    speakCurrentChunk()
  }
}

/** Roughly how long a story takes to hear at the chosen speed. */
export function minutesToHear(item: AnnounceItem, rate: number): number {
  const wordsPerMinute = 165 * rate
  return Math.max(1, Math.round(item.words / wordsPerMinute))
}
