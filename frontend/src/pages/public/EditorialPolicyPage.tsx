import { Link } from 'react-router-dom'
import PublisherPage, { Section } from '../../components/layout/PublisherPage'
import { useSeo } from '../../utils/useSeo'
import { publisherPagesUpdated } from '../../utils/siteConfig'

export default function EditorialPolicyPage() {
  useSeo({
    title: 'Editorial policy',
    description: "How a story gets approved, what counts as a source, how corrections are made and how machine-written drafts are handled at RADAR.",
    path: '/editorial-policy',
  })

  return (
    <PublisherPage
      title="Editorial policy"
      intro="One person decides what this newsroom publishes, and the rules below are the standard that decision is held to - written down so a writer can argue with it and a reader can check us against it."
      updated={publisherPagesUpdated}
    >
      <Section title="From typing to publishing">
        <p>
          A story starts as a draft, moves to review, and only reaches readers when the newsroom owner approves it.
          The states a story passes through are visible to the writer who filed it: draft, waiting for review,
          approved, rejected, published, archived. Taking a published story down is a normal action, not a punishment
          - a report that turns out wrong comes off the site while it is being fixed.
        </p>
      </Section>

      <Section title="What has to be true">
        <ul className="list-disc space-y-2 pl-6">
          <li>Every fact in a report traces back to something a writer checked: a document, a place they stood, a
            recording, or a named person who said it.</li>
          <li>Numbers are quoted with where they came from and for which period. A figure nobody will stand behind
            stays out of the story.</li>
          <li>A claim from one side of a dispute is labelled as that side's claim, and the other side is offered the
            chance to answer before publication.</li>
          <li>Pictures belong to the story: the newsroom does not attach a photo of an event it did not cover to a
            report about a different one.</li>
        </ul>
      </Section>

      <Section title="Sources who stay unnamed">
        <p>
          A person can be quoted without their name when the story cannot be told otherwise, when the risk to them is
          real, and when the reason for hiding is stated in the text. The newsroom still knows who they are; "sources
          say" with no source behind it is not reporting.
        </p>
      </Section>

      <Section title="Machine-written drafts">
        <p>
          The admin portal has one writing tool: it asks Gemini for a report on a topic the owner types. The tool is
          told to write in English, in the order of what matters most, and never to invent a quote, a name, a
          statistic or a document. A draft is stored only after a human reads it; the story says "written with AI"
          above its headline; and it can be moved back to the editor at any time. No writer account has access to it.
        </p>
        <p>
          Nothing publishes on a machine's own decision. There is one switch that lets a finished draft go out
          without the review click, it is off by default, only the owner can turn it on, and the story is still
          editable and pullable afterwards.
        </p>
      </Section>

      <Section title="Opinion, advertising and money">
        <p>
          Opinion pieces are marked as opinion by the section they sit in, and a writer's own argument is not presented
          as a report. Advertising is run by Google on our pages: an advertiser cannot buy a story, and an ad is
          never placed so it reads as part of a report. Writers are paid for the valid attention their stories get,
          which is the only money that moves inside the newsroom.
        </p>
      </Section>

      <Section title="When we get it wrong">
        <p>
          A factual error is corrected as soon as it is confirmed, in the text itself, and the story keeps its
          published date so the record is not quietly rewritten. What we changed and why is written on the{' '}
          <Link to="/corrections" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            corrections page
          </Link>
          .
        </p>
      </Section>

      <Section title="Fairness to people in a story">
        <p>
          Someone named in a report can ask for their side to be added, and the newsroom answers. A person charged
          with an offence is described as accused until a court decides; naming family members of a private person
          who is not part of the story is avoided.
        </p>
      </Section>

      <Section title="How the site describes itself">
        <p>
          This page, the{' '}
          <Link to="/about" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            about page
          </Link>{' '}
          and the{' '}
          <Link to="/terms" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
            terms
          </Link>{' '}
          are kept to match how the site actually behaves, because a promise that the code does not keep is worse than
          no promise.
        </p>
      </Section>
    </PublisherPage>
  )
}
