import { Outlet } from 'react-router-dom'
import { Suspense } from 'react'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import BottomNav from '../components/layout/BottomNav'
import AnnouncerBar from '../components/audio/AnnouncerBar'
import LanguageAlert from '../components/layout/LanguageAlert'
import SignInPrompt from '../components/auth/SignInPrompt'
import ConsentBanner from '../components/consent/ConsentBanner'
import RouteFallback from '../components/common/RouteFallback'
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
      {/*
        The header is fixed, and it is as tall as the advert above the section
        links makes it, so the offset comes from the measurement the Header
        publishes rather than a number written down here.
      */}
      <main className="flex-1 pt-[var(--header-h)]">
        {/* A page arrives in its own piece of JavaScript, and only when a reader
            asks for it. The boundary sits here, under the header and above the
            footer, so the chrome - and a bulletin already being spoken - is
            untouched while that piece is downloaded. */}
        <Suspense fallback={<RouteFallback />}>
          <Outlet key={languageVersion} />
        </Suspense>
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