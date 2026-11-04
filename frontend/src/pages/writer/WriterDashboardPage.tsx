import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FileText, Eye, Heart, Users } from 'lucide-react'
import { writerAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'

export default function WriterDashboardPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [articles, setArticles] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [articlesRes, statsRes] = await Promise.all([
          writerAPI.getMyArticles(),
          writerAPI.getDashboard(),
        ])
        const articlesData = articlesRes.data.data as any
        if (Array.isArray(articlesData)) setArticles(articlesData)
        else if (articlesData?.articles) setArticles(articlesData.articles)
        else setArticles([])
        
        setStats(statsRes.data.data)
      } catch (e) {
        setArticles([])
        setStats(null)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-[var(--color-text)]">{t('nav.writer.dashboard')}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{user?.fullName}</p>
        </div>
        <Link to="/writer/articles/new" className="btn-primary">
          <Plus className="h-4 w-4" /> {t('writer.newArticle')}
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><FileText className="h-5 w-5" />{t('writer.totalArticles')}</div>
          <p className="mt-2 text-3xl font-bold text-[var(--color-text)]">{articles.length}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><Eye className="h-5 w-5" />{t('writer.views')}</div>
          <p className="mt-2 text-3xl font-bold text-[var(--color-text)]">{articles.reduce((s:any,a:any)=>s+(a.views||0),0)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><Heart className="h-5 w-5" />{t('writer.likes')}</div>
          <p className="mt-2 text-3xl font-bold text-[var(--color-text)]">{articles.reduce((s:any,a:any)=>s+(a.likes||0),0)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><Users className="h-5 w-5" />Followers</div>
          <p className="mt-2 text-3xl font-bold text-[var(--color-text)]">{stats?.followersCount || 0}</p>
        </div>
      </div>
      <div className="mt-6 card">
        <div className="border-b border-[var(--color-border)] px-4 py-3 font-bold text-[var(--color-text)]">{t('nav.writer.myArticles')}</div>
        <div className="divide-y divide-[var(--color-border)]">
          {articles.map((article:any) => (
            <div key={article._id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-semibold text-[var(--color-text)]">{article.title}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{article.status}</p>
              </div>
              <Link to={`/writer/articles/${article._id}/edit`} className="text-sm font-semibold text-[var(--color-brand-text)] hover:text-[var(--color-brand-hover)]">{t('writer.editArticle')}</Link>
            </div>
          ))}
          {!loading && articles.length === 0 && <p className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">{t('writer.noArticles')}</p>}
        </div>
      </div>
    </div>
  )
}
