import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import PublisherPage, { Section } from '../../components/layout/PublisherPage'
import { useSeo } from '../../utils/useSeo'
import { contactEmail } from '../../utils/siteConfig'

export default function AdvertisingPage() {
  useSeo({
    title: 'Advertising',
    description: "How advertising works on RADAR: where ads appear, what we accept and how to buy a campaign.",
    path: '/advertising',
  })

  return (
    <PublisherPage
      title="Advertising"
      intro="Advertising on this site is sold by Google, not by the newsroom. Here is what that means for an advertiser, for a reader and for the stories in between."
    >
      <Section title="How campaigns are bought">
        <p>
          Ads are served through Google AdSense against the site's{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[0.95em] dark:bg-gray-800">ads.txt</code> entry. An
          advertiser reaches Rwandan readers through Google's own auction - there is no rate card to negotiate with us,
          no invoice to settle here, and no placement we can promise to a specific company.
        </p>
      </Section>

      <Section title="Where ads appear">
        <ul className="list-disc space-y-2 pl-6">
          <li>Beside a story, in the column that holds related reports.</li>
          <li>Once below the body of a story, after the last paragraph - never inside it.</li>
          <li>Below a list of stories, after the last result and above the page buttons.</li>
        </ul>
        <p>
          Every ad slot on the page is labelled as advertising, and the newsroom does not place an ad where a reader
          would read it as part of a report.
        </p>
      </Section>

      <Section title="Who reads this site">
        <p>
          English is what a first-time reader sees, and the whole site - the news, the sections and the buttons -
          switches to any language they choose with one tap: on phones, through a site they can install as an app,
          and through live broadcasts. Stories are grouped by
          section, and a reader can follow the writer they trust. Traffic numbers are measured with Google Analytics
          once it is configured; the newsroom does not publish estimated or invented audience figures.
        </p>
      </Section>

      <Section title="What we do not accept">
        <p>
          A story is never written, changed or moved up the page because someone advertised. Sponsored articles are not
          sold. Content Google itself rejects - misleading claims, gambling or health schemes aimed at a vulnerable
          reader - is not something we host alongside our reporting. An advertiser cannot see who read their ad, and the
          site does not sell, hand over or expose reader identities, email addresses or reading histories.
        </p>
      </Section>

      <Section title="Money inside the newsroom">
        <p>
          Writers are paid from the site's own revenue for the valid attention their published stories receive, which is
          recorded per reader and per session. An advertiser's budget does not change what a writer is owed and does not
          change what gets approved. The full standard is on the{' '}
          <Link to="/editorial-policy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            editorial policy
          </Link>{' '}
          and the{' '}
          <Link to="/about" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            about page
          </Link>
          .
        </p>
      </Section>

      <Section title="Speak to the newsroom">
        {contactEmail ? (
          <p className="flex flex-wrap items-center gap-2">
            <Mail className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <a
              href={`mailto:${contactEmail}`}
              className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
            >
              {contactEmail}
            </a>
            <span className="text-gray-500 dark:text-gray-400">- for a partnership that is not a Google campaign.</span>
          </p>
        ) : (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[1rem] text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            There is no published newsroom address yet. Advertising runs automatically through Google, so nothing is
            blocked while one is being set up; for anything outside that, use the{' '}
            <Link to="/contact" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
              contact page
            </Link>
            .
          </p>
        )}
        <p>
          Readers who want to know what is collected while an ad is on the page should read the{' '}
          <Link to="/privacy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            privacy policy
          </Link>
          .
        </p>
      </Section>
    </PublisherPage>
  )
}
