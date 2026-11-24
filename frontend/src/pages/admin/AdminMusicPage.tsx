import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, RefreshCw, ShieldCheck, Users, Disc3 } from 'lucide-react'
import apiClient from '../../services/apiClient'

type Artist = { _id: string; stageName: string; status: string; biography?: string; country?: string; genres?: string[]; officialUrl?: string; reviewNote?: string; user?: { email?: string; username?: string } }
type Release = { _id: string; title: string; status: string; genre?: string; listeningUrl: string; artworkUrl?: string; rightsBasis: string; rightsEvidenceUrl?: string; downloadAllowed?: boolean; featured?: boolean; plays?: number; artist?: { stageName: string; status?: string; user?: { email?: string } } }

export default function AdminMusicPage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [releases, setReleases] = useState<Release[]>([])
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const [catalogue, queue] = await Promise.all([
        apiClient.get<any>('/music/desk/catalogue'),
        apiClient.get<any>('/music/desk/queue'),
      ])
      setArtists(catalogue.data.data?.artists || [])
      setReleases(catalogue.data.data?.releases || [])
      // Queue response is intentionally fetched too: a failed permission check
      // should surface instead of making this desk look like an empty catalogue.
      void queue.data
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The RADAR music desk could not load. Check your music-management permission.')
    } finally { setBusy(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const decideArtist = async (artist: Artist, status: string) => {
    setError(''); setMessage('')
    try {
      await apiClient.put('/music/desk/artists/' + artist._id + '/review', { status, note: 'Reviewed in RADAR music management desk' })
      setMessage(artist.stageName + ' profile marked ' + status + '.')
      await refresh()
    } catch (err: any) { setError(err?.response?.data?.message || 'Could not update artist status.') }
  }

  const decideRelease = async (release: Release, status: string, featured = false) => {
    setError(''); setMessage('')
    try {
      await apiClient.put('/music/desk/releases/' + release._id + '/review', {
        status, featured, downloadAllowed: false,
        note: 'Reviewed in RADAR music management desk. Direct download remains disabled pending secure rights-file verification.',
      })
      setMessage(release.title + ' release marked ' + status + '.')
      await refresh()
    } catch (err: any) { setError(err?.response?.data?.message || 'Could not update release status.') }
  }

  const visibleReleases = releases.filter(item => filter === 'all' || item.status === filter)
  const pendingArtists = artists.filter(item => item.status === 'pending').length
  const pendingReleases = releases.filter(item => item.status === 'pending' || item.status === 'takedown_pending').length

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="rounded-2xl bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 p-6 text-white sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">RADAR · Rights and editorial</p>
      <h1 className="mt-2 text-2xl font-black sm:text-3xl">Music management desk</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">Review artist applications, verify release information, resolve takedown requests and manage the approved catalogue. Every decision is recorded in the audit log.</p>
      <button type="button" onClick={() => void refresh()} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-50"><RefreshCw className={'h-4 w-4 ' + (busy ? 'animate-spin' : '')}/> Refresh catalogue</button>
    </header>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Users className="h-4 w-4"/> Artist profiles</div><p className="mt-2 text-3xl font-black">{artists.length}</p></div>
      <div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><ShieldCheck className="h-4 w-4"/> Awaiting artist review</div><p className="mt-2 text-3xl font-black">{pendingArtists}</p></div>
      <div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Disc3 className="h-4 w-4"/> Releases needing action</div><p className="mt-2 text-3xl font-black">{pendingReleases}</p></div>
    </div>

    <section className="rounded-2xl border bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">Artist applications and profiles</h2><p className="text-xs text-slate-500">Verification is required before an artist can submit releases.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{artists.length} total</span></div>
      {artists.length === 0 ? <p className="text-sm text-slate-500">No artist profiles found.</p> : <div className="space-y-3">{artists.map(artist => <article key={artist._id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{artist.stageName}</h3><p className="text-xs text-slate-500">{artist.user?.email || artist.user?.username || 'Account'} · {artist.country || 'Country not supplied'}</p><p className="mt-1 text-xs text-slate-600">{artist.genres?.join(', ') || 'Genres not supplied'}</p><p className="mt-2 max-w-3xl text-sm text-slate-600">{artist.biography || 'No biography supplied.'}</p>{artist.officialUrl && <a href={artist.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 underline">Official profile <ExternalLink className="h-3 w-3"/></a>}</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{artist.status}</span></div>
        <div className="mt-3 flex flex-wrap gap-2">{artist.status !== 'verified' && <button type="button" onClick={() => void decideArtist(artist, 'verified')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Verify artist</button>}{artist.status !== 'rejected' && <button type="button" onClick={() => void decideArtist(artist, 'rejected')} className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-bold text-slate-800">Reject</button>}{artist.status !== 'suspended' && artist.status === 'verified' && <button type="button" onClick={() => void decideArtist(artist, 'suspended')} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">Suspend</button>}</div>
      </article>)}</div>}
    </section>

    <section className="rounded-2xl border bg-white p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-extrabold">Release catalogue and rights queue</h2><p className="text-xs text-slate-500">Review the official listening page and rights basis before publishing.</p></div><select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="takedown_pending">Takedown pending</option><option value="rejected">Rejected</option><option value="removed">Removed</option></select></div>
      {visibleReleases.length === 0 ? <p className="text-sm text-slate-500">No releases in this view.</p> : <div className="space-y-3">{visibleReleases.map(release => <article key={release._id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-bold">{release.title}</h3><p className="text-xs text-slate-500">{release.artist?.stageName || 'Artist'} · {release.genre || 'Music'} · {release.plays || 0} listens</p><p className="mt-2 text-xs text-slate-600">Rights basis: <strong>{release.rightsBasis}</strong> · Evidence: {release.rightsEvidenceUrl ? 'provided (manual verification required)' : 'not supplied'}</p><div className="mt-2 flex flex-wrap gap-3"><a href={release.listeningUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 underline">Open official listening page <ExternalLink className="h-3 w-3"/></a>{release.rightsEvidenceUrl && <a href={release.rightsEvidenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 underline">Review rights evidence <ExternalLink className="h-3 w-3"/></a>}</div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{release.status.replace('_', ' ')}</span></div>
        <div className="mt-3 flex flex-wrap gap-2">{release.status !== 'approved' && release.status !== 'removed' && <button type="button" onClick={() => void decideRelease(release, 'approved', release.featured)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">{release.status === 'takedown_pending' ? 'Keep published' : 'Approve release'}</button>}{release.status !== 'rejected' && release.status !== 'removed' && <button type="button" onClick={() => void decideRelease(release, release.status === 'takedown_pending' ? 'removed' : 'rejected')} className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-bold text-slate-800">{release.status === 'takedown_pending' ? 'Remove release' : 'Reject release'}</button>}{release.status === 'approved' && <button type="button" onClick={() => void decideRelease(release, 'approved', !release.featured)} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800">{release.featured ? 'Remove featured' : 'Feature release'}</button>}</div>
      </article>)}</div>}
    </section>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950"><strong>Download protection:</strong> direct downloads remain disabled. An artist declaration or a link to evidence is not enough to prove distribution rights. RADAR must add secure private document storage and a documented verification process before enabling file downloads.</div>
  </div>
}
