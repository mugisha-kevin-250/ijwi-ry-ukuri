import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'
import { analyticsEnabled, trackPageView } from '../../utils/analytics'
import { adsEnabled } from '../../utils/adsense'
import { consentIsSet, onConsentChange, setConsent } from '../../utils/consent'

/**
 * Asked once, and only when there is something to ask about. With no analytics
 * id and no ad unit in the build, nothing on this site watches a reader, so a
 * banner would be theatre - and a question that is always answered "nothing
 * happens" teaches readers to click without reading.
 */
export default function ConsentBanner() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Listening, not just checking on mount: the cookie page can hand the answer
    // back, and the question has to reappear on the page the reader is standing on.
    const sync = () => setOpen((analyticsEnabled || adsEnabled) && !consentIsSet())
    sync()
    return onConsentChange(sync)
  }, [])

  if (!open) return null

  const choose = (choice: 'accepted' | 'declined') => {
    setConsent(choice)
    setOpen(false)
    // Accepting mid-visit should still count the page the reader is on.
    if (choice === 'accepted') trackPageView(`${window.location.pathname}${window.location.search}`)
  }

  return (
    <div role="region" aria-label={t('consent.title')} className="fixed inset-x-0 bottom-16 z-50 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6 md:bottom-0">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-900">{t('consent.title')}</p>
          <p className="text-sm leading-relaxed text-slate-600">
            {t('consent.body')}{' '}
            <Link to="/cookies" className="font-medium text-brand-700 underline-offset-4 hover:underline">
              {t('publisher.cookies')}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => choose('accepted')} className="rounded-full bg-brand-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-800">
            {t('consent.accept')}
          </button>
          <button type="button" onClick={() => choose('declined')} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
            {t('consent.decline')}
          </button>
        </div>
      </div>
    </div>
  )
}
