import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, RotateCcw, Send, Sparkles } from 'lucide-react'
import { aiAPI, type AiAnswer, type AiAskTurn, type AiStatus } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { useSeo } from '../../utils/useSeo'

/**
 * The RADAR AI chat page.
 *
 * The panel at the bottom of a story is one box for one question, and it is
 * right where a reader is standing. This is the desk itself: a conversation that
 * keeps going, on its own page, with the whole window to answer in.
 *
 * What "all questions allowed" means here, and what it cannot mean.
 *
 * Three desks answer behind this box. A question about what RADAR published is
 * answered from the published stories and from nothing else - that is the rule
 * that keeps this a newsroom and not a chatbot, and it is enforced on the server
 * by reading the story out of the database rather than believing what the page
 * sent. A question about this site is answered from the newsroom's own handbook.
 * Everything else - a term, a place, an institution, how something works, a
 * piece of history or science - goes to the research desk, and that desk answers
 * it instead of saying we have not reported on that. So a reader can ask
 * anything, and every reply carries the line saying which of the three wrote it.
 *
 * The one limit nobody can lift is the model's own refusal, printed as a message
 * rather than hidden, and the hourly ceiling from one address, which the page
 * quotes from the server rather than inventing.
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

let entrySeq = 0
const nextId = () => `radar-ai-${(entrySeq += 1)}`

export default function RadarAiPage() {
  const { t } = useI18n()
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

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

      const result = await aiAPI.ask({ question, history })

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
      }
      setBusy(false)
      inputRef.current?.focus()
    },
    [busy, entries],
  )

  const suggestions = [
    t('ai.suggestToday'),
    t('ai.suggestWrite'),
    'How does a central bank change the price of bread?',
    'What is a supercomputer, in plain terms?',
  ]

  const maxChars = status?.maxQuestionChars ?? 1200

  return (
    <div className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <header className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50 p-5 sm:p-6">
        <span className="inline-flex items-center gap-1.5 rounded bg-white px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-blue-700">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t('ai.badge')}
        </span>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('ai.pageTitle')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{t('ai.pageIntro')}</p>
        {status?.configured && status.questionsPerHour > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {t('ai.limitBefore')} {status.questionsPerHour} {t('ai.limitAfter')}
          </p>
        )}
      </header>

      {/* The thread. It grows downward and the page scrolls with it, because a
          conversation you have to resize a box to read is not a conversation. */}
      <div className="mt-5 flex-1 space-y-3" aria-live="polite">
        {entries.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-bold text-slate-900">{t('ai.tryAsking')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
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
            <span className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
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
        <p className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">{t('ai.checking')}</p>
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
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">{t('ai.enterToSend')}</p>
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {t('ai.send')}
            </button>
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
