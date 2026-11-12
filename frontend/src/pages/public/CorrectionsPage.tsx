import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import PublisherPage, { Section } from '../../components/layout/PublisherPage'
import { useSeo } from '../../utils/useSeo'
import { contactEmail, publisherPagesUpdated } from '../../utils/siteConfig'

export default function CorrectionsPage() {
  useSeo({
    title: 'Corrections',
    description: "How Ijwi ry'ukuri fixes a published story, what a correction looks like and how to report an error.",
    path: '/corrections',
  })

  return (
    <PublisherPage
      title="Corrections"
      intro="When a published report is wrong, the fix belongs in the report itself - not in a new post that quietly replaces it. This page says how that works and how to start one."
      updated={publisherPagesUpdated}
    >
      <Section title="What we change">
        <p>
          Anything a reader can act on: a name, a number, a date, a place, a quote, who said what, a picture that does
          not belong to the story. Style preferences and reworded sentences are not corrections and are not listed here.
        </p>
      </Section>

      <Section title="How a correction is made">
        <ol className="list-decimal space-y-2 pl-6">
          <li>The error is confirmed against the same kind of evidence the story originally used.</li>
          <li>The published text is edited so the story reads correctly on its own - the wrong version is not left
            standing with a strikethrough.</li>
          <li>The story keeps its original publication date, and the page shows that it was updated afterwards, so
            nobody is told a report appeared later than it did.</li>
          <li>If the mistake changed the meaning of the story, the changed part is stated plainly at the point where it
            was wrong.</li>
        </ol>
      </Section>

      <Section title="What a correction entry says">
        <p>
          A correction here names the story, the date it was noticed, what was wrong and what is correct now. It does
          not name the writer as the reason, and it does not argue with the person who reported the error.
        </p>
      </Section>

      <Section title="Report an error">
        {contactEmail ? (
          <p className="flex flex-wrap items-center gap-2">
            <Mail className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <a
              href={`mailto:${contactEmail}`}
              className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
            >
              {contactEmail}
            </a>
            <span className="text-gray-500 dark:text-gray-400">- with the story link and the correct fact.</span>
          </p>
        ) : (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[1rem] text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            There is no published newsroom address yet. The{' '}
            <Link to="/contact" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
              contact form
            </Link>{' '}
            reaches the same people, and the comments under the story that is wrong reach the writer who can fix it
            there - say which sentence is wrong and what it should say.
          </p>
        )}
        <p>
          You can also read the{' '}
          <Link to="/editorial-policy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            editorial policy
          </Link>{' '}
          to see the standard we hold a story to before it publishes, and{' '}
          <Link to="/contact" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            contact the newsroom
          </Link>{' '}
          for anything that is not a factual error.
        </p>
      </Section>

      <Section title="Taking a story down">
        <p>
          A report that cannot be corrected in place - a safety risk, a legal problem, a story that should not have run
          - is removed rather than rewritten. Removal is an exceptional act for a small newsroom, and the reason is
          given to the people who ask.
        </p>
      </Section>
    </PublisherPage>
  )
}
