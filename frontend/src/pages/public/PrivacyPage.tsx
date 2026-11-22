import { Link } from 'react-router-dom'
import PublisherPage, { Section } from '../../components/layout/PublisherPage'
import { useAuth } from '../../context/AuthContext'
import { useSeo } from '../../utils/useSeo'
import { contactEmail, publisherPagesUpdated } from '../../utils/siteConfig'

export default function PrivacyPage() {
  // The deletion promise is only useful if the page points at the button that
  // keeps it. A reader's own account screen is at /user/<their id>, and a
  // visitor who is not signed in has to sign in before that address exists.
  const { user } = useAuth()
  const accountHref = user?._id ? `/user/${user._id}` : '/login'
  const accountLabel = user?._id ? 'the account screen' : 'sign in and open your account screen'
  useSeo({
    title: 'Privacy policy',
    description:"Exactly what RADAR stores about a reader, who else sees it, and how to ask for it to be removed.",
    path: '/privacy',
  })

  return (
    <PublisherPage
      title="Privacy policy"
      intro="We keep only what the site needs to work: your account, what you wrote, and enough about your reading to pay writers honestly. We do not sell it, and we do not hide anything else in here."
      updated={publisherPagesUpdated}
    >
      <Section title="What we store about you">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong className="font-semibold text-gray-900 dark:text-white">Your account.</strong> Name, username,
            email, a scrambled password (never the real one), an optional photo and bio, and your role - reader,
            writer, editor or admin. If you sign in with Google, we take the same fields from Google and the password
            is never involved.
          </li>
          <li>
            <strong className="font-semibold text-gray-900 dark:text-white">What you do with a story.</strong> Likes,
            bookmarks, follows and comments are saved with your account so the counts are real and you can take them
            back.
          </li>
          <li>
            <strong className="font-semibold text-gray-900 dark:text-white">Reading records.</strong> Each time a
            story is opened we record which story, how long it was read, and one of: your account id, a random id
            kept in this browser, or a one-way hash of your network address. The plain address is never kept. This is
            only there to tell a real reader from a machine, because writers are paid per 1,000 valid views.
          </li>
          <li>
            <strong className="font-semibold text-gray-900 dark:text-white">Pictures you upload.</strong> Stored on our
            database host and re-encoded before saving, which drops the camera metadata that comes off a phone.
          </li>
          <li>
            <strong className="font-semibold text-gray-900 dark:text-white">Notifications.</strong> If you allow news
            alerts, your device gives us a delivery address (a Google/Firebase push endpoint). It is only used to
            send alerts and it is deleted the moment you turn alerts off.
          </li>
          <li>
            <strong className="font-semibold text-gray-900 dark:text-white">Live broadcasts.</strong> Video and audio
            from a broadcast pass between viewers; a broadcast chat message is stored with the account that sent it.
          </li>
        </ul>
      </Section>

      <Section title="What stays in your browser">
        <p>
          Your sign-in token, the language you picked, and the stories you liked or bookmarked in this session are
          kept in your browser's own storage so the site is fast and stays signed in. Clearing the site data removes
          them, and signing out removes the token.
        </p>
      </Section>

      <Section title="Who else sees anything">
        <p>
          Three companies run parts of the site and therefore see some traffic: Google (Firebase Hosting, Google
          sign-in and the page translator), Render (our API server) and MongoDB Atlas (our database). They process
          data under their own terms and we pick the plans that keep it in one place.
        </p>
        <p>
          If the owner turns on Google Analytics or Google AdSense advertising, those services set their own cookies
          and read your device information for measurement and ad choice. Both stay off until the site is configured
          with the ids for them, and even then neither loads until you answer yes to the question at the bottom of your
          first page - refusing costs you nothing but the analytics. Nothing about a reader is ever sent to a writer or
          advertiser as a named record; they see totals only.{' '}
          <Link to="/cookies" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            The cookie policy
          </Link>{' '}
          lists every entry this site keeps in your browser, and that page is where you change your answer.
        </p>
      </Section>

      <Section title="Your choices">
        <ul className="list-disc space-y-2 pl-6">
          <li>Read everything without an account; no account means no personal record beyond the anonymous view id.</li>
          <li>Turn off news alerts from the article page or from settings, any time.</li>
          <li>Delete a comment you wrote, or ask us to remove your whole account and the records that belong to it.</li>
          <li>Ask what we hold about you, or correct it.</li>
        </ul>
        <p>
          {contactEmail ? (
            <>
              Send any of those requests to{' '}
              <a href={`mailto:${contactEmail}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                {contactEmail}
              </a>
              . A story you wrote stays as it is - a published report is a matter of public record - but your name can
              be taken off it, and the account and its reading records can be deleted.{' '}
              <Link to={accountHref} className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                {accountLabel}
              </Link>
              {' '}and close the account in one press, proved by the account password; it erases what we hold on you.
            </>
          ) : (
            <>
              These pages have no newsroom address published yet, so send the request through{' '}
              <Link to="/contact" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                the contact form
              </Link>
              . The same promises apply: your data can be shown to you, fixed, or deleted.
            </>
          )}
        </p>
      </Section>

      <Section title="Children">
        <p>
          The site is not aimed at children and we do not ask anyone's age. If a child's account turns up with
          identifiable data, tell us and it is removed.
        </p>
      </Section>

      <Section title="Security">
        <p>
          The whole site is served over HTTPS, passwords are stored only as one-way hashes, and every request to the
          API is checked against a signed token that expires. Secrets that run the site live in the servers' own
          environment and are never sent to your browser.
        </p>
      </Section>

      <Section title="If this changes">
        <p>
          A new version of this page gets a new date at the top of it. Continued use of the site after that means the
          new version applies. The other pages that describe the newsroom are{' '}
          <Link to="/terms" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            the terms of use
          </Link>{' '}
          and{' '}
          <Link to="/editorial-policy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            the editorial policy
          </Link>
          .
        </p>
      </Section>
    </PublisherPage>
  )
}
