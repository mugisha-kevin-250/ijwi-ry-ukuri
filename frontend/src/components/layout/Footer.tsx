import { Link } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'

export default function Footer() {
  const { t } = useI18n()

  const footerLinks = [
    {
      title: t('footer.explore'),
      links: [
        { label: t('footer.latest'), href: '/articles?sort=latest' },
        { label: t('footer.categories'), href: '/categories' },
        { label: t('footer.search'), href: '/search' },
      ],
    },
    {
      title: "Ijwi ry'ukuri",
      links: [
        { label: t('footer.signIn'), href: '/login' },
        { label: t('footer.signUp'), href: '/register' },
      ],
    },
  ]

  return (
    <footer className="border-t border-slate-200 bg-[#f5f7fa]">
      <div className="mx-auto grid max-w-7xl gap-9 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <Link to="/" className="text-xl font-black tracking-tight text-[#062b52]">Ijwi<span className="text-blue-600"> ry'ukuri</span></Link>
          <p className="mt-3 max-w-sm text-sm leading-relaxed font-medium text-slate-700">
            {t('footer.tagline')}
          </p>
        </div>
        {footerLinks.map((section) => (
          <div key={section.title}>
            <h2 className="text-sm font-bold text-slate-900">{section.title}</h2>
            <ul className="mt-3 space-y-2">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className="text-sm text-slate-500 transition hover:text-blue-700">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Ijwi ry'ukuri. {t('footer.rights')}
      </div>
    </footer>
  )
}
