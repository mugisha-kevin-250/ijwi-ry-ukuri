import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import PublisherPage, { Section } from '../../components/layout/PublisherPage'
import { useSeo } from '../../utils/useSeo'
import { contactEmail } from '../../utils/siteConfig'

export default function AdvertisingPage() {
  useSeo({
    title: 'Advertising on RADAR',
    description:"Buy a space on RADAR: which five places an advertisement can run, what we accept, and how a campaign gets published.",
    path: '/advertising',
  })

  return (
    <PublisherPage
      title="Advertising"
      intro="Two things can occupy an advertising space here: a campaign booked with the newsroom, and Google's ad auction where it has a buyer for the same space. Both are labelled as advertising, and neither one changes what gets published as news."
    >
      <Section title="Buy a space directly">
        <p>
          The newsroom sells its own spaces. You tell us the name of your business, what you are offering, the web
          address a reader should land on and how long you want to run; we write the creative, show it to you, and
          publish it once you agree. A campaign you book here appears in the places below, with your own colours and
          your own wording, and it comes off the pages by itself when the window you booked ends.
        </p>
        <p>
          What we do not do is promise a number of readers. The honest figures we can give an advertiser are how long
          the campaign ran and how many taps it received, both counted from what actually happened on the page.
        </p>
      </Section>

      <Section title="Where ads appear">
        <p>There are five spaces on the site, and an advertiser can buy any of them or all of them.</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <span className="font-semibold">Above the section links</span> - one line at the top of every public page,
            seen by everyone who opens the site.
          </li>
          <li>
            <span className="font-semibold">In a list of stories</span> - below the results on a section page, above the
            page buttons.
          </li>
          <li>
            <span className="font-semibold">Inside a story</span> - between the last paragraph and the comments, never
            between two sentences of the report itself.
          </li>
          <li>
            <span className="font-semibold">Beside a story</span> - the right-hand column on a large screen, where a
            phone puts it under the article instead.
          </li>
          <li>
            <span className="font-semibold">On the News page rail</span> - the column beside the top stories.
          </li>
        </ul>
        <p>
          Every one of them keeps its own height whether or not someone has bought it, so a story never jumps under a
          reader's finger when an ad arrives. Each is labelled advertising, and the newsroom does not place an ad where a
          reader would read it as part of a report.
        </p>
      </Section>

      <Section title="The Google campaigns">
        <p>
          The same spaces are also offered to Google AdSense against the site's{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[0.95em] dark:bg-gray-800">ads.txt</code> entry. Where
          Google has a buyer and the reader has agreed to personalised ads, that unit fills the space; where Google has
          nothing to show, the space goes to whoever booked it here. An advertiser who wants a specific place on a
          specific page needs the newsroom, not the auction - Google cannot promise either.
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
        <p>
          A creative is not published on the word of the model that drafted it. Somebody at the desk reads every
          headline, every claim and every destination link before it reaches a reader, and an advertisement that turns
          out to have said something untrue is taken down before it is discussed.
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
        <p>
          Say the name of the business, what you are offering, the address the ad should open and the dates you want to
          run. Pick &ldquo;Advertising or partnership&rdquo; on the{' '}
          <Link to="/contact" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            contact page
          </Link>{' '}
          and it reaches the same desk that answers corrections.
        </p>
        {contactEmail ? (
          <p className="flex flex-wrap items-center gap-2">
            <Mail className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <a
              href={`mailto:${contactEmail}`}
              className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
            >
              {contactEmail}
            </a>
            <span className="text-gray-500 dark:text-gray-400">- if that is easier than the form.</span>
          </p>
        ) : (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[1rem] text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            The site has no published mailbox yet, which is why the form exists: it reaches the same people without
            needing an address, and the answer comes back to you by email.
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
