import { Outlet } from 'react-router-dom'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import BottomNav from '../components/layout/BottomNav'
import AnnouncerBar from '../components/audio/AnnouncerBar'
import LanguageAlert from '../components/layout/LanguageAlert'
import SignInPrompt from '../components/auth/SignInPrompt'
import ConsentBanner from '../components/consent/ConsentBanner'
import AdSlot from '../components/ads/AdSlot'
import { useI18n } from '../context/I18nContext'

export default function PublicLayout() {
  // Changing the language changes what every story request returns, so the page
  // under the header is rebuilt for it. The header, the footer and the audio bar
  // deliberately sit outside and keep their state - a bulletin does not restart
  // just because a reader switched to Luganda.
  const { languageVersion } = useI18n()

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950 pb-16 md:pb-0">
      <Header variant="public" />
      {/* Desktop masthead: a 36px chrome bar and a 56px name line. Phone: a 64px
          name line and the 44px section strip that runs under it. */}
      <main className="flex-1 pt-[110px] md:pt-[92px]">
        {/* The banner a reader sees first, straight under the masthead. It is
            absent until AdSense is switched on - never an empty grey box. */}
        <AdSlot name="leaderboard" className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8" />
        <Outlet key={languageVersion} />
      </main>
      <Footer />
      <BottomNav />
      {/* Spoken news belongs to the site, not to one page: a bulletin started
          here keeps playing while the reader moves around, and this is the bar
          that lets them stop it. */}
      <AnnouncerBar />
      <SignInPrompt />
      <ConsentBanner />
      <LanguageAlert />
    </div>
  )
}