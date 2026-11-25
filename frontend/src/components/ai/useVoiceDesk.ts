import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Talking to the desk, and hearing it back.
 *
 * The reader's own device does both halves. Speaking is the browser's
 * SpeechRecognition and listening is its speech synthesis, so nothing is
 * recorded anywhere: the words leave the page as text in the same question the
 * reader would have typed, and the answer is read out of the same speaker the
 * radio page uses. Where the browser has no recognition - and several desktop
 * browsers still have none behind a flag - the microphone button is not drawn,
 * rather than drawn and dead.
 *
 * Speaking an answer back is on for a reader who has not said otherwise,
 * because the person pressing a microphone is not going to read what they just
 * dictated. It is one press away from off, and the choice outlives the tab.
 *
 * The last thing here is a location. A reader who asks the desk what the sky is
 * doing means the sky over where they are standing, and the only honest way to
 * know that is to ask the device once, at the moment the question needs it, and
 * to let them say no. A pair of rounded coordinates is all that leaves the
 * page - the server reads the weather for those numbers and nothing else is
 * kept, remembered or sent with the questions that follow.
 */

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const holder = window as unknown as Record<string, (new () => Recognition) | undefined>
  return holder.SpeechRecognition || holder.webkitSpeechRecognition || null
}

/** Browsers name their voices by region, and Kinyarwanda has no voice to pick. */
function voiceFor(language: string) {
  if (language === 'fr') return 'fr-FR'
  if (language === 'rw') return 'en-GB'
  return 'en-US'
}

const WEATHER_WORDS = ['weather', 'forecast', 'temperature', 'rain', 'rainy', 'snow', 'hot', 'cold', 'umbrella', 'degrees', 'windy', 'humid']

/** Whether a question means the sky over the reader, and so needs the device's permission. */
export function asksForSky(question: string) {
  const text = question.toLowerCase()
  return WEATHER_WORDS.some((word) => text.includes(word))
}

export function useVoiceDesk({ language, onQuestion }: { language: string; onQuestion: (text: string) => void }) {
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [micError, setMicError] = useState('')
  const [near, setNear] = useState('')
  const [voiceOn, setVoiceOn] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('radar-ai-speak') !== 'off'
  })
  const recognition = useRef<Recognition | null>(null)
  const onAsk = useRef(onQuestion)
  onAsk.current = onQuestion

  const micSupported = useRef(Boolean(recognitionCtor())).current
  const voiceSupported = useRef(typeof window !== 'undefined' && 'speechSynthesis' in window).current

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('radar-ai-speak', voiceOn ? 'on' : 'off')
  }, [voiceOn])

  // Leaving the page mid-sentence must not leave a voice talking over the news.
  useEffect(
    () => () => {
      recognition.current?.abort()
      if (voiceSupported) window.speechSynthesis.cancel()
    },
    [voiceSupported],
  )

  const stopListening = useCallback(() => {
    recognition.current?.stop()
    setListening(false)
  }, [])

  const startListening = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    if (voiceSupported) window.speechSynthesis.cancel()

    const rec = new Ctor()
    recognition.current?.abort()
    recognition.current = rec
    rec.lang = voiceFor(language)
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1

    let said = ''
    rec.onresult = (event) => {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        text += result[0].transcript
        if (result.isFinal) said = text
      }
      setHeard(text.trim())
    }
    rec.onerror = (event) => {
      setMicError(event?.error === 'not-allowed' || event?.error === 'service-not-allowed' ? 'denied' : 'failed')
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      setHeard('')
      const question = said.trim()
      setMicError('')
      // The dictation is the question: a reader who pressed a microphone and
      // said a sentence should not have to press anything else to ask it.
      if (question) onAsk.current(question)
    }

    setMicError('')
    setHeard('')
    setListening(true)
    try {
      rec.start()
    } catch {
      setListening(false)
      setMicError('failed')
    }
  }, [language, voiceSupported])

  const say = useCallback(
    (text: string) => {
      if (!voiceSupported || !voiceOn) return
      const clean = String(text || '').trim()
      if (!clean) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(clean.slice(0, 1200))
      utterance.lang = voiceFor(language)
      utterance.rate = 1.02
      window.speechSynthesis.speak(utterance)
    },
    [language, voiceOn, voiceSupported],
  )

  const stopSpeaking = useCallback(() => {
    if (voiceSupported) window.speechSynthesis.cancel()
  }, [voiceSupported])

  /**
   * The reader's own place, asked for once and only when a question needs it.
   * Refusing the permission prompt is not an error here: the desk then answers
   * with the weather it has for the city the site defaults to, and names it.
   */
  const askLocation = useCallback(
    () =>
      new Promise<string>((resolve) => {
        if (near) return resolve(near)
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve('')
        let settled = false
        const finish = (value: string) => {
          if (settled) return
          settled = true
          resolve(value)
        }
        const timer = window.setTimeout(() => finish(''), 3500)
        navigator.geolocation.getCurrentPosition(
          (position) => {
            window.clearTimeout(timer)
            // Two decimals is about a kilometre - as fine as a weather station
            // can claim - and it keeps a whole city from becoming a thousand
            // separate look-ups on the way to the same sky.
            const pair = `${position.coords.latitude.toFixed(2)},${position.coords.longitude.toFixed(2)}`
            setNear(pair)
            finish(pair)
          },
          () => {
            window.clearTimeout(timer)
            finish('')
          },
          { enableHighAccuracy: false, timeout: 3200, maximumAge: 600000 },
        )
      }),
    [near],
  )

  return {
    micSupported,
    voiceSupported,
    listening,
    heard,
    micError,
    startListening,
    stopListening,
    voiceOn,
    setVoiceOn,
    say,
    stopSpeaking,
    askLocation,
    near,
  }
}
