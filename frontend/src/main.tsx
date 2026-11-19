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
import ErrorBoundary from './components/common/ErrorBoundary'
import { registerServiceWorker } from './pwa/serviceWorker'

import './index.css'

registerServiceWorker()

// The reader's language used to be served by Google's own page-translation
// widget, which rewrote the DOM in the browser and could only ever work on what
// was already on screen. It is gone: a chosen language is now sent with every
// story request and the server answers in it (see I18nContext and
// services/translateService on the backend), so nothing third-party has to run
// over the page.

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          {/* Last line of defence. Everything below this point - the router,
              the layout, the page - is allowed to fall over without taking
              the reader's screen with it, and what they get instead is a
              sentence about what happened. It sits inside the language
              provider on purpose: the apology has to be in the reader's own
              language, and that is the one thing it must never lose. */}
          <ErrorBoundary mode="reload">
            <RouterProvider router={router} />
            <AppSplash />
            <InstallPromptBanner />
          </ErrorBoundary>
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