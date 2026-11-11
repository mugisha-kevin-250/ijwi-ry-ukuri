import { Link } from 'react-router-dom'
import PublisherPage, { Section } from '../../components/layout/PublisherPage'
import { useSeo } from '../../utils/useSeo'
import { contactEmail, publisherPagesUpdated } from '../../utils/siteConfig'

export default function TermsPage() {
  useSeo({
    title: 'Terms of use',
    description: "What you may do on Ijwi ry'ukuri, what you own when you write or comment here, and when an account gets stopped.",
    path: '/terms',
  })

  return (
    <PublisherPage
      title="Terms of use"
      intro="Reading is free and needs no promise from you. Writing, commenting and broadcasting come with the few rules below, which exist to keep the site usable for everyone else."
      updated={publisherPagesUpdated}
    >
      <Section title="Using the site">
        <p>
          You may read, share and quote our stories, print them for your own use, and link to them from anywhere.
          You may not scrape the site to republish it whole, present someone else's report here as your own, or use
          the site's own numbers (views, likes) as if they measured something else.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          One account per person, with your real name where you publish. You are responsible for what happens under
          your sign-in, so keep your password to yourself. Tell us if you think someone else has it.
        </p>
      </Section>

      <Section title="What you write">
        <p>
          A story you publish stays yours. By posting it here you give us permission to show it, store it, translate
          it for readers, syndicate it inside the site (section pages, related lists, search, feeds) and keep copies
          after you edit it, so a record of what was actually published survives.
        </p>
        <p>
          You confirm that you wrote it or have the right to publish it, that pictures you attach are yours or free
          to use, and that it does not defame, threaten or harass a real person or incite violence.
        </p>
        <p>
          Comments carry the same promise in shorter form: your words stay yours, we may show and moderate them, and
          abusive comments come down.
        </p>
      </Section>

      <Section title="Writing access and pay">
        <p>
          Writer access is granted by the newsroom and can be taken back. Where a writer earns from valid views, the
          rate is the one published in the writer's own earnings page; the site decides what counts as a valid view
          and removes records that look manufactured. Payouts are made in Rwandan francs once the minimum is reached.
        </p>
      </Section>

      <Section title="Machine-written text">
        <p>
          Drafts produced with an AI tool inside the admin portal may be published here after a human has read them,
          and such a story says so above its headline. That note is a description of how it was made, not a licence
          to treat it as less checked than the rest.
        </p>
      </Section>

      <Section title="Stopping an account">
        <p>
          A story that is false, harmful or stolen can be taken down without notice to the writer, and an account used
          to abuse the site, its readers or its numbers can be suspended. Where the choice is ours rather than the
          law's, we tell you why when you ask.
        </p>
      </Section>

      <Section title="No warranties">
        <p>
          Reports here are published in good faith and corrected when wrong. We do not promise the site is always up,
          that a story is complete, or that anything on it is advice you should act on. Liability for using the site
          is limited to what Rwandan law allows.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          {contactEmail ? (
            <>
              These terms, and anything inside them, can be discussed at{' '}
              <a href={`mailto:${contactEmail}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                {contactEmail}
              </a>
              . See also the{' '}
              <Link to="/privacy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                privacy policy
              </Link>{' '}
              and the{' '}
              <Link to="/editorial-policy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                editorial policy
              </Link>
              .
            </>
          ) : (
            <>
              Raise anything about these terms in the comments of a recent story and the owner will answer. See also
              the{' '}
              <Link to="/privacy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                privacy policy
              </Link>{' '}
              and the{' '}
              <Link to="/editorial-policy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                editorial policy
              </Link>
              .
            </>
          )}
        </p>
      </Section>
    </PublisherPage>
  )
}
