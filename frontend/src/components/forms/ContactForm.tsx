import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2, Send } from 'lucide-react'
import { publicAPI } from '../../services/api'

const TOPICS = [
  { value: 'correction', label: 'A correction to a story' },
  { value: 'story-tip', label: 'A story tip' },
  { value: 'writer-access', label: 'Writing for the newsroom' },
  { value: 'advertising', label: 'Advertising or partnership' },
  { value: 'other', label: 'Something else' },
]

// The same floors the API enforces, checked here too so a reader is not made to
// press a button that cannot work. The server still decides; a browser with the
// script switched off reaches the same wall.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MIN_MESSAGE = 20

interface FieldErrors {
  name?: string
  email?: string
  phone?: string
  message?: string
}

const PHONE_SHAPE = /^[+\d][\d\s().-]{5,}$/

function validate(values: { name: string; email: string; phone: string; message: string }): FieldErrors {
  const errors: FieldErrors = {}
  if (values.name.trim().length < 2) errors.name = 'Please tell us who is writing.'
  if (!EMAIL_SHAPE.test(values.email.trim())) errors.email = 'That address is missing something, so we could not reply to it.'
  // Never required: some readers would rather not hand over a number at all. What
  // is refused is a number too short to dial, because a wrong one wastes the
  // reporter's time exactly as much as a wrong address does.
  if (values.phone.trim() && !PHONE_SHAPE.test(values.phone.trim())) {
    errors.phone = 'That does not look like a number we could call. Digits, spaces and a leading + are all we need.'
  } else if (values.phone.replace(/\D/g, '').length > 0 && values.phone.replace(/\D/g, '').length < 7) {
    errors.phone = 'That number looks too short to dial. Leave it blank if you would rather be answered by email.'
  }
  if (values.message.trim().length < MIN_MESSAGE) errors.message = `Please add a little more detail - at least ${MIN_MESSAGE} characters.`
  return errors
}

const FIELD_CLASS = 'mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-[1rem] text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-brand-900/40'

export default function ContactForm() {
  const id = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [topic, setTopic] = useState('correction')
  const [message, setMessage] = useState('')
  // Only a crawler fills this: the field is off-screen for a person.
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = validate({ name, email, phone, message })
    setErrors(found)
    setFailure('')
    if (Object.keys(found).length) return

    setSending(true)
    try {
      await publicAPI.sendContact({ name, email, phone: phone.trim(), topic, message, website })
      setSent(true)
    } catch (err: any) {
      // The address itself says most: a full inbox from this address is a
      // different instruction to a broken connection.
      setFailure(err?.response?.data?.message || 'That did not reach us. Check your connection, or write to the newsroom from the address above.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="space-y-1 text-[1rem] leading-relaxed">
          <p className="font-semibold">Your message is with the newsroom.</p>
          <p>
            Whoever reads the section you wrote about sees it, and the answer goes back to {email.trim()}. There is no
            automatic reply, because nobody wants one.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 text-[1rem]">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-gray-900 dark:text-white" htmlFor={`${id}-name`}>
          Your name
          <input
            id={`${id}-name`}
            className={FIELD_CLASS}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={120}
            aria-invalid={Boolean(errors.name) || undefined}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
          />
        </label>
        <label className="block text-sm font-semibold text-gray-900 dark:text-white" htmlFor={`${id}-email`}>
          Email we reply to
          <input
            id={`${id}-email`}
            type="email"
            className={FIELD_CLASS}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            maxLength={200}
            aria-invalid={Boolean(errors.email) || undefined}
            aria-describedby={errors.email ? `${id}-email-error` : undefined}
          />
        </label>
      </div>

      {errors.name && <p id={`${id}-name-error`} role="alert" className="-mt-2 text-sm font-medium text-red-700 dark:text-red-400">{errors.name}</p>}
      {errors.email && <p id={`${id}-email-error`} role="alert" className="-mt-2 text-sm font-medium text-red-700 dark:text-red-400">{errors.email}</p>}

      <label className="block text-sm font-semibold text-gray-900 dark:text-white" htmlFor={`${id}-phone`}>
        Phone number, if you would rather be called
        <input
          id={`${id}-phone`}
          type="tel"
          inputMode="tel"
          className={FIELD_CLASS}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="tel"
          maxLength={40}
          placeholder="+250 7…"
          aria-invalid={Boolean(errors.phone) || undefined}
          aria-describedby={errors.phone ? `${id}-phone-error` : `${id}-phone-help`}
        />
      </label>

      {errors.phone
        ? <p id={`${id}-phone-error`} role="alert" className="-mt-2 text-sm font-medium text-red-700 dark:text-red-400">{errors.phone}</p>
        : <p id={`${id}-phone-help`} className="-mt-2 text-sm text-gray-500 dark:text-gray-400">
            Optional, and only used to answer you back. A story tip that needs a call is worth a number; a correction is
            usually faster by email.
          </p>}

      {errors.name && <p id={`${id}-name-error`} role="alert" className="-mt-2 text-sm font-medium text-red-700 dark:text-red-400">{errors.name}</p>}
      {errors.email && <p id={`${id}-email-error`} role="alert" className="-mt-2 text-sm font-medium text-red-700 dark:text-red-400">{errors.email}</p>}

      <label className="block text-sm font-semibold text-gray-900 dark:text-white" htmlFor={`${id}-topic`}>
        What is it about
        <select id={`${id}-topic`} className={FIELD_CLASS} value={topic} onChange={(event) => setTopic(event.target.value)}>
          {TOPICS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-semibold text-gray-900 dark:text-white" htmlFor={`${id}-message`}>
        Your message
        <textarea
          id={`${id}-message`}
          className={`${FIELD_CLASS} min-h-36`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={4000}
          rows={6}
          placeholder="Which story, what is wrong, and what the correct fact is - or the tip itself, with where it happened."
          aria-invalid={Boolean(errors.message) || undefined}
          aria-describedby={errors.message ? `${id}-message-error` : `${id}-message-help`}
        />
      </label>

      {errors.message
        ? <p id={`${id}-message-error`} role="alert" className="-mt-2 text-sm font-medium text-red-700 dark:text-red-400">{errors.message}</p>
        : <p id={`${id}-message-help`} className="-mt-2 text-sm text-gray-500 dark:text-gray-400">{message.length} of 4,000 characters.</p>}

      <div aria-hidden="true" className="absolute h-px w-px overflow-hidden whitespace-nowrap -left-[9999px] top-auto">
        <label htmlFor={`${id}-website`}>Website (leave this empty)
          <input
            id={`${id}-website`}
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>

      {failure && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{failure}</p>}

      <div className="space-y-3">
        <button
          type="submit"
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-60"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          {sending ? 'Sending' : 'Send to the newsroom'}
        </button>
        <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          We keep your name, this address and what you wrote so the newsroom can answer you, and nothing else about you
          is recorded. Full details are in the{' '}
          <Link to="/privacy" className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">privacy policy</Link>
          ; ask us and the message is deleted.
        </p>
      </div>
    </form>
  )
}
