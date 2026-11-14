import { Link } from 'react-router-dom'
import PublisherPage, { Section } from '../../components/layout/PublisherPage'
import { useSeo } from '../../utils/useSeo'

export default function AboutPage() {
  useSeo({
    title: 'About the newsroom',
    description: "Who writes for RADAR, how writers are approved and paid, and what we do with machine-written drafts.",
    path: '/about',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'NewsMediaOrganization',
      name: "RADAR",
      alternateName: "Ijwi ry'ukuri",
      url: 'https://ijwi-ry--ukuri.web.app',
      logo: 'https://ijwi-ry--ukuri.web.app/icons/icon-512x512.png',
      description: 'News from Rwanda in English, translated into any language a reader chooses, written by approved writers.',
      areaServed: ['RW', 'world'],
      sameAs: ['https://ijwi-ry--ukuri.web.app'],
    },
  })

  return (
    <PublisherPage
      title="About RADAR"
      intro="An independent Rwandan news site. Stories are written by people whose access was approved by the newsroom, checked before they go out, and open to every reader without a paywall."
    >
      <Section title="What we publish">
        <p>
          We cover Rwanda first: politics, business, technology, sports, entertainment, health, education, campus
          life, jobs and opinions. African and international stories appear when they change something for a reader
          here. Every story lives in one section, so the section pages are the shortest route to what you want.
        </p>
        <p>
          The site is written in English and can be read in any language a reader picks - the globe in the header
          opens the full list, and the news, the section names and the buttons all arrive in the language you chose.
          The translation is automatic, so the English text of a story stays the version the newsroom stands behind.
        </p>
      </Section>

      <Section title="Where the name comes from">
        <p>
          This newsroom launched as <em>Ijwi ry&apos;ukuri</em> - &quot;the voice of truth&quot; - and the work did not
          change when the name did: approved writers, checked reporting, corrections in the open. RADAR describes what
          the newsroom tries to do now that it covers the world as well as Rwanda - keep a sweep going over the places
          a reader cares about and report what the sweep picks up. The stories, accounts, author pages and links that
          existed under the old name still work; nothing was reset.
        </p>
      </Section>

      <Section title="Who writes here">
        <p>
          Anyone can register and read. Writing is not automatic: a reader applies for writer access and the
          newsroom owner decides. An approved writer publishes to their own page, and the owner can take a story
          down again.
        </p>
        <p>
          Writers are paid from what their stories earn in attention: RWF 5,000 for each 1,000 valid views, paid
          once a writer reaches RWF 10,000. A view only counts when a real reader actually opens the story and stays
          with it, so a writer earns from readers, not from refresh bots.
        </p>
      </Section>

      <Section title="What we do with machine-written drafts">
        <p>
          The newsroom has one tool that writes: the owner can ask Gemini, a language model, for a report on a
          topic. The prompt forbids invented quotes, names, statistics and documents. Nothing a machine writes
          reaches a reader on its own - the owner reads the draft, fixes it, chooses the section and decides whether
          to save it or publish it, and every published story that was machine-drafted carries a
          "written with AI" note above the headline.
        </p>
        <p>
          The tool is only reachable from the admin portal, and a writer account cannot use it at all.
        </p>
      </Section>

      <Section title="Where the site runs">
        <p>
          The pages are hosted on Firebase Hosting, the API on Render, and the data - accounts, stories, comments
          and uploaded pictures - in one MongoDB cluster. Readers never pay for it and we do not sell what they do
          here.
          <Link to="/privacy" className="ml-1 font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            See the privacy policy
          </Link>
          .
        </p>
      </Section>

      <Section title="Talk to us">
        <p>
          Corrections, story tips and questions about advertising all go through the{' '}
          <Link to="/contact" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            contact page
          </Link>
          . Signed-in readers can also answer a story in its comments, which is where most of the arguing happens
          and where we see problems fastest.
        </p>
      </Section>
    </PublisherPage>
  )
}
