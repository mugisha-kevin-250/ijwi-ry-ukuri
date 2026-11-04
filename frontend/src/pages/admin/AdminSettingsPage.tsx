import { useState, type FormEvent } from 'react'
import { AlertTriangle, KeyRound, Loader2, ShieldCheck, UserCog } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const MIN_PASSWORD = 8

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string
  label: string
  type: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  )
}

export default function AdminSettingsPage() {
  const { user, updateCredentials } = useAuth()

  // Login details form
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [detailsCurrent, setDetailsCurrent] = useState('')
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [detailsSuccess, setDetailsSuccess] = useState('')

  // Password form
  const [passwordCurrent, setPasswordCurrent] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const saveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setDetailsError('')
    setDetailsSuccess('')
    if (!detailsCurrent) {
      setDetailsError('Enter your current password to confirm this change.')
      return
    }
    setDetailsSaving(true)
    try {
      await updateCredentials({
        currentPassword: detailsCurrent,
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
      })
      setDetailsSuccess('Login details updated')
      setDetailsCurrent('')
    } catch (err: any) {
      setDetailsError(err?.message || 'Could not update login details.')
    } finally {
      setDetailsSaving(false)
    }
  }

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')
    if (!passwordCurrent) {
      setPasswordError('Enter your current password to set a new one.')
      return
    }
    if (newPassword.length < MIN_PASSWORD) {
      setPasswordError(`New password must be at least ${MIN_PASSWORD} characters.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.')
      return
    }
    setPasswordSaving(true)
    try {
      await updateCredentials({ currentPassword: passwordCurrent, password: newPassword })
      setPasswordSuccess('Password updated')
      setPasswordCurrent('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPasswordError(err?.message || 'Could not update your password.')
    } finally {
      setPasswordSaving(false)
    }
  }

  const currentUsername = user?.username ?? ''

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-blue-700">Your account</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Update how you sign in to the admin portal.</p>
      </div>

      <form onSubmit={saveDetails} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><UserCog className="h-5 w-5" /></span>
          <div>
            <h2 className="font-bold text-slate-900">Login details</h2>
            <p className="text-xs text-slate-500">Your name, username and e-mail address.</p>
          </div>
        </div>

        <div className="space-y-4">
          <Field id="fullName" label="Full name" type="text" value={fullName} onChange={setFullName} autoComplete="name" />
          <Field id="username" label="Username" type="text" value={username} onChange={setUsername} autoComplete="username" />
          <Field id="email" label="E-mail" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field id="detailsCurrent" label="Current password" type="password" value={detailsCurrent} onChange={setDetailsCurrent} placeholder="Required to save" autoComplete="current-password" />
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Your username is the credential you use to sign in at the admin portal. Changing it means you must use the new username on your next login — you will no longer be able to sign in as <span className="font-bold">{currentUsername}</span>.
          </span>
        </div>

        {detailsError && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">{detailsError}</div>}
        {detailsSuccess && <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800">{detailsSuccess}</div>}

        <button type="submit" disabled={detailsSaving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-60">
          {detailsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {detailsSaving ? 'Saving…' : 'Save login details'}
        </button>
      </form>

      <form onSubmit={savePassword} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><KeyRound className="h-5 w-5" /></span>
          <div>
            <h2 className="font-bold text-slate-900">Password</h2>
            <p className="text-xs text-slate-500">Choose a new password, at least {MIN_PASSWORD} characters.</p>
          </div>
        </div>

        <div className="space-y-4">
          <Field id="passwordCurrent" label="Current password" type="password" value={passwordCurrent} onChange={setPasswordCurrent} autoComplete="current-password" />
          <Field id="newPassword" label="New password" type="password" value={newPassword} onChange={setNewPassword} placeholder="••••••••" autoComplete="new-password" />
          <Field id="confirmPassword" label="Confirm new password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" autoComplete="new-password" />
        </div>

        {passwordError && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">{passwordError}</div>}
        {passwordSuccess && <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800">{passwordSuccess}</div>}

        <button type="submit" disabled={passwordSaving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-60">
          {passwordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {passwordSaving ? 'Updating…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}
