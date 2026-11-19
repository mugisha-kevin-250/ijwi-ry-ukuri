import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Clock, Megaphone, RefreshCw, Send, Undo2, X } from 'lucide-react'
import { editorAPI, type StoryState } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import Avatar from '../../components/common/Avatar'
import MediaImage from '../../components/common/MediaImage'
import { useAuth } from '../../context/AuthContext'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { looksLikeHtml, splitParagraphs } from '../../utils/storyBody'
import { cn } from '../../utils/cn'

interface ReviewEvent {
  from?: string
  to?: string
  note?: string
  at?: string
  by?: { fullName?: string; username?: string; role?: string } | null
}

function whoHandled(event: ReviewEvent): string {
  if (!event.by) return 'the automated schedule'
  return event.by.fullName || event.by.username || 'a staff member'
}

export default function EditorReviewPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { user } = useAuth()

  const [article, setArticle] = useState<any>(null)
  const [events, setEvents] = useState<ReviewEvent[]>([])
  const [nextStates, setNextStates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  // The three things the desk can say about a story without rewriting it: what
  // its photograph shows and whose it is, whether anyone paid for it, and what
  // we are correcting. They are held apart from `note`, which is a private
  // comment to the writer and is never published.
  const [photo, setPhoto] = useState({ imageCredit: '', imageCaption: '' })
  const [paid, setPaid] = useState({ isSponsored: false, sponsor: '' })
  const [correction, setCorrection] = useState('')
  const [disclosureBusy, setDisclosureBusy] = useState('')
  const [disclosureError, setDisclosureError] = useState('')

  // The desk's ruling on each source an author named, and the earlier versions
  // of the copy. `note` above is a private comment to the writer; a source note
  // is the reason for a verdict - who was called, what was read - and both stay
  // off the published page.
  const [sourceNotes, setSourceNotes] = useState<Record<string, string>>({})
  const [sourceBusy, setSourceBusy] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [revisions, setRevisions] = useState<any[]>([])

  const rule = async (sourceId: string, verdict: 'pending' | 'verified' | 'rejected') => {
    setSourceBusy(`${sourceId}:${verdict}`)
    setSourceError('')
    try {
      await editorAPI.setSourceVerdict(id, sourceId, verdict, sourceNotes[sourceId]?.trim() || undefined)
      setSourceNotes((current) => ({ ...current, [sourceId]: '' }))
      await load()
    } catch (err: any) {
      setSourceError(err?.response?.data?.message || 'That verdict was not recorded. Try again.')
    } finally {
      setSourceBusy('')
    }
  }

  const saveDisclosure = async (patch: Record<string, string | boolean>, label: string) => {
    setDisclosureBusy(label)
    setDisclosureError('')
    try {
      await editorAPI.updateDisclosure(id, patch)
      if ('correctionNote' in patch) setCorrection('')
      await load()
    } catch (err: any) {
      setDisclosureError(err?.response?.data?.message || 'The desk note was not saved. Try again.')
    } finally {
      setDisclosureBusy('')
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [storyRes, historyRes] = await Promise.all([
        editorAPI.getArticle(id),
        editorAPI.getHistory(id),
      ])
      const story = (storyRes.data.data as any)?.article
      if (!story) throw new Error('missing')
      setArticle(story)
      setPhoto({ imageCredit: story.imageCredit || '', imageCaption: story.imageCaption || '' })
      setPaid({ isSponsored: story.isSponsored === true, sponsor: story.sponsor || '' })
      setNextStates((storyRes.data.data as any)?.nextStates || [])
      setEvents((historyRes.data.data as any)?.events || [])
      setRevisions((historyRes.data.data as any)?.revisions || [])
    } catch (err: any) {
      // 404 here means the story was deleted or this account cannot see it;
      // either way the editor needs to be told, not left on a blank page.
      setError(
        err?.response?.status === 404
          ? 'This story is no longer in the queue. It may have been deleted.'
          : err?.response?.data?.message || 'We could not open this story for review.'
      )
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (label: 'approve' | 'reject' | 'correction' | 'publish' | 'unpublish' | 'restore') => {
    setBusy(label)
    setActionError('')
    try {
      const body = note || undefined
      switch (label) {
        case 'approve': await editorAPI.approveArticle(id, body); break
        case 'reject': await editorAPI.rejectArticle(id, body); break
        case 'correction': await editorAPI.requestCorrection(id, body); break
        case 'publish': await editorAPI.publishArticle(id); break
        case 'unpublish': await editorAPI.unpublishArticle(id); break
        case 'restore': await editorAPI.restoreArticle(id); break
      }
      setNote('')
      await load()
    } catch (err: any) {
      // The lifecycle answers with a sentence a person can act on; show it.
      setActionError(err?.response?.data?.message || 'That decision was refused. Reload and try again.')
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />)}
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-semibold text-red-700">{error}</p>
        <Link to="/editor/pending" className="mt-4 inline-block text-sm font-bold text-blue-700 hover:underline">
          {t('editor.review.backToQueue')}
        </Link>
      </div>
    )
  }

  const status = article.status as StoryState
  const isStaff = user?.role === 'EDITOR' || user?.role === 'ADMIN'
  const can = (state: string) => nextStates.includes(state)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/editor/pending" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {t('editor.review.backToQueue')}
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> {t('editor.queue.refresh')}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold capitalize text-slate-700">{status.replace('_', ' ')}</span>
          {article.aiGenerated && (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 font-bold text-violet-700">{t('editor.queue.aiWritten')}</span>
          )}
          <span className="text-slate-500">{article.readingTime || 1} {t('editor.review.minutes')}</span>
        </div>

        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{article.title}</h1>
        <p className="mt-2 text-sm font-medium text-slate-600">{article.summary}</p>

        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
          <Avatar
            name={article.author?.fullName || 'Writer'}
            src={article.author?.profileImage || article.author?.avatar}
            className="h-9 w-9 bg-slate-100 text-sm font-bold text-slate-600"
          />
          <div className="text-sm">
            <p className="font-semibold text-slate-800">{article.author?.fullName || 'Unknown writer'}</p>
            <p className="text-xs text-slate-500">
              {article.category?.name || 'No section'} · {new Date(article.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {article.featuredImage && (
          <MediaImage src={article.featuredImage} alt="" className="mt-4 aspect-video w-full rounded-lg object-cover" />
        )}
        {article.imageCredit && (
          <p className="mt-1 text-xs text-slate-500">{t('articles.imageCredit')}: {article.imageCredit}</p>
        )}

        <div className="prose prose-slate mt-4 max-w-none text-sm text-slate-700">
          {looksLikeHtml(article.content) ? (
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }} />
          ) : (
            splitParagraphs(article.content).map((block, index) => <p key={index}>{block}</p>)
          )}
        </div>
      </div>

      {isStaff && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-bold text-slate-900">{t('editor.review.decide')}</p>
          <p className="mt-1 text-xs text-slate-500">{t('editor.review.decideHint')}</p>

          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('editor.review.notePlaceholder')}
            rows={3}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {actionError && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {actionError}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {can('approved') && (
              <button
                type="button"
                onClick={() => void act('approve')}
                disabled={busy !== ''}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {t('editor.review.approve')}
              </button>
            )}

            {can('published') && (
              <button
                type="button"
                onClick={() => void act('publish')}
                disabled={busy !== ''}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Megaphone className="h-4 w-4" />
                {t('editor.review.publish')}
              </button>
            )}

            {can('rejected') && (
              <>
                <button
                  type="button"
                  onClick={() => void act('correction')}
                  disabled={busy !== ''}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {t('editor.review.correction')}
                </button>
                <button
                  type="button"
                  onClick={() => void act('reject')}
                  disabled={busy !== ''}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  {t('editor.review.reject')}
                </button>
              </>
            )}

            {can('archived') && (
              <button
                type="button"
                onClick={() => void act('unpublish')}
                disabled={busy !== ''}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" />
                {t('editor.review.takeDown')}
              </button>
            )}

            {can('published') && status === 'archived' && (
              <button
                type="button"
                onClick={() => void act('restore')}
                disabled={busy !== ''}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {t('editor.review.putBack')}
              </button>
            )}

            {nextStates.length === 0 && (
              <p className="text-sm text-slate-500">{t('editor.review.nothingLeft')}</p>
            )}
          </div>
        </div>
      )}

      {/* Disclosure, deliberately kept out of the decision box above: approve
          and reject are a verdict on the copy, while these are facts a reader is
          owed about it, and a story can need one without the other. */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-bold text-slate-900">{t('editor.disclosure.title')}</p>
        <p className="mt-1 text-xs text-slate-500">{t('editor.disclosure.hint')}</p>

        {disclosureError && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {disclosureError}
          </p>
        )}

        <div className="mt-4 space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="story-caption">
            {t('editor.disclosure.caption')}
          </label>
          <input
            id="story-caption"
            value={photo.imageCaption}
            onChange={(event) => setPhoto((current) => ({ ...current, imageCaption: event.target.value }))}
            maxLength={240}
            placeholder={t('editor.disclosure.captionHint')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="story-credit">
            {t('editor.disclosure.credit')}
          </label>
          <input
            id="story-credit"
            value={photo.imageCredit}
            onChange={(event) => setPhoto((current) => ({ ...current, imageCredit: event.target.value }))}
            maxLength={160}
            placeholder={t('editor.disclosure.creditHint')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => void saveDisclosure({ ...photo }, 'photo')}
            disabled={disclosureBusy !== ''}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {t('editor.disclosure.savePhoto')}
          </button>
        </div>

        <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={paid.isSponsored}
              onChange={(event) => setPaid((current) => ({ ...current, isSponsored: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t('editor.disclosure.isSponsored')}
          </label>
          {paid.isSponsored && (
            <input
              value={paid.sponsor}
              onChange={(event) => setPaid((current) => ({ ...current, sponsor: event.target.value }))}
              maxLength={120}
              placeholder={t('editor.disclosure.sponsorHint')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}
          <button
            type="button"
            onClick={() => void saveDisclosure({ isSponsored: paid.isSponsored, sponsor: paid.sponsor }, 'paid')}
            disabled={disclosureBusy !== '' || (paid.isSponsored && !paid.sponsor.trim())}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {t('editor.disclosure.saveSponsored')}
          </button>
          {paid.isSponsored && !paid.sponsor.trim() && (
            <p className="text-xs text-amber-700">{t('editor.disclosure.needsSponsor')}</p>
          )}
        </div>

        <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('editor.disclosure.corrections')}</p>
          {Array.isArray(article.corrections) && article.corrections.length ? (
            <ol className="space-y-1.5">
              {article.corrections.map((entry: { note?: string; at?: string }, index: number) => (
                <li key={`${entry?.at || index}-${index}`} className="text-sm text-slate-700">
                  <span className="font-semibold">{entry?.at ? new Date(entry.at).toLocaleDateString() : ''}</span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  {entry?.note}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">{t('editor.disclosure.noCorrections')}</p>
          )}
          <textarea
            value={correction}
            onChange={(event) => setCorrection(event.target.value)}
            rows={2}
            maxLength={600}
            placeholder={t('editor.disclosure.correctionHint')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => void saveDisclosure({ correctionNote: correction.trim() }, 'correction')}
            disabled={disclosureBusy !== '' || !correction.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <Megaphone className="h-4 w-4" />
            {t('editor.disclosure.publishCorrection')}
          </button>
          <p className="text-xs text-slate-500">{t('editor.disclosure.correctionNote')}</p>
        </div>
      </div>

      {/* The evidence an author named. The desk does not write these and the
          author does not verify them: saying a source has been checked is a
          claim the newsroom makes to a reader, so it can only come from
          somebody who did not file the story. */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-bold text-slate-900">{t('editor.sources.title')}</p>
        <p className="mt-1 text-xs text-slate-500">{t('editor.sources.hint')}</p>

        {sourceError && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {sourceError}
          </p>
        )}

        {Array.isArray(article.sources) && article.sources.length ? (
          <ol className="mt-4 space-y-4">
            {article.sources.map((source: any, index: number) => {
              const status = source.verificationStatus || 'pending';
              const reviewer = source.reviewedBy && typeof source.reviewedBy === 'object' ? source.reviewedBy : null;
              return (
                <li key={source._id || `source-${index}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {source.title || source.organization || source.url}
                    </span>
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-bold',
                      status === 'verified' && 'bg-emerald-100 text-emerald-800',
                      status === 'rejected' && 'bg-rose-100 text-rose-700',
                      status === 'pending' && 'bg-amber-100 text-amber-800',
                    )}>
                      {t(`articles.source${status === 'verified' ? 'Verified' : status === 'rejected' ? 'Rejected' : 'Pending'}`)}
                    </span>
                    {source.type && (
                      <span className="text-[11px] uppercase tracking-wide text-slate-500">
                        {t(`articles.sourceType.${source.type}`)}
                      </span>
                    )}
                  </div>

                  {source.organization && source.title && (
                    <p className="mt-1 text-xs text-slate-500">{source.organization}</p>
                  )}
                  {!!source.quote && (
                    <p className="mt-1 text-xs italic text-slate-600">“{source.quote}”</p>
                  )}
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:underline"
                    >
                      {source.url}
                    </a>
                  )}

                  <p className="mt-2 text-xs text-slate-500">
                    {(source.accessedAt || source.at) && (
                      <>{t('articles.sourceAccessed')} {new Date(source.accessedAt || source.at).toLocaleString()}</>
                    )}
                    {reviewer ? ` · ${reviewer.fullName || reviewer.role || ''}` : ''}
                  </p>
                  {!!source.reviewNote && (
                    <p className="mt-1 text-xs text-slate-600">{t('editor.sources.previousNote')}: “{source.reviewNote}”</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      value={sourceNotes[source._id] || ''}
                      onChange={(event) => setSourceNotes((current) => ({ ...current, [source._id]: event.target.value }))}
                      maxLength={400}
                      placeholder={t('editor.sources.notePlaceholder')}
                      className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {(['verified', 'rejected', 'pending'] as const).map((verdict) => (
                      <button
                        key={verdict}
                        type="button"
                        onClick={() => void rule(String(source._id), verdict)}
                        disabled={sourceBusy !== '' || status === verdict}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40',
                          verdict === 'verified' && 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
                          verdict === 'rejected' && 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100',
                          verdict === 'pending' && 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        {t(`editor.sources.mark.${verdict}`)}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-slate-500">{t('editor.sources.none')}</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-bold text-slate-900">{t('editor.review.history')}</p>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t('editor.review.noHistory')}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {events.map((event, index) => (
              <li key={`${event.at || index}-${index}`} className="flex gap-3 text-sm">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-800">
                    {event.from ? `${event.from} → ` : ''}{event.to}
                    {event.by ? ` · ${whoHandled(event)}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">{event.at ? new Date(event.at).toLocaleString() : ''}</p>
                  {event.note && <p className="mt-1 text-xs italic text-slate-600">“{event.note}”</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* What the page said before somebody rewrote it. Kept apart from the
            trail above: those are decisions on the story, these are the earlier
            copy itself, and only this desk ever sees them. */}
        <p className="mt-5 border-t border-slate-100 pt-4 text-sm font-bold text-slate-900">
          {t('editor.revisions.title')}
        </p>
        {revisions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t('editor.revisions.none')}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {revisions.map((revision, index) => {
              const author = revision.by && typeof revision.by === 'object' ? revision.by : null;
              return (
                <li key={`${revision.at || index}-${index}`} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-600">
                    {revision.at ? new Date(revision.at).toLocaleString() : ''}
                    {author ? ` · ${author.fullName || author.username || 'a staff member'}` : ''}
                  </p>
                  {revision.title && (
                    <p className="mt-1 text-sm font-semibold text-slate-800">{revision.title}</p>
                  )}
                  {revision.summary && (
                    <p className="mt-0.5 text-xs text-slate-600">{revision.summary}</p>
                  )}
                  {revision.content && (
                    <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-slate-500">
                      {revision.content}
                    </p>
                  )}
                  {revision.note && (
                    <p className="mt-2 text-xs italic text-slate-600">“{revision.note}”</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <button
        type="button"
        onClick={() => navigate('/editor/pending')}
        className="text-sm font-semibold text-blue-700 hover:underline"
      >
        {t('editor.review.backToQueue')}
      </button>
    </div>
  )
}
