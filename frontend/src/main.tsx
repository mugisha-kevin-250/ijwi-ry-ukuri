import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

import { AuthProvider } from './context/AuthContext'
import { I18nProvider } from './context/I18nContext'
import { ThemeProvider } from './context/ThemeContext'
import { router } from './router'
import InstallPromptBanner from './components/pwa/InstallPromptBanner'
import AppSplash from './components/common/AppSplash'
import { registerServiceWorker } from './pwa/serviceWorker'

import './index.css'

registerServiceWorker()

declare global {
  interface Window {
    googleTranslateElementInit: () => void
  }
}

// The stories are written in Kinyarwanda, so that is the language Google has to
// translate from; declaring English made it re-translate our own Kinyarwanda
// labels into machine Kinyarwanda. The widget itself stays off-screen because
// the language menu is what switches it.
let translatorStarted = false
window.googleTranslateElementInit = () => {
  if (translatorStarted || !window.google || !window.google.translate || !window.google.translate.TranslateElement) return
  translatorStarted = true
  new window.google.translate.TranslateElement({
    pageLanguage: 'rw',
    includedLanguages: 'rw,en,fr,sw',
    layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
  }, 'google_translate_element')
}
// element.js can finish loading before this module runs, and then its callback
// found nothing to call, so start the translator here as well.
window.googleTranslateElementInit()

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          <AppSplash />
          <InstallPromptBanner />
          <ToastContainer
            position="bottom-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            pauseOnHover
            theme="light"
            className="notranslate"
          />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
)