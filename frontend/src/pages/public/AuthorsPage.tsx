import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, Search, Users } from 'lucide-react'
import { publicAPI, type DirectoryWriter, type WriterDirectory } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import Avatar from '../../components/common/Avatar'
import EmptyState from '../../components/common/EmptyState'
import { SkeletonCards } from '../../components/common/Skeleton'
import { useSeo } from '../../utils/useSeo'

const SORTS = ['stories', 'recent', 'followers', 'name'] as const
type Sort = (typeof SORTS)[number]

const sortFor = (value: string | null): Sort => (SORTS.includes(value as Sort) ? (value as Sort) : 'stories')

// One story, three stories; one follower, forty followers. The counts are the
// whole point of this page, so they should read like English rather than like a
// database dump.
function count(value: number, oneKey: string, manyKey: string, t: (key: string) => string) {
  return `${(value || 0).toLocaleString()} ${t(value === 1 ? oneKey : manyKey)}`
}

// How long ago a story ran, in the words a reader actually uses. A directory
// sorted by"most recent" is useless if the page only prints a date nobody can
// place, and an author whose last story is from two years ago should look like
// that rather than like a beat that is being covered this week.
function since(publishedAt: string | null) {
  if (!publishedAt) return ''
  const then = new Date(publishedAt)
  if (Number.isNaN(then.getTime())) return ''
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return then.toLocaleDateString()
  if (days === 1) return `${then.toLocaleDateString()} · 1 d`
  if (days < 30) return `${then.toLocaleDateString()} · ${days} d`
  return then.toLocaleDateString()
}

export default function AuthorsPage() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [directory, setDirectory] = useState<WriterDirectory | null>(null)
  const [writers, setWriters] = useState<DirectoryWriter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const sort = sortFor(searchParams.get('sort'))
  const term = searchParams.get('q') || ''

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await publicAPI.getWriters({ sort, q: term || undefined, limit: 60 })
      const payload = response.data.data as WriterDirectory
      setDirectory(payload)
      setWriters(Array.isArray(payload?.writers) ? payload.writers : [])
    } catch (err: any) {
      setError(err?.response?.data?.message || t('authors.failed'))
      setWriters([])
      setDirectory(null)
    } finally {
      setLoading(false)
    }
  }, [sort, term, t])

  useEffect(() => {
    void load()
  }, [load])

  // The page is a list of people, so it says who it is and how many of them the
  // newsroom has. It stays in the index: an empty directory is still the answer
  // to"who writes for RADAR", and the publisher pages have been asking for a
  // page that names the staff since the ad application.
  useSeo({
    title: t('authors.title'),
    description: `${t('authors.subtitle')} ${directory?.total ? `${directory.total} ${t(directory.total === 1 ? 'authors.countOne' : 'authors.count')}.` : ''}`.trim(),
    path: '/authors',
  })

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('q') as string
    const next: Record<string, string> = { sort }
    if (value && value.trim()) next.q = value.trim()
    setSearchParams(next)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-[var(--color-text)] sm:text-3xl">{t('authors.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">{t('authors.subtitle')}</p>
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={submit} className="flex items-center gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={term}
              key={term}
              type="search"
              placeholder={t('authors.searchPlaceholder')}
              className="input-field w-56 pl-9 text-sm"
              aria-label={t('authors.searchPlaceholder')}
            />
          </label>
          <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {t('authors.search')}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1">
          {SORTS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSearchParams(term ? { sort: option, q: term } : { sort: option })}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                sort === option
                  ? 'bg-[var(--color-brand)] text-white'
                  : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t(`authors.sort.${option}`)}
            </button>
          ))}
          {directory && !loading && !error && (
            <span className="ml-2 text-xs text-[var(--color-text-muted)]">
              {directory.total} {t(directory.total === 1 ? 'authors.countOne' : 'authors.count')}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonCards count={4} className="lg:grid-cols-4" />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
      ) : writers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={term ? t('authors.empty') : t('authors.none')}
          description={term ? undefined : t('authors.subtitle')}
          action={
            term ? (
              <Link to="/authors" className="text-sm font-bold text-[var(--color-brand-text)] hover:underline">
                {t('authors.title')}
              </Link>
            ) : (
              <Link to="/articles" className="text-sm font-bold text-[var(--color-brand-text)] hover:underline">
                {t('categories.browseAll')}
              </Link>
            )
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {writers.map((writer) => (
            <li key={writer._id} className="card flex flex-col p-4">
              <Link to={`/user/${writer._id}`} className="flex items-center gap-3">
                <Avatar src={writer.avatar} name={writer.fullName} className="h-12 w-12 bg-slate-100 text-base font-bold text-slate-600" />
                <span className="min-w-0">
                  <span className="block truncate font-bold text-[var(--color-text)]">{writer.fullName}</span>
                  {writer.username && <span className="block truncate text-xs text-[var(--color-text-muted)]">@{writer.username}</span>}
                </span>
              </Link>

              {writer.bio && <p className="mt-3 line-clamp-2 text-sm text-[var(--color-text-muted)]">{writer.bio}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" />
                  {count(writer.stories, 'authors.story', 'authors.stories', t)}
                </span>
                <span>{count(writer.reads, 'authors.read', 'authors.reads', t)}</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {count(writer.followers, 'authors.follower', 'authors.followers', t)}
                </span>
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                <span className="text-[11px] text-[var(--color-text-muted)]">{since(writer.lastPublished)}</span>
                <Link to={`/user/${writer._id}`} className="text-xs font-bold text-[var(--color-brand-text)] hover:underline">
                  {t('authors.open')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
