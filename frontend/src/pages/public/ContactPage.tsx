import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import PublisherPage, { Section } from '../../components/layout/PublisherPage'
import ContactForm from '../../components/forms/ContactForm'
import { useSeo } from '../../utils/useSeo'
import { contactEmail } from '../../utils/siteConfig'

export default function ContactPage() {
  useSeo({
    title: 'Contact the newsroom',
    description: "How to reach Ijwi ry'ukuri with a correction, a story tip or an advertising question.",
    path: '/contact',
    jsonLd: contactEmail
      ? {
          '@context': 'https://schema.org',
          '@type': 'ContactPage',
          name: 'Contact the newsroom',
          url: 'https://ijwi-ry--ukuri.web.app/contact',
          mainEntity: {
            '@type': 'Organization',
            name: "Ijwi ry'ukuri",
            contactPoint: {
              '@type': 'ContactPoint',
              contactType: 'customer support',
              email: contactEmail,
              availableLanguage: ['rw', 'en', 'fr', 'sw'],
            },
          },
        }
      : undefined,
  })

  return (
    <PublisherPage
      title="Contact the newsroom"
      intro="Corrections, story tips, writer applications and advertising questions all reach the same small team. Here is the fastest way for each one."
    >
      <Section title="Write to the newsroom">
        <p>
          One form, and it reaches the same inbox whoever runs the section you are writing about. Say which story if it
          is about a story - a correction we cannot trace to a report is a correction nobody can make.
        </p>
        <ContactForm />
      </Section>

      <Section title="Or send an email">
        {contactEmail ? (
          <p className="flex flex-wrap items-center gap-2">
            <Mail className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <a
              href={`mailto:${contactEmail}`}
              className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
            >
              {contactEmail}
            </a>
            <span className="text-gray-500 dark:text-gray-400">- answered when it is read, usually within a day.</span>
          </p>
        ) : (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[1rem] text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            The newsroom has not published a mailbox on the site yet, which is why the form above exists: it reaches the
            same people and does not need an address to work. Fill it in and the answer comes back to you by email.
          </p>
        )}
      </Section>

      <Section title="Tell us about a mistake">
        <p>
          Say which story, what is wrong and what the correct fact is. If the story was wrong about something a
          reader can act on, we fix it and note that it was changed; the details of how are on the{' '}
          <Link to="/corrections" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            corrections page
          </Link>
          .
        </p>
      </Section>

      <Section title="Want to write for us">
        <p>
          Register with your real name, then ask for writer access from your profile. The owner reads applications
          and approves the ones that fit the sections; approval is not automatic and writing is not paid for until
          the first valid views arrive.
        </p>
        <p className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/register" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            Create an account
          </Link>
          <Link to="/about" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            How the newsroom works
          </Link>
        </p>
      </Section>

      <Section title="Advertising and partnerships">
        <p>
          Ads on this site are run by Google AdSense, so an advertiser reaches Rwandan readers through Google's own
          auction rather than through us. What we do and do not accept is written on the{' '}
          <Link to="/advertising" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            advertising page
          </Link>
          .
        </p>
      </Section>

      <Section title="Live radio and video">
        <p>
          The newsroom broadcasts from its own{' '}
          <Link to="/live" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            live page
          </Link>
          . If you were in a broadcast and something went wrong, or you want to be on the next one, that is the
          quickest thing to tell us by name.
        </p>
      </Section>
    </PublisherPage>
  )
}
