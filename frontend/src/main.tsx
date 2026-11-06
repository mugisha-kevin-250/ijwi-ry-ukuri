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

window.googleTranslateElementInit = () => {
  new window.google.translate.TranslateElement({
    pageLanguage: 'en',
    includedLanguages: 'en,rw,fr,sw,es,pt',
    layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
    autoDisplay: false
  }, 'google_translate_element')
}

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
          />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
)