import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Bot, Send, Trash2, User } from 'lucide-react'
import { adminAPI, type AiChatTurn } from '../../services/api'

/**
 * The research desk.
 *
 * An editor's questions about a topic, answered by the same model that writes
 * the drafts but under a different instruction: this is not allowed to produce
 * publishable prose, only leads worth checking. Keeping the thread on the server
 * against the admin's own account means a conversation survives a closed tab,
 * and it means the questions a story was built on can be read again later.
 *
 * What it cannot do is publish anything. The only way out of this panel and onto
 * the site is the writer above, and then the admin's own click.
 */
export default function AiResearchChat({ onUseTopic }: { onUseTopic: (topic: string) => void }) {
  const [turns, setTurns] = useState<AiChatTurn[]>([])
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const thread = await adminAPI.getAiChat()
      setTurns(thread.turns)
    } catch {
      // A thread that will not load is not worth interrupting the page for; the
      // first question will report the same problem with its real reason.
      setTurns([])
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight
  }, [turns, asking])

  const ask = async () => {
    const question = draft.trim();
    if (question.length < 3 || asking) return
    setAsking(true)
    setError('')
    // The question goes on the screen immediately, before the answer comes back,
    // so a slow reply reads as work in progress rather than a dead button.
    setTurns((current) => [...current, { role: 'user', text: question, at: new Date().toISOString() }])
    setDraft('')
    try {
      const thread = await adminAPI.askAiChat(question)
      setTurns(thread.turns)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The research desk could not answer that. Try again in a moment.')
      setTurns((current) => current.slice(0, -1))
      setDraft(question)
    } finally {
      setAsking(false)
      input.current?.focus()
    }
  }

  const clear = async () => {
    setError('')
    setTurns([])
    try {
      await adminAPI.clearAiChat()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The thread could not be cleared.')
      void load()
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Ask the research desk</h2>
            <p className="text-xs text-slate-500">
              Questions, angles, what to verify and who to call. Answers are leads, not copy — nothing here reaches a
              reader unless you write it yourself.
            </p>
          </div>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => void clear()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear the thread
          </button>
        )}
      </div>

      {ready && turns.length === 0 && !asking && (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Nothing asked yet. Try “what does the newsroom need to confirm before writing about this?” or “who would
          actually be quoted on this story?”.
        </p>
      )}

      {turns.length > 0 && (
        <div ref={scroller} className="mt-4 max-h-[26rem] space-y-3 overflow-y-auto pr-1">
          {turns.map((turn, index) => (
            <div key={`${turn.role}-${turn.at || index}`} className={`flex gap-2.5 ${turn.role === 'user' ? 'justify-end' : ''}`}>
              {turn.role === 'assistant' && (
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                  <Bot className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0 max-w-[85%]">
                <div
                  className={`whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    turn.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  {turn.text}
                </div>
                {turn.role === 'assistant' && (
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    {turn.at && <span>{new Date(turn.at).toLocaleString()}</span>}
                    {turn.model && <span>{turn.model}</span>}
                    {/* The question that prompted this answer is the thing worth
                        putting in front of the writer, not the answer itself. */}
                    {turns[index - 1]?.role === 'user' && (
                      <button
                        type="button"
                        onClick={() => onUseTopic(turns[index - 1].text)}
                        className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                      >
                        <ArrowUpRight className="h-3 w-3" />
                        Take this to the writer
                      </button>
                    )}
                  </div>
                )}
              </div>
              {turn.role === 'user' && (
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <User className="h-4 w-4" />
                </span>
              )}
            </div>
          ))}
          {asking && (
            <div className="flex gap-2.5">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
              </span>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500">
                Thinking it through…
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-end gap-2">
        <textarea
          ref={input}
          value={draft}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void ask()
            }
          }}
          placeholder="What should the newsroom check before this becomes a story?"
          className="min-w-0 flex-1 resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={asking || draft.trim().length < 3}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Ask
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        Enter sends, Shift+Enter starts a new line. Thirty questions an hour keeps one person talking rather than
        training a bot.
      </p>
    </section>
  )
}
