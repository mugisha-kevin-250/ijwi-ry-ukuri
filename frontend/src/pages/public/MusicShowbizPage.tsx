import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Disc3, ExternalLink, Headphones, Music2, Search, Sparkles } from 'lucide-react'
import { radioAPI, type AudiusTrack } from '../../services/api'
import apiClient from '../../services/apiClient'
import { useAuth } from '../../context/AuthContext'
import { useSeo } from '../../utils/useSeo'

function durationLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Duration unavailable'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function AudiusLink({ track, children }: { track: AudiusTrack; children: ReactNode }) {
  const href = track.permalink || `https://audius.co/search/${encodeURIComponent(track.title)}`
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{children}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>
}


function ArtistPortal() {
  const { user } = useAuth()
  const [artist, setArtist] = useState<any>(null)
  const [myReleases, setMyReleases] = useState<any[]>([])
  const [queue, setQueue] = useState<{ artists: any[]; releases: any[] }>({ artists: [], releases: [] })
  const [artistForm, setArtistForm] = useState({ stageName: '', biography: '', country: '', genres: '', officialUrl: '' })
  const [releaseForm, setReleaseForm] = useState({ title: '', description: '', genre: '', language: '', artworkUrl: '', listeningUrl: '', rightsBasis: 'owner', rightsEvidenceUrl: '', rightsDeclaration: false })
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ stageName: '', biography: '', country: '', genres: '', officialUrl: '' })
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    let active = true
    apiClient.get<any>('/music/artists/me').then(response => {
      if (!active) return
      const currentArtist = response.data.data?.artist || null
      setArtist(currentArtist)
      if (currentArtist) setProfileForm({ stageName: currentArtist.stageName || '', biography: currentArtist.biography || '', country: currentArtist.country || '', genres: (currentArtist.genres || []).join(', '), officialUrl: currentArtist.officialUrl || '' })
      setMyReleases(response.data.data?.releases || [])
    }).catch(() => {})
    if (user.role === 'ADMIN') apiClient.get<any>('/music/desk/queue').then(response => {
      if (active) setQueue(response.data.data || { artists: [], releases: [] })
    }).catch(() => {})
    return () => { active = false }
  }, [user])

  const apply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setStatus(''); setBusy(true)
    try {
      const response = await apiClient.post<any>('/music/artists/apply', {
        ...artistForm,
        genres: artistForm.genres.split(',').map(value => value.trim()).filter(Boolean),
      })
      setArtist(response.data.data?.artist || null)
      setStatus('Artist application submitted. RADAR will review your profile.')
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not submit artist application.')
    } finally { setBusy(false) }
  }

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setStatus(''); setBusy(true)
    try {
      const response = await apiClient.patch<any>('/music/artists/me', { ...profileForm, genres: profileForm.genres.split(',').map(value => value.trim()).filter(Boolean) })
      setArtist(response.data.data?.artist || artist)
      setEditingProfile(false)
      setStatus('Artist profile updated.')
    } catch (err: any) { setError(err?.response?.data?.message || 'Could not update artist profile.') }
    finally { setBusy(false) }
  }

  const submitRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setStatus(''); setBusy(true)
    try {
      await apiClient.post<any>('/music/releases', releaseForm)
      const response = await apiClient.get<any>('/music/artists/me')
      setMyReleases(response.data.data?.releases || [])
      setStatus('Release submitted for copyright and editorial review. It will appear publicly only after approval.')
      setReleaseForm({ title: '', description: '', genre: '', language: '', artworkUrl: '', listeningUrl: '', rightsBasis: 'owner', rightsEvidenceUrl: '', rightsDeclaration: false })
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not submit this release.')
    } finally { setBusy(false) }
  }

  const requestTakedown = async (id: string) => {
    const reason = window.prompt('Why should RADAR review removal of this release?')
    if (!reason?.trim()) return
    setError(''); setStatus('')
    try {
      await apiClient.post<any>(`/music/releases/${id}/takedown`, { reason })
      const response = await apiClient.get<any>('/music/artists/me')
      setMyReleases(response.data.data?.releases || [])
      setStatus('Takedown request sent to the RADAR rights desk.')
    } catch (err: any) { setError(err?.response?.data?.message || 'Could not submit takedown request.') }
  }

  const review = async (kind: 'artists' | 'releases', id: string, decision: string) => {
    setError(''); setStatus('')
    try {
      const path = kind === 'artists' ? `/music/desk/artists/${id}/review` : `/music/desk/releases/${id}/review`
      await apiClient.put(path, { status: decision, note: 'Reviewed in RADAR music desk' })
      const response = await apiClient.get<any>('/music/desk/queue')
      setQueue(response.data.data || { artists: [], releases: [] })
      if (kind === 'artists') {
        const mine = await apiClient.get<any>('/music/artists/me')
        setArtist(mine.data.data?.artist || null)
      }
      setStatus('Music desk decision saved.')
    } catch (err: any) { setError(err?.response?.data?.message || 'Could not save the review decision.') }
  }

  return (
    <section aria-labelledby="artist-onboarding" className="mt-9 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">For musicians</p>
        <h2 id="artist-onboarding" className="mt-1 text-xl font-extrabold text-slate-950">Submit your music to RADAR</h2>
        <p className="mt-1 text-sm text-slate-600">Apply for an artist profile and submit official listening links. RADAR does not host or redistribute audio files in this release.</p>
      </div>
      {!user && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Sign in to apply for an artist profile and manage your releases. <Link to="/login" className="font-bold text-blue-700 underline">Sign in</Link></p>}
      {user && !artist && (
        <form onSubmit={apply} className="grid gap-3 sm:grid-cols-2">
          <input required maxLength={100} placeholder="Artist / stage name" value={artistForm.stageName} onChange={e => setArtistForm({ ...artistForm, stageName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Country" value={artistForm.country} onChange={e => setArtistForm({ ...artistForm, country: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Genres, separated by commas" value={artistForm.genres} onChange={e => setArtistForm({ ...artistForm, genres: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
          <input placeholder="Official artist page (optional)" value={artistForm.officialUrl} onChange={e => setArtistForm({ ...artistForm, officialUrl: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
          <textarea placeholder="Short artist biography" value={artistForm.biography} onChange={e => setArtistForm({ ...artistForm, biography: e.target.value })} className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
          <button disabled={busy} className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{busy ? 'Submitting…' : 'Apply for artist profile'}</button>
        </form>
      )}
      {user && artist && (
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-900">{artist.stageName}</p>
          <p className="mt-1 text-xs text-slate-600">Artist profile status: <span className="font-bold capitalize">{artist.status}</span></p>
          <button type="button" onClick={() => setEditingProfile(value => !value)} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">{editingProfile ? 'Close profile editor' : 'Edit artist profile'}</button>
          {editingProfile && <form onSubmit={saveProfile} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input required maxLength={100} placeholder="Artist / stage name" value={profileForm.stageName} onChange={e => setProfileForm({ ...profileForm, stageName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Country" value={profileForm.country} onChange={e => setProfileForm({ ...profileForm, country: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Genres, comma separated" value={profileForm.genres} onChange={e => setProfileForm({ ...profileForm, genres: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
            <input placeholder="Official profile URL" value={profileForm.officialUrl} onChange={e => setProfileForm({ ...profileForm, officialUrl: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
            <textarea placeholder="Biography" value={profileForm.biography} onChange={e => setProfileForm({ ...profileForm, biography: e.target.value })} className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
            <button disabled={busy} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{busy ? 'Saving…' : 'Save artist profile'}</button>
          </form>}
          {artist.status === 'verified' && (
            <form onSubmit={submitRelease} className="mt-5 grid gap-3 sm:grid-cols-2">
              <h3 className="font-bold sm:col-span-2">Submit a release</h3>
              <input required maxLength={160} placeholder="Song or release title" value={releaseForm.title} onChange={e => setReleaseForm({ ...releaseForm, title: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input placeholder="Genre" value={releaseForm.genre} onChange={e => setReleaseForm({ ...releaseForm, genre: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input placeholder="Language" value={releaseForm.language} onChange={e => setReleaseForm({ ...releaseForm, language: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input placeholder="Artwork URL (optional)" value={releaseForm.artworkUrl} onChange={e => setReleaseForm({ ...releaseForm, artworkUrl: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
              <input required placeholder="Official listening URL" value={releaseForm.listeningUrl} onChange={e => setReleaseForm({ ...releaseForm, listeningUrl: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
              <textarea placeholder="Release description" value={releaseForm.description} onChange={e => setReleaseForm({ ...releaseForm, description: e.target.value })} className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
              <select value={releaseForm.rightsBasis} onChange={e => setReleaseForm({ ...releaseForm, rightsBasis: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="owner">I own the rights</option>
                <option value="written_permission">I have written permission</option>
                <option value="licensed">I hold a licence</option>
              </select>
              {releaseForm.rightsBasis !== 'owner' && <input required placeholder="URL to permission / licence evidence" value={releaseForm.rightsEvidenceUrl} onChange={e => setReleaseForm({ ...releaseForm, rightsEvidenceUrl: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />}
              <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600 sm:col-span-2">
                <input type="checkbox" checked={releaseForm.rightsDeclaration} onChange={e => setReleaseForm({ ...releaseForm, rightsDeclaration: e.target.checked })} className="mt-0.5" />
                I confirm I have the legal right to submit this release and that the information is accurate.
              </label>
              <button disabled={busy || !releaseForm.rightsDeclaration} className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{busy ? 'Submitting…' : 'Submit release for review'}</button>
            </form>
          )}
          {artist.status !== 'verified' && <p className="mt-2 text-sm text-slate-600">Your application is awaiting RADAR verification. Release submissions open after approval.</p>}
          {myReleases.length > 0 && <div className="mt-5"><h3 className="text-sm font-bold">Your submitted releases</h3>{myReleases.map(item => <div key={item._id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3"><span className="text-sm">{item.title} · <span className="capitalize text-slate-500">{item.status}</span></span>{['approved', 'pending'].includes(item.status) && <button type="button" onClick={() => requestTakedown(item._id)} className="text-xs font-bold text-red-700 underline">Request takedown</button>}</div>)}</div>}
        </div>
      )}
      {status && <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">{status}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
      {user?.role === 'ADMIN' && (
        <div className="mt-7 border-t border-amber-200 pt-5">
          <h3 className="text-lg font-extrabold text-slate-950">RADAR music rights desk</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div><h4 className="font-bold">Artist applications ({queue.artists.length})</h4>
              {queue.artists.map(item => <div key={item._id} className="mt-2 rounded-xl border bg-white p-3"><p className="text-sm font-bold">{item.stageName}</p><p className="text-xs text-slate-500">{item.user?.email || ''}</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => review('artists', item._id, 'verified')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Verify</button><button type="button" onClick={() => review('artists', item._id, 'rejected')} className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-bold">Reject</button></div></div>)}
            </div>
            <div><h4 className="font-bold">Release and takedown queue ({queue.releases.length})</h4>
              {queue.releases.map(item => <div key={item._id} className="mt-2 rounded-xl border bg-white p-3"><p className="text-sm font-bold">{item.title}</p><p className="text-xs text-slate-500">{item.artist?.stageName || 'Artist'} · {item.status} · Rights: {item.rightsBasis}</p>{item.rightsEvidenceUrl && <a href={item.rightsEvidenceUrl} target="_blank" rel="noopener noreferrer" className="mr-3 text-xs font-bold text-amber-800 underline">Open rights evidence</a>}<a href={item.listeningUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-700 underline">Review official release</a><div className="mt-2 flex gap-2"><button type="button" onClick={() => review('releases', item._id, 'approved')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">{item.status === 'takedown_pending' ? 'Keep published' : 'Approve'}</button><button type="button" onClick={() => review('releases', item._id, item.status === 'takedown_pending' ? 'removed' : 'rejected')} className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-bold">{item.status === 'takedown_pending' ? 'Remove' : 'Reject'}</button></div></div>)}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** A public music discovery desk. Full catalogue listening and artist-enabled downloads stay on Audius. */
export default function MusicShowbizPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AudiusTrack[]>([])
  const [station, setStation] = useState<AudiusTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [releases, setReleases] = useState<any[]>([])

  useSeo({
    title: 'RADAR Music & Showbiz — Music streaming and discovery',
    description: 'Discover music, explore artists and listen to the RADAR curated music station. Open official artist pages for full playback and available downloads.',
    path: '/music',
  })

  useEffect(() => {
    let active = true
    apiClient.get<any>('/music/releases').then(response => { if (active) setReleases(response.data.data?.releases || []) }).catch(() => {})
    radioAPI.getAudiusPlaylist()
      .then((tracks) => { if (active) setStation(tracks) })
      .catch(() => { if (active) setError('The RADAR station could not load right now.') })
    return () => { active = false }
  }, [])

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const term = query.trim()
    if (term.length < 2) {
      setError('Enter at least two characters to search music.')
      return
    }
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      setResults(await radioAPI.searchAudiusTracks(term))
    } catch {
      setResults([])
      setError('Music search is temporarily unavailable. Please try again.')
    } finally {
      setLoading(false)
    }
  }


  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/radio" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to RADAR Radio
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-50 px-3 py-1.5 text-xs font-bold text-fuchsia-800"><Sparkles className="h-3.5 w-3.5" /> Music & Showbiz</span>
      </div>

      <section className="relative isolate overflow-hidden rounded-3xl bg-slate-950 px-5 py-9 text-white shadow-xl sm:px-9 sm:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 -z-10 h-64 w-64 rounded-full bg-fuchsia-600/30 blur-3xl motion-safe:animate-pulse" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 -z-10 h-56 w-56 rounded-full bg-blue-500/30 blur-3xl" />
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-fuchsia-200"><Disc3 className="h-4 w-4" /> RADAR entertainment desk</p>
        <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-5xl">Your sound. Your artists. Your scene.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">Discover tracks from the Audius catalogue, explore artists and listen to music selected by RADAR. Full catalogue playback and artist-enabled downloads open on the official music provider.</p>
        <form onSubmit={search} role="search" className="mt-7 flex w-full max-w-2xl flex-col gap-2 rounded-2xl bg-white p-2 sm:flex-row">
          <label htmlFor="radar-music-search" className="sr-only">Search songs and artists</label>
          <div className="flex min-w-0 flex-1 items-center gap-2 px-2 text-slate-500">
            <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
            <input id="radar-music-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a song, artist or genre..." className="min-h-11 w-full min-w-0 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0" />
          </div>
          <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"><Search className="h-4 w-4" />{loading ? 'Searching…' : 'Find music'}</button>
        </form>
        {error && <p role="status" className="mt-3 text-sm font-semibold text-amber-200">{error}</p>}
      </section>

      {searched && (
        <section aria-labelledby="music-results-heading" className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Music discovery</p><h2 id="music-results-heading" className="mt-1 text-xl font-extrabold text-slate-950">Search results</h2></div>
            <span className="text-xs text-slate-500">{results.length} tracks found</span>
          </div>
          {loading ? <p className="rounded-xl border border-slate-200 p-5 text-sm text-slate-500">Searching the music catalogue…</p> : results.length === 0 ? <p className="rounded-xl border border-slate-200 p-5 text-sm text-slate-600">No tracks found. Try another song title or artist.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {results.map((track) => (
                <li key={track.audiusId} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  {track.artwork ? <img src={track.artwork} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Music2 className="h-6 w-6" /></span>}
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-950">{track.title}</p><p className="truncate text-xs text-slate-500">{track.artist}</p><p className="mt-1 text-[11px] text-slate-400">{durationLabel(track.duration)} · Audius</p></div>
                  <AudiusLink track={track}><span className="hidden sm:inline">Listen</span><span className="sm:hidden">Open</span></AudiusLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="radar-station-heading" className="mt-9">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Curated by RADAR</p><h2 id="radar-station-heading" className="mt-1 flex items-center gap-2 text-xl font-extrabold text-slate-950"><Headphones className="h-5 w-5 text-emerald-600" /> RADAR Music Radio</h2><p className="mt-1 text-sm text-slate-500">Play the tracks selected for the station right here.</p></div>
          <Link to="/radio" className="text-sm font-bold text-blue-700 hover:underline">Open radio timetable</Link>
        </div>
        {station.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">The station playlist is being prepared. Search the catalogue above to discover music in the meantime.</p> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {station.map((track) => (
              <li key={track.audiusId} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                  {track.artwork ? <img src={track.artwork} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Music2 className="h-6 w-6 text-slate-400" /></span>}
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">{track.title}</p><p className="truncate text-xs text-slate-500">{track.artist}</p></div>
                </div>
                <audio controls preload="none" className="h-10 w-full min-w-0 sm:max-w-[230px]" src={radioAPI.getAudiusStreamUrl(track.audiusId)}>Your browser does not support audio playback.</audio>
              </li>
            ))}
          </ul>
        )}
      </section>


      <section aria-labelledby="radar-approved-releases" className="mt-9">
        <div className="mb-4"><p className="text-xs font-bold uppercase tracking-widest text-fuchsia-700">RADAR approved</p><h2 id="radar-approved-releases" className="mt-1 text-xl font-extrabold text-slate-950">Artists and releases</h2><p className="mt-1 text-sm text-slate-500">Music submitted by artists and reviewed by the RADAR rights desk.</p></div>
        {releases.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No RADAR-approved artist releases have been published yet.</p> : <ul className="grid gap-3 sm:grid-cols-2">{releases.map(release => <li key={release._id} className="flex min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">{release.artworkUrl ? <img src={release.artworkUrl} alt="" loading="lazy" className="h-16 w-16 rounded-xl object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-700"><Music2 className="h-6 w-6" /></span>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-950">{release.title}</p><p className="text-xs text-slate-500">{release.artist?.stageName || 'RADAR artist'} · {release.genre || 'Music'}</p><a href={release.listeningUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">Listen on official provider <ArrowUpRight className="h-3 w-3" /></a></div></li>)}</ul>}
      </section>
      <ArtistPortal />

      <section className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2 sm:p-6">
        <div><h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-950"><ExternalLink className="h-4 w-4 text-blue-700" /> Official listening and downloads</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">Open a search result on Audius to access its official player, artist profile, release details and any download option the rights holder has enabled.</p></div>
        <div><h2 className="text-sm font-extrabold text-slate-950">Showbiz coverage</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">For celebrity interviews, entertainment reporting and music-industry news, browse the newsroom's entertainment stories.</p><Link to="/search?q=entertainment" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">Explore entertainment news <ArrowUpRight className="h-4 w-4" /></Link></div>
      </section>
      <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">Music catalogue metadata and listening pages are provided by Audius. Availability, playback and downloads are controlled by the original artist and provider.</p>
    </main>
  )
}
