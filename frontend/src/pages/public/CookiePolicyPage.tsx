import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PublisherPage, { Section } from '../../components/layout/PublisherPage'
import { useSeo } from '../../utils/useSeo'
import { analyticsEnabled } from '../../utils/analytics'
import { adsEnabled } from '../../utils/adsense'
import { consentChoice, forgetConsentChoice, onConsentChange } from '../../utils/consent'
import { publisherPagesUpdated } from '../../utils/siteConfig'

/** What the site keeps in the reader's own browser, in their words, with the
 *  real storage keys so the claim can be checked in devtools. */
const BROWSER_STORAGE = [
  { key: 'token, user', what: 'Your sign-in and the profile the site shows you. Signing out removes both.' },
  { key: 'lang, language-chosen', what: 'The language you picked, so the next page opens in it instead of guessing again.' },
  { key: 'theme', what: 'Whether you asked for the dark version of the site.' },
  { key: 'anon_session_id', what: 'A random string with no relation to you, so one person cannot be counted as a hundred readers. Writers are paid per valid view, and this is what makes the count honest.' },
  { key: 'ijwiryukuri-consent', what: 'Your answer to the cookie question, if you were asked one. See "Change your choice" below.' },
  { key: 'ijwiryukuri-newsletter', what: 'The email address you typed into the news-alert box, kept here only until it is sent.' },
  { key: 'pwa-install-dismissed-at', what: 'The moment you closed the "add to home screen" invitation, so it leaves you alone for a while.' },
]

export default function CookiePolicyPage() {
  useSeo({
    title: 'Cookie policy',
    description: "Ijwi ry'ukuri sets no cookies of its own. What it does keep in your browser, who else sets one, and how to change your mind.",
    path: '/cookies',
  })

  const [choice, setChoice] = useState(consentChoice())
  const [cleared, setCleared] = useState(false)

  // The question can be answered from the banner while this page is open, so the
  // words on it follow the answer instead of freezing at page load.
  useEffect(() => onConsentChange(() => setChoice(consentChoice())), [])

  const anythingToAsk = analyticsEnabled || adsEnabled

  const changeMind = () => {
    forgetConsentChoice()
    setCleared(true)
  }

  return (
    <PublisherPage
      title="Cookie policy"
      intro="This site does not put a cookie in your browser to remember you. It keeps a few small things in your browser's own storage, which behaves like a cookie but is easier for you to look at and to erase. The list below is the whole list."
      updated={publisherPagesUpdated}
    >
      <Section title="What is a cookie here">
        <p>
          A cookie is a small note a website asks your browser to hold on to and send back on the next visit. Sites
          use them to keep you signed in, to remember a setting, and to follow you around other websites to build a
          profile. This site uses the first two purposes and never the third. Where it needs to remember something, it
          uses your browser's local storage instead, which stays inside your device and is never sent to our server
          with each request.
        </p>
      </Section>

      <Section title="What this site keeps in your browser">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[0.9375rem]">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-700">
                <th className="py-2 pr-4 font-semibold text-gray-900 dark:text-white">Name</th>
                <th className="py-2 font-semibold text-gray-900 dark:text-white">Why it is there</th>
              </tr>
            </thead>
            <tbody>
              {BROWSER_STORAGE.map((row) => (
                <tr key={row.key} className="border-b border-gray-200 align-top dark:border-gray-800">
                  <td className="py-2.5 pr-4 font-mono text-xs text-gray-900 dark:text-gray-200">{row.key}</td>
                  <td className="py-2.5 text-gray-700 dark:text-gray-300">{row.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nothing here is a tracking cookie and nothing here is shared with an advertiser. If you install the site as an
          app, a copy of the pages is also cached on your device so it opens with a poor connection; clearing the
          cached files only makes the next load fetch them again.
        </p>
      </Section>

      <Section title="Cookies other companies set">
        <p>
          Three parts of the site are run by Google on our behalf, and a service that runs inside your browser usually
          carries its own cookies with it. These are the only ones that can appear:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong className="font-semibold text-gray-900 dark:text-white">Google sign-in.</strong> Only when you
            press the Google button on the sign-in page. It lets Google know you used your account there.
          </li>
          <li>
            <strong className="font-semibold text-gray-900 dark:text-white">Page translation.</strong> The automatic
            translator is Google's, and opening it can set a preference cookie so a later page on any site arrives
            already in your language.
          </li>
          <li>
            <strong className="font-semibold text-gray-900 dark:text-white">
              {analyticsEnabled || adsEnabled ? 'Analytics and advertising.' : 'Analytics and advertising (not running).'}
            </strong>{' '}
            {anythingToAsk ? (
              <>
                Google Analytics and Google AdSense are switched on for this site, so they can set their own cookies and
                read device information. They load only after you answer the question at the bottom of the page, and
                &ldquo;decline&rdquo; means their script is never fetched at all.
              </>
            ) : (
              <>
                Neither is enabled yet, and both sit behind the same yes-or-no question if the owner turns them on
                later. Until then, no analytics or advertising script is fetched, and a visitor to this site sets
                nothing at Google because of us.
              </>
            )}
          </li>
          <li>
            <strong className="font-semibold text-gray-900 dark:text-white">News alerts.</strong> If you agree to
            browser notifications, Google/Firebase push handles delivery. It is tied to the device address your browser
            hands over, and deleting it stops the alerts.
          </li>
        </ul>
      </Section>

      <Section title="Change your choice">
        <p>
          {anythingToAsk ? (
            <>
              {choice === 'accepted'
                ? 'You are currently allowing the measurement and advertising services.'
                : choice === 'declined'
                  ? 'You are currently refusing the measurement and advertising services, and nothing is loaded from them.'
                  : 'You have not answered the question yet, so the safe reading applies: nothing is loaded from them.'}
            </>
          ) : (
            <>
              {choice === 'accepted'
                ? 'You answered the question earlier, when the site had something to ask about.'
                : 'There is nothing to consent to right now: this build of the site loads neither analytics nor advertising.'}
            </>
          )}
        </p>
        {anythingToAsk && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={changeMind}
              className="rounded-full bg-brand-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-800"
            >
              Reset my answer and ask me again
            </button>
            {cleared && !choice && (
              <p role="status" className="text-sm font-medium text-brand-700 dark:text-brand-300">
                Done - the question is back at the bottom of the page.
              </p>
            )}
          </div>
        )}
        <p>
          You can also clear it at the source: every browser can delete one site&rsquo;s stored data, which removes
          these entries along with your sign-in. In Chrome and Firefox that is the lock icon in the address bar, then
          site settings or cookies.
        </p>
      </Section>

      <Section title="Do Not Track and similar signals">
        <p>
          A reader who told their browser not to be tracked is believed: neither analytics nor advertising loads
          without an explicit yes inside this site, so there is no case where a signal has to be overridden.
        </p>
      </Section>

      <Section title="The rest of the promises">
        <p>
          This page covers storage in your browser. What the newsroom itself holds about you - your account, your
          words, your reading records - is on the{' '}
          <Link to="/privacy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            privacy policy
          </Link>
          , and the terms for using the site are in{' '}
          <Link to="/terms" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            the terms of use
          </Link>
          .
        </p>
      </Section>
    </PublisherPage>
  )
}
