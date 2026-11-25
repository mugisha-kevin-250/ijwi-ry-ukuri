import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Mic, RotateCcw, Send, Sparkles, Volume2, VolumeX } from 'lucide-react'
import { aiAPI, type AiAnswer, type AiAskTurn, type AiStatus } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { useSeo } from '../../utils/useSeo'
import ThinkingDots from '../../components/ai/ThinkingDots'
import { asksForSky, useVoiceDesk } from '../../components/ai/useVoiceDesk'

/**
 * The RADAR AI chat page.
 *
 * Every "ask" on the site - the line on the home page, the button at the bottom
 * of a story - opens this address, so this is where the desk lives rather than
 * where a panel unfolds over the news.
 *
 * It opens the way the assistants a reader already knows open: three welcome
 * lines arriving one after another while the server wakes, then a mark and a
 * greeting - with the reader's own name in it when this browser holds an
 * account - and the questions they can tap instead of typing. There is no
 * paragraph describing the service above the box, because a reader who arrives
 * here is about to type rather than read about typing.
 *
 * What the page still refuses to hide is where an answer came from. A question
 * about what RADAR published is answered from the published stories and from
 * nothing else - that rule is enforced on the server by reading the story out of
 * the database rather than believing what the page sent - a question about this
 * site is answered from the newsroom's own handbook, and anything else goes to
 * the research desk, which answers it from general knowledge. Each reply carries
 * the line saying which of the three wrote it, and the disclaimer under the box
 * says what those labels are worth.
 *
 * The thread is this tab's, and no one else's. It is replayed to the model with
 * each question so a follow-up makes sense, and it is written nowhere: not to
 * storage, not to an account, not to a table. Reloading empties the page.
 */

/** A turn in the thread, plus what a plain chat turn does not need. */
interface Entry extends AiAskTurn {
  id: string
  /** Only on an assistant entry: the story the answer came from. */
  groundedOn?: AiAnswer['groundedOn']
  /** Only on an assistant entry: which desk wrote it. */
  kind?: AiAnswer['kind']
  /** Only on an assistant entry: this line is the desk failing, not answering. */
  failure?: boolean
}

/** The story a reader arrived with, so the chat can start in front of it. */
interface StoryContext {
  slug: string
  title: string
}

let entrySeq = 0
const nextId = () => `radar-ai-${(entrySeq += 1)}`

/**
 * The welcome is timed, not raced. The lines come at their own pace and the
 * desk opens when both the last line has had its moment and the server has
 * answered the status call - whichever is later, so a fast server does not cut
 * a sentence off and a cold one does not trap the reader in the introduction.
 */
const INTRO_FIRST_MS = 260
const INTRO_GAP_MS = 560
const INTRO_HOLD_MS = 380
/** Free Render sleeps for 5-13 seconds; past this the page opens and says so. */
const INTRO_CAP_MS = 3200

const prefersStillness = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function RadarAiPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const location = useLocation()
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [lines, setLines] = useState(prefersStillness() ? 3 : 0)
  const [welcomeDone, setWelcomeDone] = useState(false)
  const [deskOpen, setDeskOpen] = useState(prefersStillness())
  const [entries, setEntries] = useState<Entry[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // The microphone and the voice are the device's own, and a dictated sentence is
  // sent as the same question the reader would have typed - so the desk behind
  // this page does not change, only the way a reader reaches it.
  const askRef = useRef<(text: string) => void>(() => {})
  const voice = useVoiceDesk({ language: lang, onQuestion: (text) => askRef.current(text) })

  // A reader who came from a story arrives with it, and the desk keeps it for the
  // whole thread: the news answers stay grounded in the thing they just read.
  const [story] = useState<StoryContext | null>(() => {
    const given = (location.state as { story?: StoryContext } | null)?.story
    return given && typeof given.slug === 'string' && given.slug ? { slug: given.slug, title: given.title || '' } : null
  })

  useSeo({
    title: t('ai.pageTitle'),
    description: t('ai.pageMetaDescription'),
    path: '/radar-ai',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: t('ai.pageTitle'),
      description: t('ai.pageMetaDescription'),
      isPartOf: { '@type': 'WebSite', name: 'RADAR' },
    },
  })

  // Whether the desk is staffed is asked once when the page opens, never per
  // question: the page must not look like a chat box that only ever errors.
  useEffect(() => {
    let alive = true
    aiAPI
      .status()
      .then((next) => {
        if (alive) setStatus(next)
      })
      .catch(() => {
        if (alive) setStatus({ configured: false, model: '', maxQuestionChars: 1200, turnsKept: 8, questionsPerHour: 0 })
      })
    return () => {
      alive = false
    }
  }, [])

  // The welcome lines, one a beat after another, then the last one gets its own
  // moment before the desk opens. A device that asked for less motion skips the
  // performance and comes straight to the desk.
  useEffect(() => {
    if (prefersStillness()) {
      setWelcomeDone(true)
      return undefined
    }
    const timers = [1, 2, 3].map((line) => window.setTimeout(() => setLines(line), INTRO_FIRST_MS + (line - 1) * INTRO_GAP_MS))
    const done = window.setTimeout(() => setWelcomeDone(true), INTRO_FIRST_MS + 2 * INTRO_GAP_MS + INTRO_HOLD_MS)
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
      window.clearTimeout(done)
    }
  }, [])

  useEffect(() => {
    if (!welcomeDone || deskOpen) return
    if (status !== null) {
      setDeskOpen(true)
      return undefined
    }
    // Still nothing from the server: keep the reader in the welcome a little
    // longer, but never past the cold-start ceiling. Opening without an answer
    // is honest here - the page then says the desk is waking, not that it works.
    const cap = window.setTimeout(() => setDeskOpen(true), INTRO_CAP_MS)
    return () => window.clearTimeout(cap)
  }, [welcomeDone, status, deskOpen])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries, busy])

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim()
      if (!question || busy) return

      // A line where the desk failed is printed for the reader but is not
      // replayed to the model: an apology is not something anybody said.
      const history: AiAskTurn[] = entries
        .filter((entry) => !entry.failure)
        .map(({ role, text: body }) => ({ role, text: body }))

      setEntries((current) => [...current, { id: nextId(), role: 'user', text: question }])
      setDraft('')
      setBusy(true)

      // Only a question about the sky is worth asking the device where the
      // reader is, and only then: the rest of the desk's answers come from the
      // newsroom's own files and need nothing from a phone's GPS.
      const near = asksForSky(question) ? await voice.askLocation() : ''

      const result = await aiAPI.ask({ question, slug: story?.slug || '', history, near })

      if ('error' in result) {
        setEntries((current) => [
          ...current,
          { id: nextId(), role: 'assistant', text: result.error, failure: true },
        ])
      } else {
        setEntries((current) => [
          ...current,
          { id: nextId(), role: 'assistant', text: result.answer, groundedOn: result.groundedOn, kind: result.kind },
        ])
        voice.say(result.answer)
      }
      setBusy(false)
      inputRef.current?.focus()
    },
    [busy, entries, story, voice],
  )

  useEffect(() => {
    askRef.current = (text: string) => void ask(text)
  }, [ask])

  // Tapped instead of typed, because a blank box asks more of a reader than a
  // suggested question does. With a story in hand the prompts are about it.
  const suggestions = story
    ? [t('ai.storySuggestSeed'), t('ai.storySuggest1'), t('ai.storySuggest2'), t('ai.storySuggest3')]
    : [t('ai.suggestToday'), t('ai.suggestWrite'), 'How does a central bank change the price of bread?', 'What is a supercomputer, in plain terms?']

  // The name belongs to the account this browser holds, and only its first word
  // is used: a full name in a headline reads like a form letter.
  const readerName = (user?.fullName || '').trim().split(/\s+/)[0]
  const greeting = `${t('ai.hi')}${readerName ? ` ${readerName}` : ''}${t('ai.greetTail')}`

  const maxChars = status?.maxQuestionChars ?? 1200

  const chips = (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {suggestions.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => void ask(prompt)}
          disabled={busy || status?.configured !== true}
          className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-800 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  )

  if (!deskOpen) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-10 text-center sm:px-6">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 to-sky-500 text-white shadow-lg">
          <Sparkles className="h-7 w-7" aria-hidden="true" />
        </span>
        {lines >= 1 && <p className="ai-welcome-line text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{t('ai.welcome1')}</p>}
        {lines >= 2 && <p className="ai-welcome-line text-sm text-slate-600 sm:text-base">{t('ai.welcome2')}</p>}
        {lines >= 3 && (
          <p className="ai-welcome-line inline-flex items-center gap-2 text-xs text-slate-500">
            {status === null && <ThinkingDots />}
            {t('ai.welcome3')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="ai-desk-in mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      {/* The thread. It grows downward and the page scrolls with it, because a
          conversation you have to resize a box to read is not a conversation. */}
      <div className="flex-1 space-y-3" aria-live="polite">
        {entries.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center sm:py-14">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 to-sky-500 text-white shadow-lg">
              <Sparkles className="h-7 w-7" aria-hidden="true" />
            </span>
            <h1 className="mt-5 max-w-xl text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">{greeting}</h1>
            {story && (
              <p className="mt-2 max-w-md text-xs text-slate-500">
                {story.title ? (
                  <>
                    <span className="font-bold text-slate-600">{t('ai.aboutThisStory')}</span>{' '}
                    <Link to={`/article/${story.slug}`} className="font-bold text-blue-700 hover:underline">
                      {story.title}
                    </Link>
                  </>
                ) : (
                  t('ai.aboutThisStory')
                )}
              </p>
            )}
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">{t('ai.tryAsking')}</p>
            {chips}
          </div>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                entry.role === 'user'
                  ? 'max-w-[88%] rounded-2xl rounded-br-sm bg-blue-700 px-4 py-2.5 text-sm leading-relaxed text-white sm:max-w-[75%]'
                  : entry.failure
                    ? 'max-w-[92%] rounded-2xl rounded-bl-sm border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm leading-relaxed text-amber-900'
                    : 'max-w-[92%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-800'
              }
            >
              <p className="whitespace-pre-line">{entry.text}</p>
              {/* Where an answer came from is part of it: reporting, the
                  handbook, or general background the reporters have not checked. */}
              {entry.role === 'assistant' && !entry.failure && entry.kind && (
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {entry.kind === 'site'
                    ? t('ai.sourceSite')
                    : entry.kind === 'research'
                      ? t('ai.sourceResearch')
                      : t('ai.sourceNews')}
                </p>
              )}
              {entry.role === 'assistant' && entry.groundedOn && (
                <Link
                  to={`/article/${entry.groundedOn.slug}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
                >
                  {entry.groundedOn.title || t('ai.readStory')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            {/* The answer takes seconds, so the wait is shown as work: three dots
                rising beside the line, inside a status region so a reader who
                cannot see them still hears that the desk is thinking. */}
            <span
              role="status"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500"
            >
              <ThinkingDots />
              {t('ai.thinking')}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {entries.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setEntries([])
            inputRef.current?.focus()
          }}
          className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('ai.clearChat')}
        </button>
      )}

      {/* The press. Nothing is typed into a box that cannot answer: when the
          newsroom has not given this server its key, the page says so in the
          place where the box would be. */}
      {status === null ? (
        <p className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          <ThinkingDots />
          {t('ai.checking')}
        </p>
      ) : !status.configured ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('ai.notConnected')}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void ask(draft)
          }}
          className="sticky bottom-20 mt-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:bottom-4"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void ask(draft)
              }
            }}
            rows={2}
            maxLength={maxChars}
            placeholder={t('ai.pagePlaceholder')}
            aria-label={t('ai.pagePlaceholder')}
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 sm:text-sm"
          />
          {/* What the microphone is doing has to be visible while it does it:
              a dictated sentence appears as it is heard, and a refusal or a
              dead end says so instead of leaving the reader talking to a still
              page. */}
          {voice.listening && (
            <p className="mt-2 flex items-center gap-2 text-xs font-bold text-blue-700" role="status" aria-live="polite">
              <span className="ai-mic-pulse h-2.5 w-2.5 rounded-full bg-blue-600" aria-hidden="true" />
              {voice.heard || t('ai.hearing')}
            </p>
          )}
          {voice.micError && (
            <p className="mt-2 text-xs text-amber-800" role="status">
              {voice.micError === 'denied' ? t('ai.micDenied') : t('ai.micFailed')}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">{t('ai.enterToSend')}</p>
            <div className="flex items-center gap-2">
              {voice.voiceSupported && (
                <button
                  type="button"
                  onClick={() => {
                    if (voice.voiceOn) {
                      voice.setVoiceOn(false)
                      voice.stopSpeaking()
                    } else {
                      voice.setVoiceOn(true)
                    }
                  }}
                  aria-pressed={voice.voiceOn}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition ${
                    voice.voiceOn
                      ? 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {voice.voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  <span className="hidden sm:inline">{t('ai.speakAnswers')}</span>
                </button>
              )}
              {voice.micSupported && (
                <button
                  type="button"
                  onClick={() => (voice.listening ? voice.stopListening() : voice.startListening())}
                  disabled={busy}
                  aria-pressed={voice.listening}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                    voice.listening ? 'bg-blue-800 text-white' : 'border border-blue-200 bg-white text-blue-800 hover:bg-blue-50'
                  }`}
                >
                  <Mic className="h-4 w-4" />
                  {voice.listening ? t('ai.listening') : t('ai.speak')}
                </button>
              )}
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {t('ai.send')}
              </button>
            </div>
          </div>
        </form>
      )}

      <p className="mt-4 max-w-2xl text-[11px] leading-relaxed text-slate-500">{t('ai.disclaimer')}</p>

      <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold">
        <Link to="/articles" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
          {t('nav.articles')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link to="/search" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
          {t('nav.search')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
