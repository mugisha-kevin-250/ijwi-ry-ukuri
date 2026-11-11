import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, PenLine, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { writerAPI } from '../../services/api'
import { Button } from '../common/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { Textarea } from '../common/Textarea'

type State = 'loading' | 'open' | 'pending' | 'approved'

interface Application {
  status?: string
}

// A reader who wanders into /writer used to be handed the WRITER role by the
// server. Now they can only file an application, and an ADMIN decides.
export default function WriterAccessGate() {
  const { t } = useI18n()
  const { user, requestWriterAccess, refreshUser } = useAuth()
  const [state, setState] = useState<State>('loading')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    writerAPI
      .getStatus()
      .then((response) => {
        if (cancelled) return
        const data = response.data.data as { role?: string; application?: Application }
        if (data?.role && data.role !== 'READER') {
          setState('approved')
          return
        }
        const status = data?.application?.status
        if (status === 'pending') setState('pending')
        else if (status === 'approved') setState('approved')
        else setState('open')
      })
      .catch(() => {
        if (!cancelled) setState('open')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async () => {
    setBusy(true)
    setFailure(null)
    try {
      await requestWriterAccess(reason.trim() || undefined)
      setState('pending')
    } catch (error) {
      setFailure(error instanceof Error ? error.message : t('writer.access.failed'))
    } finally {
      setBusy(false)
    }
  }

  // An approval lands in the database before this browser knows about it, so the
  // snapshot is refreshed and the router lets them through on the next render.
  if (state === 'approved') {
    void refreshUser()
    return (
      <Card className="mx-auto my-10 max-w-lg">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-gray-600">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
          {t('writer.access.approved')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mx-auto my-10 max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-5 w-5 text-[#1877F2]" aria-hidden="true" />
          {t('writer.access.title')}
        </CardTitle>
        <CardDescription>{t('writer.access.body')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'loading' && <p className="text-sm text-gray-500">{t('writer.access.checking')}</p>}

        {state === 'pending' && (
          <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
            <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{t('writer.access.pending')}</p>
              <p className="mt-1 text-blue-800">{t('writer.access.pendingBody')}</p>
            </div>
          </div>
        )}

        {state === 'open' && (
          <>
            {user ? (
              <p className="text-sm text-gray-600">
                {t('writer.access.as')} {user.fullName}
              </p>
            ) : null}
            <Textarea
              id="writer-reason"
              label={t('writer.access.reason')}
              value={reason}
              rows={4}
              maxLength={600}
              onChange={(event) => setReason(event.target.value)}
            />
            {failure && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {failure}
              </div>
            )}
            <Button type="button" onClick={submit} disabled={busy} className="w-full">
              {busy ? t('writer.access.sending') : t('writer.access.action')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
