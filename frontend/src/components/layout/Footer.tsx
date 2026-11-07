import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Mail, PenTool, Rss, Search, Users } from 'lucide-react'
import type { Article, Category } from '../../types'
import { publicAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'

// The footer is part of the story feed, not a static list: which categories and
// which headlines it offers changes as the newsroom publishes.
export default function Footer() {
  const { t } = useI18n()
  const [categories, setCategories] = useState<Category[]>([])
  const [stories, setStories] = useState<Article[]>([])

  useEffect(() => {
    let active = true
    void Promise.allSettled([publicAPI.getCategories(), publicAPI.getArticles({ page: 1, limit: 5, sort: 'latest' })]).then(
      ([categoriesResult, storiesResult]) => {
        if (!active) return
        if (categoriesResult.status === 'fulfilled') {
          const payload = categoriesResult.value.data.data as any
          const list = Array.isArray(payload) ? payload : payload?.categories
          if (Array.isArray(list)) setCategories(list)
        }
        if (storiesResult.status === 'fulfilled') {
          const payload = storiesResult.value.data.data as any
          const list = Array.isArray(payload) ? payload : payload?.articles
          if (Array.isArray(list)) setStories(list)
        }
      },
    )
    return () => {
      active = false
    }
  }, [])

  const exploreLinks = [
    { label: t('footer.latest'), href: '/articles?sort=latest' },
    { label: t('home.trending'), href: '/articles?sort=trending' },
    { label: t('home.popular'), href: '/articles?sort=popular' },
    { label: t('footer.categories'), href: '/categories' },
    { label: t('footer.search'), href: '/search' },
  ]

  const accountLinks = [
    { label: t('footer.signIn'), href: '/login' },
    { label: t('footer.signUp'), href: '/register' },
    { label: t('home.writersDashboard'), href: '/writer/dashboard' },
    { label: t('footer.about'), href: '/about' },
  ]

  return (
    <footer className="mt-12 bg-[#062b52] text-blue-100">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.3fr_1fr_1fr_1.1fr] lg:px-8">
        <div>
          <Link to="/" className="text-xl font-black tracking-tight text-white">
            Ijwi ry<span className="text-cyan-300">'ukuri</span>
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-relaxed">{t('footer.tagline')}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-400"
            >
              <PenTool className="h-4 w-4" aria-hidden="true" />
              {t('footer.write')}
            </Link>
            <Link
              to="/articles"
              className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/10"
            >
              <Rss className="h-4 w-4" aria-hidden="true" />
              {t('home.browse')}
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">{t('footer.explore')}</h2>
          <ul className="mt-3 space-y-2">
            {exploreLinks.map((link) => (
              <li key={link.href}>
                <Link to={link.href} className="inline-flex items-center gap-1 text-sm transition hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <h2 className="mt-6 text-sm font-bold uppercase tracking-wider text-white">{t('home.topics')}</h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {(categories.length ? categories.slice(0, 8) : []).map((category) => (
              <li key={category._id}>
                <Link to={`/category/${category.slug}`} className="text-sm transition hover:text-white">
                  {category.name}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/categories" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                {t('category.other')} +
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">{t('footer.latest')}</h2>
          <ul className="mt-3 space-y-3">
            {stories.map((story) => (
              <li key={story._id}>
                <Link to={`/article/${story.slug}`} className="group flex items-start gap-2 text-sm leading-snug transition hover:text-white">
                  <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
                  <span className="line-clamp-2">{story.title}</span>
                </Link>
              </li>
            ))}
            {!stories.length && <li className="text-sm">{t('home.emptyLatest')}</li>}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">{t('nav.articles')}</h2>
          <ul className="mt-3 space-y-2">
            {accountLinks.map((link) => (
              <li key={link.href}>
                <Link to={link.href} className="text-sm transition hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2 text-sm">
            <a href="mailto:inkuru@ijwi-ry--ukuri.web.app" className="inline-flex items-center gap-2 transition hover:text-white">
              <Mail className="h-4 w-4" aria-hidden="true" />
              inkuru@ijwi-ry--ukuri.web.app
            </a>
            <Link to="/articles" className="inline-flex items-center gap-2 transition hover:text-white">
              <Search className="h-4 w-4" aria-hidden="true" />
              {t('nav.search')}
            </Link>
            <Link to="/register" className="inline-flex items-center gap-2 transition hover:text-white">
              <Users className="h-4 w-4" aria-hidden="true" />
              {t('home.writersTitle')}
            </Link>
          </div>
        </div>
      </div>

      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Ijwi ry'ukuri. {t('footer.rights')}</p>
          <div className="flex flex-wrap gap-4">
            <Link to="/about" className="hover:text-white">{t('footer.about')}</Link>
            <Link to="/categories" className="hover:text-white">{t('footer.categories')}</Link>
            <Link to="/articles" className="hover:text-white">{t('footer.news')}</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
