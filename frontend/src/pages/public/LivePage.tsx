import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Socket } from 'socket.io-client'
import { toast } from 'react-toastify'
import { Eye, MessageCircle, Radio, Send, Share2, Square, Users, Video, VideoOff, Volume2, VolumeX } from 'lucide-react'
import type { Live, LiveComment } from '../../types'
import { liveAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { connectLiveSocket, relayConfigured } from '../../utils/liveSocket'
import { openCamera, startBroadcaster, startViewer, stopTracks } from '../../utils/liveMedia'
import { shareArticle } from '../../utils/shareArticle'
import { requestSignIn } from '../../utils/signInPrompt'
import { Loading } from '../../components/common/Loading'
import { useSeo } from '../../utils/useSeo'
import MediaImage from '../../components/common/MediaImage'

function hostIdOf(live: Live | null): string {
  if (!live) return ''
  return typeof live.host === 'object' && live.host ? live.host._id : String(live.host)
}

function hostNameOf(live: Live | null): string {
  if (!live) return ''
  return typeof live.host === 'object' && live.host ? live.host.fullName || live.host.username || '' : ''
}

export default function LivePage() {
  const { id } = useParams<{ id?: string }>()
  const { t } = useI18n()
  const { user, token } = useAuth()

  const [live, setLive] = useState<Live | null>(null)
  const [pastLives, setPastLives] = useState<Live[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({ viewers: 0, views: 0 })
  const [comments, setComments] = useState<LiveComment[]>([])
  const [draft, setDraft] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [remoteReady, setRemoteReady] = useState(false)
  const [audioOn, setAudioOn] = useState(false)
  const [isWaitingTooLong, setIsWaitingTooLong] = useState(false)
  const [peerState, setPeerState] = useState<string>('new')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const previewRef = useRef<HTMLVideoElement | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const rejoinRef = useRef<(() => void) | null>(null)
  const autoRetryRef = useRef(0)
  const stopPeersRef = useRef<(() => void) | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const isAdmin = user?.role === 'ADMIN'
  const isLive = live?.status === 'active'
  const liveId = isLive && live ? live._id : null
  // Primitive dependencies only: the socket must not be torn down and rebuilt
  // because an object in React state got a new identity.
  const hostingAs = isAdmin && !!liveId && !!user && hostIdOf(live) === user._id
  const isHostBroadcaster = hostingAs

  useSeo({
    title: isLive && live ? `${live.title} — ${t('live.live')}` : t('live.title'),
    path: id ? `/live/${id}` : '/live',
  })

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = id ? await liveAPI.get(id) : await liveAPI.getCurrent()
      const found = response.data.data.live || null
      setLive(found)
      setStats({ viewers: found?.viewers ?? 0, views: found?.views ?? 0 })
      if (found) {
        // The host tab never joins as a viewer, so its chat history comes from the API.
        const history = await liveAPI.getComments(found._id)
        setComments(history.data.data.comments || [])
      } else {
        setComments([])
      }
      const list = await liveAPI.list()
      setPastLives(list.data.data.lives.filter((item) => item.status === 'ended'))
    } catch (error) {
      console.error('Failed to load the live broadcast:', error)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // One socket per broadcast: the camera, the audience counter and the chat all
  // ride on it, and none of them may outlive the page.
  useEffect(() => {
    if (!liveId) return undefined
    const socket = connectLiveSocket(token)
    socketRef.current = socket

    const onStats = (payload: { viewers?: number; views?: number }) => {
      setStats({ viewers: Number(payload.viewers) || 0, views: Number(payload.views) || 0 })
    }
    const onChat = (comment: LiveComment) => setComments((current) => [...current.slice(-199), comment])
    const onEnded = () => {
      stopTracks(streamRef.current)
      streamRef.current = null
      setLive((current) => (current ? { ...current, status: 'ended' } : current))
      void load()
    }

    socket.on('live:stats', onStats)
    socket.on('live:chat', onChat)
    socket.on('live:ended', onEnded)

    const attachStream = (stream: MediaStream) => {
      remoteStreamRef.current = stream
      setRemoteReady(false)
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      // Chrome and Safari refuse to start a stream that carries audio unless the
      // element is muted, so play() has to be retried after the unmute tap too.
      void video.play().catch(() => setRemoteReady(false))
    }

    const connect = async () => {
      if (hostingAs) {
        try {
          const stream = await openCamera()
          streamRef.current = stream
          if (previewRef.current) previewRef.current.srcObject = stream
          socket.emit('live:host', { liveId }, (ack: { error?: string; peerIds?: string[] } | undefined) => {
            if (ack?.error) {
              setCameraError(t('live.hostFailed'))
              stopTracks(stream)
              streamRef.current = null
              return
            }
            stopPeersRef.current = startBroadcaster(socket, stream, ack?.peerIds || [])
          })
        } catch (error) {
          console.error('Could not open the camera:', error)
          setCameraError(t('live.cameraBlocked'))
        }
        return
      }

      // Re-asking for the call makes the server hand this socket to the broadcaster
      // again, which is the only way a viewer gets a fresh offer.
      const watch = () => {
        socket.emit('live:watch', { liveId }, (ack: { comments?: LiveComment[]; error?: string } | undefined) => {
          if (ack?.error || !ack?.comments) return
          setComments(ack.comments)
        })
      }
      rejoinRef.current = watch
      watch()
      stopPeersRef.current = startViewer(
        socket,
        attachStream,
        () => {
          setRemoteReady(false)
          // A connection that keeps dying must not keep adding a view each time;
          // after two automatic attempts the viewer has to tap the retry button.
          if (autoRetryRef.current >= 2) return
          autoRetryRef.current += 1
          watch()
        },
        setPeerState,
      )
    }

    const onConnect = () => { void connect() }
    if (socket.connected) onConnect()
    else socket.on('connect', onConnect)

    return () => {
      socket.off('connect', onConnect)
      socket.off('live:stats', onStats)
      socket.off('live:chat', onChat)
      socket.off('live:ended', onEnded)
      stopPeersRef.current?.()
      stopPeersRef.current = null
      stopTracks(streamRef.current)
      streamRef.current = null
      remoteStreamRef.current = null
      rejoinRef.current = null
      autoRetryRef.current = 0
      socket.close()
      socketRef.current = null
    }
  }, [liveId, hostingAs, token, load])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !remoteStreamRef.current || video.srcObject === remoteStreamRef.current) return
    video.srcObject = remoteStreamRef.current
    void video.play().catch(() => {})
  })

  // A black player with no message is what made a stalled call look like a broken
  // feature, so say so after a reasonable grace period.
  useEffect(() => {
    if (isHostBroadcaster || !isLive || remoteReady) {
      setIsWaitingTooLong(false)
      return undefined
    }
    const timer = window.setTimeout(() => setIsWaitingTooLong(true), 9000)
    return () => window.clearTimeout(timer)
  }, [isHostBroadcaster, isLive, remoteReady])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [comments])

  const toggleAudio = () => {
    const video = videoRef.current
    const next = !audioOn
    if (video) {
      video.muted = !next
      if (next) void video.play().catch(() => {})
    }
    setAudioOn(next)
  }

  const handleShare = async () => {
    const url = `${window.location.origin}${id ? `/live/${id}` : '/live'}`
    await shareArticle({
      url,
      title: live?.title || t('live.title'),
      text: live?.description || t('live.tagline'),
      copiedLabel: t('live.linkCopied'),
    })
  }

  const handleStart = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    setIsStarting(true)
    setCameraError(null)
    try {
      const response = await liveAPI.start({ title: title.trim(), description: description.trim() })
      setLive(response.data.data.live)
      setTitle('')
      setDescription('')
      toast.success(t('live.started'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('live.startFailed'))
    } finally {
      setIsStarting(false)
    }
  }

  const handleEnd = async () => {
    if (!live) return
    try {
      await liveAPI.end(live._id)
      toast.success(t('live.ended'))
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('live.endFailed'))
    }
  }

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    if (!user) {
      requestSignIn()
      return
    }
    socketRef.current?.emit('live:chat', { text, name: user.fullName || user.username }, (ack: { error?: string } | undefined) => {
      if (ack?.error) toast.error(t('live.chatFailed'))
    })
    setDraft('')
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Loading className="h-8 w-48" />
        <Loading className="mt-6 aspect-video w-full" />
      </div>
    )
  }

  const panel = (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-xl bg-black">
          {isLive ? (
            <>
              {isHostBroadcaster ? (
                <video ref={previewRef} className="aspect-video w-full -scale-x-100 bg-black" autoPlay playsInline muted />
              ) : (
                <video
                  ref={videoRef}
                  className="aspect-video w-full bg-black"
                  autoPlay
                  playsInline
                  muted={!audioOn}
                  onPlaying={() => setRemoteReady(true)}
                  onStalled={() => setRemoteReady(false)}
                />
              )}
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 px-6 text-center">
                  <VideoOff className="h-8 w-8 text-red-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-white">{cameraError}</p>
                  <p className="text-xs text-slate-300">{t('live.cameraHint')}</p>
                </div>
              )}
              {!isHostBroadcaster && !cameraError && !remoteReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center">
                  <Radio className="h-7 w-7 animate-pulse text-red-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-white">
                    {isWaitingTooLong ? t('live.stalled') : t('live.connecting')}
                  </p>
                  {isWaitingTooLong && (
                    <>
                      <p className="text-xs text-slate-300">{t('live.stalledHint')}</p>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('live.stage')} · {peerState}</p>
                      <button
                        type="button"
                        onClick={() => rejoinRef.current?.()}
                        className="rounded-full bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-red-600 transition hover:bg-red-50"
                      >
                        {t('live.retry')}
                      </button>
                    </>
                  )}
                </div>
              )}
              {!isHostBroadcaster && remoteReady && (
                <button
                  type="button"
                  onClick={toggleAudio}
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition hover:bg-black/80"
                >
                  {audioOn
                    ? <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    : <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />}
                  {audioOn ? t('live.mute') : t('live.unmute')}
                </button>
              )}
              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
                  {t('live.live')}
                </span>
              </div>
              <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-white/90 sm:text-xs">
                <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" />{stats.viewers} {t('live.watching')}</span>
                <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" aria-hidden="true" />{stats.views} {t('live.views')}</span>
              </div>
            </>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-gradient-to-br from-blue-950 via-blue-800 to-cyan-600 px-6 text-center">
              <Radio className="h-9 w-9 text-white/80" aria-hidden="true" />
              <p className="text-base font-bold text-white sm:text-lg">{t('live.notLive')}</p>
              <p className="max-w-md text-xs text-slate-200 sm:text-sm">{t('live.notLiveHint')}</p>
              <Link
                to="/live"
                className="rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-600 transition hover:bg-red-50"
              >
                {t('live.openLive')}
              </Link>
            </div>
          )}
        </div>

        {live && (
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <h1 className="text-lg font-extrabold text-[var(--color-text)] sm:text-xl">{live.title}</h1>
            {live.description && <p className="mt-1 text-sm text-[var(--color-text-muted)]">{live.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <span className="inline-flex items-center gap-2">
                <MediaImage src={typeof live.host === 'object' ? live.host.avatar : null} alt="" className="h-7 w-7 rounded-full object-cover" />
                {hostNameOf(live) || t('live.newsroom')}
              </span>
              <span>{new Date(live.startedAt).toLocaleString()}</span>
              <button
                onClick={() => void handleShare()}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand-light)] px-3 py-1.5 font-semibold text-[var(--color-brand-text)] transition hover:bg-[var(--color-brand-hover)] hover:text-white"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('live.share')}
              </button>
            </div>
          </div>
        )}

        {isAdmin && !isLive && (
          <form onSubmit={handleStart} className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-4">
            <h2 className="inline-flex items-center gap-2 text-sm font-bold text-red-700">
              <Video className="h-4 w-4" aria-hidden="true" />
              {t('live.startTitle')}
            </h2>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('live.titleLabel')}
              className="input-field"
              aria-label={t('live.titleLabel')}
              required
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('live.descriptionLabel')}
              rows={2}
              className="input-field"
              aria-label={t('live.descriptionLabel')}
            />
            <p className="text-xs text-red-800/80">{t('live.startHint')}</p>
            <button
              type="submit"
              disabled={isStarting}
              className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              <Radio className="h-4 w-4" aria-hidden="true" />
              {isStarting ? t('live.starting') : t('live.startButton')}
            </button>
          </form>
        )}

        {isHostBroadcaster && isLive && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              {t('live.onAirHint')} <span className="font-semibold">{stats.viewers}</span> {t('live.watching')}
            </p>
            {!relayConfigured && (
              <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {t('live.noRelay')}
              </p>
            )}
            <button
              onClick={() => void handleEnd()}
              className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
            >
              <Square className="h-4 w-4" aria-hidden="true" />
              {t('live.endButton')}
            </button>
          </div>
        )}
      </div>

      <section translate="no" className="flex max-h-[560px] flex-col rounded-xl border border-[var(--color-border)] bg-white" aria-label={t('live.chat')}>
        <h2 className="border-b border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text)]">
          {t('live.chat')}
        </h2>
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {comments.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">{t('live.chatEmpty')}</p>}
          {comments.map((comment) => (
            <p key={comment._id} className="text-sm leading-relaxed text-[var(--color-text)]">
              <span className="font-bold text-[var(--color-brand-text)]">{comment.name}: </span>
              {comment.text}
            </p>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-3">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={user ? t('live.chatPlaceholder') : t('live.signInToChat')}
            className="input-field flex-1 text-sm"
            aria-label={t('live.chat')}
            maxLength={300}
          />
          <button
            type="submit"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-white transition hover:bg-[var(--color-brand-hover)]"
            aria-label={t('live.send')}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </section>
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-7 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-600">
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {t('live.title')}
        </h2>
        <Link to="/articles" className="text-xs font-semibold text-[var(--color-brand-text)] hover:underline">
          {t('live.backToNews')}
        </Link>
      </div>

      {panel}

      {pastLives.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-text-muted)]">{t('live.pastLives')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pastLives.slice(0, 6).map((item) => (
              <Link
                key={item._id}
                to={`/live/${item._id}`}
                className="rounded-xl border border-[var(--color-border)] bg-white p-4 transition hover:shadow-md"
              >
                <p className="text-sm font-bold text-[var(--color-text)]">{item.title}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {new Date(item.startedAt).toLocaleString()} · {item.views} {t('live.views')}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
