import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { publicAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const [term, setTerm] = useState(query)
  const [results, setResults] = useState<any>({ articles: [], authors: [] })
  const [loading, setLoading] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    setTerm(query)
  }, [query])

  useEffect(() => {
    const run = async () => {
      if (!query.trim()) {
        setResults({ articles: [], authors: [] })
        return
      }
      setLoading(true)
      try {
        const res = await publicAPI.search(query)
        setResults(res.data.data || { articles: [], authors: [] })
      } catch (e) {
        setResults({ articles: [], authors: [] })
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [query])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setParams(term.trim() ? { q: term.trim() } : {})
  }

return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <form onSubmit={handleSubmit} className="mb-6 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
        <Search className="h-5 w-5 text-slate-400" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('search.placeholder')}
          className="w-full bg-transparent text-sm outline-none"
        />
        <button className="rounded-full bg-blue-700 px-4 py-1 text-xs font-bold text-white">{t('nav.search')}</button>
      </form>

      {loading && <p className="text-sm text-slate-500">...</p>}

      {!loading && query && (
        <div className="space-y-6">
          {(results.authors || []).length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">{t('search.authors')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {(results.authors || []).map((author: any) => (
                  <Link key={author._id} to={`/user/${author._id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                      {author.avatar ? <img src={author.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : author.fullName?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{author.fullName}</p>
                      <p className="text-xs text-slate-500">@{author.username}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-bold">{t('search.articles')}</h2>
            <div className="space-y-3">
              {(results.articles || []).map((article: any) => (
                <Link key={article._id} to={`/article/${article.slug}`} className="block rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-base font-bold text-slate-900">{article.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{article.summary}</p>
                </Link>
              ))}
              {(results.articles || []).length === 0 && (results.authors || []).length === 0 && <p className="text-sm text-slate-500">No results</p>}
            </div>
          </section>
        </div>
)}
    </div>
    </div>
  )
}
