import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Send, Sparkles, X } from 'lucide-react'
import { aiAPI, type AiAskTurn, type AiAnswer } from '../../services/api'
import { useI18n } from '../../context/I18nContext'

/**
 * Ask RADAR AI.
 *
 * One panel, two jobs. On the home page it sits where the red breaking strip
 * used to - a line you can open a conversation from. At the bottom of a story
 * it is the button that says"explain more about this", and the question is
 * seeded with the headline the reader just finished, so they do not have to
 * type anything to get an answer that means something.
 *
 * Three things the component will not do:
 *
 * - Pretend to be staffed. If the server says the desk is not connected, the
 *   panel says that in words and does not show a text box. A chat window that
 *   only ever errors is worse than an honest"not yet".
 * - Store the conversation anywhere but this tab. Nothing is written to
 *   localStorage and no account is needed; reload and it is gone. The reader's
 *   questions are theirs.
 * - Present an answer as reporting. Every answer carries the line that it comes
 *   from published RADAR stories, and when the desk was grounded in a particular
 *   story, that story is linked so the reader can read the thing itself.
 */

/** A turn in the panel, plus the two states a plain chat turn does not need. */
interface Entry extends AiAskTurn {
  id: string
  /** Only on an assistant entry: the story the answer came from. */
  groundedOn?: AiAnswer['groundedOn']
  /** Only on an assistant entry: which desk wrote it. */
  kind?: AiAnswer['kind']
}

interface AskRadarAiProps {
  /**
   * `strip` is the home page line: closed, one row tall, opens downward.
   * `card` is the block at the end of a story: a button first, the panel after.
   */
  variant?: 'strip' | 'card'
  /** Slug of the story the reader is on, when there is one. */
  slug?: string
  /** A headline or topic to ground a home-page question in. */
  topic?: string
  /** Prompts the reader can tap instead of typing. */
  suggestions?: string[]
  /**
   * The question sent when the reader opens a story panel and presses send
   * without typing - the"explain more about this news" the newsroom promised.
   */
  seedQuestion?: string
}

let entrySeq = 0
const nextId = () => `ai-${(entrySeq += 1)}`

export default function AskRadarAi({
  variant = 'strip',
  slug = '',
  topic = '',
  suggestions = [],
  seedQuestion = '',
}: AskRadarAiProps) {
  const { t } = useI18n()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Whether the desk is staffed is asked once per mount, never per question.
  useEffect(() => {
    let alive = true
    aiAPI
      .status()
      .then((status) => {
        if (alive) setConfigured(status.configured)
      })
      .catch(() => {
        if (alive) setConfigured(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [entries, open])

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim()
      if (!question || busy) return

      const history: AiAskTurn[] = entries.map(({ role, text: body }) => ({ role, text: body }))
      setEntries((current) => [...current, { id: nextId(), role: 'user', text: question }])
      setDraft('')
      setBusy(true)

      const result = await aiAPI.ask({ question, slug, topic, history })

      if ('error' in result) {
        // The failure is printed as its own entry: it is what the desk said, and
        // the reader's question stays above it rather than vanishing.
        setEntries((current) => [...current, { id: nextId(), role: 'assistant', text: result.error }])
      } else {
        setEntries((current) => [
          ...current,
          { id: nextId(), role: 'assistant', text: result.answer, groundedOn: result.groundedOn, kind: result.kind },
        ])
      }
      setBusy(false)
      inputRef.current?.focus()
    },
    [busy, entries, slug, topic],
  )

  const start = () => {
    setOpen(true)
    // A story panel that opens with a written question is the point of the
    // button: the reader asked for more about this story, so ask that.
    if (seedQuestion && !entries.length) {
      setDraft(seedQuestion)
      window.setTimeout(() => inputRef.current?.focus(), 60)
    } else {
      window.setTimeout(() => inputRef.current?.focus(), 60)
    }
  }

  const isCard = variant === 'card'

  if (configured === null) {
    return (
      <div
        className={
          isCard
            ? 'rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500'
            : 'bg-slate-100 px-4 py-2 text-xs text-slate-500'
        }
      >
        <span className="inline-flex items-center gap-2">
          {t('ai.checking')}
        </span>
      </div>
    )
  }

  if (!configured) {
    return (
      <div
        className={
          isCard
            ? 'rounded-xl border border-slate-200 bg-slate-50 p-4'
            : 'bg-slate-900 text-slate-100'
        }
      >
        <div className={isCard ? 'flex items-start gap-3' : 'mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs sm:px-6 lg:px-8'}>
          <Sparkles className={isCard ? 'h-5 w-5 shrink-0 text-slate-400' : 'h-4 w-4 shrink-0'} />
          <p className={isCard ? 'text-sm text-slate-600' : 'font-medium'}>{t('ai.notConnected')}</p>
        </div>
      </div>
    )
  }

  if (!open) {
    return isCard ? (
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50 p-5 text-center">
        <Sparkles className="mx-auto h-7 w-7 text-blue-700" />
        <h3 className="mt-2 text-lg font-extrabold text-slate-900">{t('ai.explainTitle')}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{t('ai.explainBody')}</p>
        <button
          type="button"
          onClick={start}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800"
        >
          <Sparkles className="h-4 w-4" />
          {t('ai.explainButton')}
        </button>
      </div>
    ) : (
      <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-sky-600 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 text-xs sm:px-6 lg:px-8">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded bg-white px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-blue-700">
            <Sparkles className="h-3.5 w-3.5" />
            {t('ai.badge')}
          </span>
          {/* The line always says what the desk is, never a headline: this row
              used to be a breaking banner, and a reader who mistakes it for one
              will not notice the button beside it. `topic` still grounds the
              answer, it just does not get printed here. */}
          <p className="truncate font-medium">{t('ai.stripBody')}</p>
          <button
            type="button"
            onClick={start}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-white/25"
          >
            {t('ai.ask')}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={isCard ? 'rounded-2xl border border-blue-200 bg-white' : 'bg-blue-50 border-y border-blue-200'}>
      <div className={isCard ? 'p-5' : 'mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8'}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-blue-700" />
          <h3 className="text-sm font-extrabold text-slate-900">{t('ai.panelTitle')}</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={t('ai.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-xs text-slate-500">{t('ai.groundingNote')}</p>

        {entries.length > 0 && (
          <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
            {entries.map((entry) => (
              <div key={entry.id} className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    entry.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-blue-700 px-3 py-2 text-sm text-white'
                      : 'max-w-[92%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800'
                  }
                >
                  <p className="whitespace-pre-line">{entry.text}</p>
                  {/* Where the answer came from is part of the answer. Three
                      desks share this box - the one that reads our reporting,
                      the one that explains this site, and the one that
                      answers anything else - and a reader has to be able to
                      tell them apart without reading the whole reply. */}
                  {entry.role === 'assistant' && entry.kind && (
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
                <span className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
                  {t('ai.thinking')}
                </span>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        {suggestions.length > 0 && entries.length === 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => ask(prompt)}
                disabled={busy}
                className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-800 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void ask(draft)
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('ai.placeholder')}
            maxLength={1200}
            className="min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">{t('ai.send')}</span>
          </button>
        </form>

        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{t('ai.disclaimer')}</p>
      </div>
    </div>
  )
}
