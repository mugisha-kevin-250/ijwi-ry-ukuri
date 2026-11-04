import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FileText, Eye, Heart, MessageSquare, Trash2, Edit2, Loader2 } from 'lucide-react'
import { writerAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'

export default function WriterArticlesPage() {
  const { t } = useI18n()
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await writerAPI.getMyArticles()
        const data = res.data.data as any
        if (Array.isArray(data)) setArticles(data)
        else if (data?.articles) setArticles(data.articles)
        else setArticles([])
      } catch (e) {
        setArticles([])
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this article?')) return
    setDeletingId(id)
    try {
      await writerAPI.deleteArticle(id)
      setArticles(prev => prev.filter(a => a._id !== id))
    } catch (e) {
      console.error('Delete failed:', e)
    } finally {
      setDeletingId(null)
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
      case 'draft': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
      case 'pending_review': return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
      case 'rejected': return 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
      case 'approved': return 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
      default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-[var(--color-text)]">{t('nav.writer.myArticles')}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{articles.length} articles</p>
        </div>
        <Link to="/writer/articles/new" className="btn-primary">
          <Plus className="h-4 w-4" /> {t('writer.newArticle')}
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl border border-[var(--color-border)]" />)}
        </div>
      ) : articles.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-[var(--color-border)]">
          <FileText className="mx-auto h-12 w-12 text-[var(--color-text-muted)]" />
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t('writer.noArticles')}</p>
          <Link to="/writer/articles/new" className="mt-3 inline-block text-sm font-bold text-[var(--color-brand-text)] hover:text-[var(--color-brand-hover)]">{t('writer.newArticle')}</Link>
        </div>
      ) : (
        <div className="card">
          <div className="divide-y divide-[var(--color-border)]">
            {articles.map((article: any) => (
              <div key={article._id} className="flex items-center gap-4 px-4 py-3">
                {article.featuredImage ? (
                  <img src={article.featuredImage} alt="" className="h-14 w-20 rounded object-cover" />
                ) : (
                  <div className="h-14 w-20 rounded bg-[var(--color-brand-light)] flex items-center justify-center">
                    <FileText className="h-6 w-6 text-[var(--color-brand-text)]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--color-text)] truncate">{article.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-text-muted)]">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${statusColor(article.status)}`}>{article.status}</span>
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{article.views || 0}</span>
                    <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{article.likes || 0}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{article.commentsCount || 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link to={`/writer/articles/${article._id}/edit`} className="rounded-lg p-2 text-[var(--color-brand-text)] hover:bg-[var(--color-brand-light)]">
                    <Edit2 className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => handleDelete(article._id)}
                    disabled={deletingId === article._id}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                  >
                    {deletingId === article._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}