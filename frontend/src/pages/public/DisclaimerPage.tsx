import { Link } from 'react-router-dom'
import PublisherPage, { Section } from '../../components/layout/PublisherPage'
import { useSeo } from '../../utils/useSeo'
import { contactEmail, publisherPagesUpdated } from '../../utils/siteConfig'

export default function DisclaimerPage() {
  useSeo({
    title: 'Disclaimer',
    description: "The limits of what Ijwi ry'ukuri's stories, numbers and translations can be relied on for, stated plainly.",
    path: '/disclaimer',
  })

  return (
    <PublisherPage
      title="Disclaimer"
      intro="We report news and we correct it when it is wrong. This page says where our responsibility stops, so nobody is surprised later. It is written in ordinary words on purpose."
      updated={publisherPagesUpdated}
    >
      <Section title="News, not advice">
        <p>
          Stories here are reporting and opinion about public events. Nothing on this site is financial, legal,
          medical, or investment advice, and a story about a medicine, a law, a match result or a price is not a
          recommendation to act on it. Before you decide anything that matters to your health, money or legal
          position, ask a professional who can look at your particular case.
        </p>
      </Section>

      <Section title="Accuracy">
        <p>
          We publish what our writers believe to be true at the time of publishing, and we name the source where a
          claim depends on one. News moves fast, and a story written in the first hour of an event can be overtaken by
          it. A report that turns out to be wrong is fixed on{' '}
          <Link to="/corrections" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            the corrections page
          </Link>{' '}
          rather than quietly deleted. We do not promise that any story is complete or final.
        </p>
      </Section>

      <Section title="Machine-written and machine-translated text">
        <p>
          Some drafts are produced with an AI writing tool inside our admin portal. Every one of them is read by a
          person before it goes out, and such a story says so above its headline. A machine can produce a sentence that
          reads well and is still wrong; that risk is ours to catch, and if we miss it, the correction process applies
          to it exactly as it does to a human mistake.
        </p>
        <p>
          Parts of the site are shown in Kinyarwanda, French or Swahili through an automatic translator. The English
          text of a story is the version we stand behind. A translation can bend a name, a figure or a nuance, so where
          a detail matters, read it in the original language.
        </p>
      </Section>

      <Section title="Reader comments">
        <p>
          Comments, questions and replies are written by the people who posted them and are their views, not the
          newsroom&rsquo;s. We moderate them and take down abusive or false ones, but a comment is not our reporting and
          should not be quoted as such.
        </p>
      </Section>

      <Section title="Other websites">
        <p>
          A story may link to a government page, another newsroom, a video or a document. Those pages belong to
          whoever published them. We do not control them, we do not check them after linking, and a link is not an
          endorsement of everything on the other side.
        </p>
      </Section>

      <Section title="Views, likes and earnings figures">
        <p>
          The numbers a writer sees next to a story are counts made by this site, from visits we judged to come from a
          real reader. They are not an audited measurement, they do not include the same article shared and read on
          Facebook or WhatsApp, and no advertiser or third party has verified them. Treat them as a fair indication of
          reach, not as a certificate.
        </p>
      </Section>

      <Section title="Responsibility">
        <p>
          The site is offered as it is. Where the law lets us limit our responsibility, we limit it: we are not liable
          for losses that come from relying on something published here, or from the site being unavailable. That does
          not and cannot remove responsibility for our own reporting, for which the{' '}
          <Link to="/editorial-policy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            editorial policy
          </Link>{' '}
          is what you can hold us to.
        </p>
      </Section>

      <Section title="Tell us">
        <p>
          {contactEmail ? (
            <>
              A mistake, a broken link, a translation that changed the meaning or a story you believe is unfair: write
              to{' '}
              <a href={`mailto:${contactEmail}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                {contactEmail}
              </a>
              . See also the{' '}
              <Link to="/privacy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                privacy policy
              </Link>
              , the{' '}
              <Link to="/cookies" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                cookie policy
              </Link>{' '}
              and the{' '}
              <Link to="/terms" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                terms of use
              </Link>
              .
            </>
          ) : (
            <>
              A mistake, a broken link, a translation that changed the meaning or a story you believe is unfair: say so
              in the comments of the story and the newsroom will see it. See also the{' '}
              <Link to="/privacy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                privacy policy
              </Link>
              , the{' '}
              <Link to="/cookies" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                cookie policy
              </Link>{' '}
              and the{' '}
              <Link to="/terms" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                terms of use
              </Link>
              .
            </>
          )}
        </p>
      </Section>
    </PublisherPage>
  )
}
