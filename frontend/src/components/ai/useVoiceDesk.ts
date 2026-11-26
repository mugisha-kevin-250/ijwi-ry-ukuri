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

/**
 * The voice the desk answers with.
 *
 * Devices ship a handful of named voices and label them by who recorded them,
 * and a reader who presses a microphone expects a person on the other end, not
 * the flattest tone the operating system can make. So the desk asks for a
 * woman's voice by the names the platforms actually use, in the reader's
 * language if one exists and in English if not - and if the device has none of
 * those, it takes whatever it was given rather than saying nothing.
 */
const FEMALE_VOICES =
  /(female|woman|samantha|karen|zira|aria|jenny|moira|tessa|fiona|victoria|catherine|hazel|susan|linda|heera|swara|kalika|lekha|amira|penelope|angela|elena|carmen|lucia|martha|paulina|salli|joanna|kendra|amy|emma|olivia|google\s*(us\s*)?english)/i
const PREFERRED_LAST = /(male|man|david|mark|james|fred|george|rishi|alex|daniel|tom|oliver|arthur|thomas|google indiaspeak)/i

function pickVoice(lang: string, voices: SpeechSynthesisVoice[]) {
  const inLanguage = voices.filter((voice) => String(voice.lang || '').toLowerCase().startsWith(lang.toLowerCase()))
  const pool = inLanguage.length ? inLanguage : voices
  const female = pool.filter((voice) => FEMALE_VOICES.test(voice.name))
  const rest = pool.filter((voice) => !PREFERRED_LAST.test(voice.name))
  return female[0] || rest[0] || pool[0] || null
}

const WEATHER_WORDS = ['weather', 'forecast', 'temperature', 'rain', 'rainy', 'snow', 'hot', 'cold', 'umbrella', 'degrees', 'windy', 'humid']

/** Whether a question means the sky over the reader, and so needs the device's permission. */
export function asksForSky(question: string) {
  const text = question.toLowerCase()
  return WEATHER_WORDS.some((word) => text.includes(word))
}

export function useVoiceDesk({ language, onQuestion }: { language: string; onQuestion: (text: string) => void }) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [chatOn, setChatOn] = useState(false)
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
  // The conversation has to outlive the render that started it: an answer that
  // finishes speaking two seconds later has to know whether the reader is still
  // in the voice chat, and hand the microphone back to them if they are.
  const chatRef = useRef(chatOn)
  chatRef.current = chatOn
  const speakRef = useRef(voiceOn)
  speakRef.current = voiceOn
  const listenRef = useRef<() => void>(() => {})
  // Whether this page is still on screen. A sentence cancelled by navigation
  // still reports its ending, and a desk that hands the microphone back to a
  // page that no longer exists starts a listener nobody can see or stop.
  const alive = useRef(true)
  const voices = useRef<SpeechSynthesisVoice[]>([])
  // Which voice chat this is. Stopping and starting the chat, leaving the page,
  // or being refused the microphone all change it, and a sentence that is still
  // being spoken when that happens must not hand the microphone to a
  // conversation that no longer exists - that is how a stopped chat came back
  // showing "voice chat is on" over a dead listener.
  const chatSession = useRef(0)
  // Chrome allows one recognition session at a time and needs a moment between
  // them, so a restart is always armed through this timer, never started twice.
  const listenTimer = useRef<number | undefined>(undefined)
  const lastStopped = useRef(0)
  const listeningRef = useRef(false)
  // How many times in a row the microphone was opened and heard nothing. Three
  // and the chat ends by itself rather than pulsing at a quiet room forever.
  const silentTries = useRef(0)
  const SILENT_RETRY_LIMIT = 3

  const micSupported = useRef(Boolean(recognitionCtor())).current
  const voiceSupported = useRef(typeof window !== 'undefined' && 'speechSynthesis' in window).current

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('radar-ai-speak', voiceOn ? 'on' : 'off')
  }, [voiceOn])

  useEffect(() => {
    if (!voiceSupported) return
    const load = () => {
      voices.current = window.speechSynthesis.getVoices()
    }
    load()
    // Most browsers hand over an empty list until the voices arrive a tick
    // later, and a desk that never re-checks them answers in the flat default.
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [voiceSupported])

  /**
   * Close the microphone session that is open, without it reporting an ending.
   *
   * An aborted session still fires its `onend`, and a session that is being
   * replaced has nothing left to say. Leaving that handler attached is how a
   * restart armed a second restart: the desk then showed "voice chat is on"
   * over a listener that had already been killed by the one after it.
   */
  const killRecognition = useCallback(() => {
    const previous = recognition.current
    recognition.current = null
    listeningRef.current = false
    lastStopped.current = Date.now()
    if (!previous) return
    previous.onresult = null
    previous.onerror = null
    previous.onend = null
    previous.abort()
  }, [])

  const cancelArmedListen = useCallback(() => {
    if (listenTimer.current !== undefined) window.clearTimeout(listenTimer.current)
    listenTimer.current = undefined
  }, [])

  /**
   * Hold the floor for the reader again, a beat after the last session closed.
   *
   * Browsers keep one recognition running at a time and need the moment between
   * them to let go, so a re-arm always goes through this timer instead of
   * starting a second listener on top of the first. A chat that hears nothing
   * three times in a row ends by itself: silence is the reader having stopped,
   * and a button pulsing at an empty room is not a conversation.
   */
  const armAgain = useCallback(
    (delay = 320) => {
      if (!alive.current || !chatRef.current) return
      if (silentTries.current >= SILENT_RETRY_LIMIT) {
        chatRef.current = false
        setChatOn(false)
        cancelArmedListen()
        return
      }
      silentTries.current += 1
      cancelArmedListen()
      const wait = Math.max(delay, 400 - (Date.now() - lastStopped.current))
      listenTimer.current = window.setTimeout(() => {
        listenTimer.current = undefined
        if (alive.current && chatRef.current) listenRef.current()
      }, wait)
    },
    [cancelArmedListen],
  )

  // Leaving the page mid-sentence must not leave a voice talking over the news,
  // or an armed timer that opens a microphone on a page nobody is looking at.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      chatRef.current = false
      chatSession.current += 1
      cancelArmedListen()
      killRecognition()
      if (voiceSupported) window.speechSynthesis.cancel()
    }
  }, [cancelArmedListen, killRecognition, voiceSupported])

  const stopListening = useCallback(() => {
    cancelArmedListen()
    killRecognition()
    setListening(false)
  }, [cancelArmedListen, killRecognition])

  const startListening = useCallback(() => {
    const Ctor = recognitionCtor()
    // A session that is already open is never replaced by a second one: the
    // browser would drop the first, and the reader would be left holding a
    // button that says the desk is listening while nothing is listening.
    if (!Ctor || listeningRef.current) return
    if (voiceSupported) window.speechSynthesis.cancel()
    killRecognition()

    const rec = new Ctor()
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
      const code = event?.error
      const denied = code === 'not-allowed' || code === 'service-not-allowed'
      setMicError(denied ? 'denied' : code === 'no-speech' ? '' : 'failed')
      // A microphone the reader will not open, or a browser that needs one
      // they have not allowed, cannot carry a conversation: the chat ends
      // rather than pulsing at them forever.
      if (denied) {
        chatRef.current = false
        setChatOn(false)
        cancelArmedListen()
      }
    }
    rec.onend = () => {
      lastStopped.current = Date.now()
      listeningRef.current = false
      setListening(false)
      setHeard('')
      const question = said.trim()
      // The dictation is the question: a reader who pressed a microphone and
      // said a sentence should not have to press anything else to ask it.
      if (question) {
        silentTries.current = 0
        onAsk.current(question)
        return
      }
      // A session that closed with nothing said is not the end of a
      // conversation. The reader coughed, or thought for a second, and the desk
      // is still holding the floor for them.
      if (chatRef.current) armAgain()
    }

    setMicError('')
    setHeard('')
    listeningRef.current = true
    setListening(true)
    try {
      rec.start()
    } catch {
      lastStopped.current = Date.now()
      listeningRef.current = false
      setListening(false)
      setMicError('failed')
      // The browser not being ready is not the reader's mistake; ask once more
      // while the chat is still open.
      if (chatRef.current) armAgain(600)
    }
  }, [armAgain, cancelArmedListen, killRecognition, language, voiceSupported])

  /**
   * The answer, said out loud in a woman's voice.
   *
   * Two things happen when the sentence ends, and only one of them is obvious:
   * the button stops pulsing, and - if this is a voice chat - the microphone
   * comes back on. That second half is what makes it a conversation instead of
   * a walkie-talkie: the reader says a thing, hears the desk say a thing, and
   * is already holding the floor again for the follow-up they were about to
   * ask. A device that cannot speak, or an answer that was never spoken, hands
   * the microphone back immediately for the same reason.
   */
  const say = useCallback(
    (text: string) => {
      const clean = String(text || '').trim()
      // Text chat answers stay silent. Speech is reserved for an explicitly
      // active voice-chat session, regardless of the saved voice preference.
      if (!chatRef.current) return
      // The conversation this sentence belongs to. A sentence cancelled because
      // the reader stopped the chat and started it again must not hand the
      // microphone to the new one on top of the listener that already has it.
      const session = chatSession.current
      const handBack = () => {
        if (!alive.current || !chatRef.current || chatSession.current !== session) return
        armAgain(220)
      }
      if (!voiceSupported || !clean) {
        handBack()
        return
      }
      // A reader who turned speaking off is still in a voice chat: the desk has
      // nothing to say out loud, so it gives the floor straight back rather
      // than going quiet and deaf at the same moment.
      if (!speakRef.current) {
        handBack()
        return
      }
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(clean.slice(0, 1200))
      const lang = voiceFor(language)
      const chosen = pickVoice(lang, voices.current)
      if (chosen) {
        utterance.voice = chosen
        utterance.lang = chosen.lang || lang
      } else {
        utterance.lang = lang
      }
      utterance.rate = 1.02
      // A little above the device's own pitch, which is how a person hears the
      // difference between a voice reading a sentence and a voice speaking it.
      utterance.pitch = 1.1
      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => {
        setSpeaking(false)
        handBack()
      }
      utterance.onerror = () => {
        setSpeaking(false)
        handBack()
      }
      setSpeaking(true)
      window.speechSynthesis.speak(utterance)
    },
    [armAgain, language, voiceSupported],
  )

  const stopSpeaking = useCallback(() => {
    if (voiceSupported) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [voiceSupported])

  listenRef.current = startListening

  /**
   * Open or close the voice chat with one press.
   *
   * Starting it is the same as speaking a question, and ending it is the point:
   * the microphone stops listening, nothing more is read out, and the reader is
   * left with the page they can type in again. Turning it off mid-sentence also
   * stops the sentence - a control that only silences the next answer is not a
   * way to end a conversation.
   */
  const toggleChat = useCallback(() => {
    if (chatRef.current) {
      // This conversation is over: its number is retired first, so a sentence
      // still being cancelled cannot come back and open a listener for it.
      chatSession.current += 1
      chatRef.current = false
      setChatOn(false)
      cancelArmedListen()
      setListening(false)
      setHeard('')
      silentTries.current = 0
      killRecognition()
      stopSpeaking()
      return
    }
    chatSession.current += 1
    silentTries.current = 0
    // The ref is set as well as the state, because the microphone reports its
    // ending before React has rendered the button: a chat that is only "on" in
    // the next render is a chat that re-arms nothing when the first sentence
    // finishes.
    chatRef.current = true
    setChatOn(true)
    startListening()
  }, [cancelArmedListen, killRecognition, startListening, stopSpeaking])

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
    speaking,
    heard,
    micError,
    startListening,
    stopListening,
    chatOn,
    toggleChat,
    voiceOn,
    setVoiceOn,
    say,
    stopSpeaking,
    askLocation,
    near,
  }
}
