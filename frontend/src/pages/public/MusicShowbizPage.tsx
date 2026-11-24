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

/** A public music discovery desk. Full catalogue listening and artist-enabled downloads stay on Audius. */
export default function MusicShowbizPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AudiusTrack[]>([])
  const [station, setStation] = useState<AudiusTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const { user } = useAuth()
  const [releases, setReleases] = useState<any[]>([])
  const [artist, setArtist] = useState<any>(null)
  const [artistForm, setArtistForm] = useState({ stageName: '', biography: '', country: '', genres: '', officialUrl: '' })
  const [releaseForm, setReleaseForm] = useState({ title: '', description: '', genre: '', language: '', artworkUrl: '', listeningUrl: '', rightsBasis: 'owner', rightsEvidenceUrl: '', rightsDeclaration: false })
  const [musicStatus, setMusicStatus] = useState('')
  const [musicError, setMusicError] = useState('')
  const [musicBusy, setMusicBusy] = useState(false)
  const [deskQueue, setDeskQueue] = useState<{ artists: any[]; releases: any[] }>({ artists: [], releases: [] })

  useSeo({
    title: 'RADAR Music & Showbiz — Music streaming and discovery',
    description: 'Discover music, explore artists and listen to the RADAR curated music station. Open official artist pages for full playback and available downloads.',
    path: '/music',
  })

  useEffect(() => {
    let active = true
    apiClient.get('/music/releases').then(response => { if (active) setReleases(response.data.data?.releases || []) }).catch(() => {})
    if (user) apiClient.get('/music/artists/me').then(response => { if (active) setArtist(response.data.data?.artist || null) }).catch(() => {})
    if (user?.role === 'ADMIN') apiClient.get('/music/desk/queue').then(response => { if (active) setDeskQueue(response.data.data || { artists: [], releases: [] }) }).catch(() => {})
    radioAPI.getAudiusPlaylist()
      .then((tracks) => { if (active) setStation(tracks) })
      .catch(() => { if (active) setError('The RADAR station could not load right now.') })
    return () => { active = false }
  }, [user])

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


  const submitArtist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMusicError(''); setMusicStatus(''); setMusicBusy(true)
    try {
      const response = await apiClient.post('/music/artists/apply', { ...artistForm, genres: artistForm.genres.split(',').map(value => value.trim()).filter(Boolean) })
      setArtist(response.data.data?.artist || null); setMusicStatus('Artist application sent. The RADAR rights desk must verify your profile before you can submit releases.')
    } catch (err: any) { setMusicError(err?.response?.data?.message || 'Could not submit artist application.') }
    finally { setMusicBusy(false) }
  }
  const submitRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMusicError(''); setMusicStatus(''); setMusicBusy(true)
    try {
      await apiClient.post('/music/releases', releaseForm)
      setMusicStatus('Release submitted for editorial and copyright review. It will appear publicly only after approval.')
      setReleaseForm({ title: '', description: '', genre: '', language: '', artworkUrl: '', listeningUrl: '', rightsBasis: 'owner', rightsDeclaration: false })
    } catch (err: any) { setMusicError(err?.response?.data?.message || 'Could not submit this release.') }
    finally { setMusicBusy(false) }
  }
  const reviewMusic = async (kind: 'artists' | 'releases', id: string, status: string) => {
    setMusicError(''); setMusicStatus('')
    try {
      await apiClient.put(kind === 'artists' ? `/music/desk/artists/${id}/review` : `/music/desk/releases/${id}/review`, { status, note: 'Reviewed in RADAR music desk' })
      const response = await apiClient.get('/music/desk/queue')
      setDeskQueue(response.data.data || { artists: [], releases: [] })
      setMusicStatus('Music desk decision saved.')
      if (kind === 'artists' && user) { const mine = await apiClient.get('/music/artists/me'); setArtist(mine.data.data?.artist || null) }
    } catch (err: any) { setMusicError(err?.response?.data?.message || 'Could not save the review decision.') }
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
      <section aria-labelledby="artist-onboarding" className="mt-9 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4"><p className="text-xs font-bold uppercase tracking-widest text-blue-700">For musicians</p><h2 id="artist-onboarding" className="mt-1 text-xl font-extrabold text-slate-950">Submit your music to RADAR</h2><p className="mt-1 text-sm text-slate-600">Apply for an artist profile, then submit official listening links for review. RADAR does not host or redistribute audio files in this release.</p></div>
        {!user ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Sign in to apply for an artist profile and manage your releases. <Link to="/login" className="font-bold text-blue-700 underline">Sign in</Link></p> : artist ? <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm font-bold text-slate-900">{artist.stageName}</p><p className="mt-1 text-xs text-slate-600">Artist profile status: <span className="font-bold capitalize">{artist.status}</span></p>{artist.status === 'verified' ? <form onSubmit={submitRelease} className="mt-5 grid gap-3 sm:grid-cols-2"><h3 className="font-bold sm:col-span-2">Submit a release</h3><input required maxLength={160} placeholder="Song or release title" value={releaseForm.title} onChange={e => setReleaseForm({ ...releaseForm, title: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input placeholder="Genre" value={releaseForm.genre} onChange={e => setReleaseForm({ ...releaseForm, genre: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input placeholder="Language" value={releaseForm.language} onChange={e => setReleaseForm({ ...releaseForm, language: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input placeholder="Artwork URL (optional)" value={releaseForm.artworkUrl} onChange={e => setReleaseForm({ ...releaseForm, artworkUrl: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" /><input required placeholder="Official listening URL" value={releaseForm.listeningUrl} onChange={e => setReleaseForm({ ...releaseForm, listeningUrl: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" /><textarea placeholder="Release description" value={releaseForm.description} onChange={e => setReleaseForm({ ...releaseForm, description: e.target.value })} className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" /><select value={releaseForm.rightsBasis} onChange={e => setReleaseForm({ ...releaseForm, rightsBasis: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="owner">I own the rights</option><option value="written_permission">I have written permission</option><option value="licensed">I hold a licence</option></select>{releaseForm.rightsBasis !== "owner" && <input required placeholder="URL to permission / licence evidence" value={releaseForm.rightsEvidenceUrl} onChange={e => setReleaseForm({ ...releaseForm, rightsEvidenceUrl: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />}<label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600 sm:col-span-2"><input type="checkbox" checked={releaseForm.rightsDeclaration} onChange={e => setReleaseForm({ ...releaseForm, rightsDeclaration: e.target.checked })} className="mt-0.5" /> I confirm I have the legal right to submit this release and that the information is accurate.</label><button disabled={musicBusy || !releaseForm.rightsDeclaration} className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{musicBusy ? 'Submitting…' : 'Submit release for review'}</button></form> : <p className="mt-2 text-sm text-slate-600">Your application is awaiting RADAR verification. Release submissions open after approval.</p> : <form onSubmit={submitArtist} className="grid gap-3 sm:grid-cols-2"><input required maxLength={100} placeholder="Artist / stage name" value={artistForm.stageName} onChange={e => setArtistForm({ ...artistForm, stageName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input placeholder="Country" value={artistForm.country} onChange={e => setArtistForm({ ...artistForm, country: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input placeholder="Genres, separated by commas" value={artistForm.genres} onChange={e => setArtistForm({ ...artistForm, genres: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" /><input placeholder="Official artist page (optional)" value={artistForm.officialUrl} onChange={e => setArtistForm({ ...artistForm, officialUrl: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" /><textarea placeholder="Short artist biography" value={artistForm.biography} onChange={e => setArtistForm({ ...artistForm, biography: e.target.value })} className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" /><button disabled={musicBusy} className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{musicBusy ? 'Submitting…' : 'Apply for artist profile'}</button></form>}
        {musicStatus && <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">{musicStatus}</p>}{musicError && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{musicError}</p>}
      </section>
      {user?.role === 'ADMIN' && <section aria-labelledby="music-desk-heading" className="mt-9 rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 id="music-desk-heading" className="text-lg font-extrabold text-slate-950">RADAR music rights desk</h2><p className="mt-1 text-sm text-slate-600">Administrator review queue for artist applications, releases and takedown requests.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><div><h3 className="font-bold text-slate-900">Artist applications ({deskQueue.artists.length})</h3>{deskQueue.artists.map(item => <div key={item._id} className="mt-2 rounded-xl border bg-white p-3"><p className="text-sm font-bold">{item.stageName}</p><p className="text-xs text-slate-500">{item.user?.email || ''}</p><div className="mt-2 flex gap-2"><button onClick={() => reviewMusic('artists', item._id, 'verified')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Verify</button><button onClick={() => reviewMusic('artists', item._id, 'rejected')} className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-bold text-slate-800">Reject</button></div></div>)}</div><div><h3 className="font-bold text-slate-900">Release / takedown queue ({deskQueue.releases.length})</h3>{deskQueue.releases.map(item => <div key={item._id} className="mt-2 rounded-xl border bg-white p-3"><p className="text-sm font-bold">{item.title}</p><p className="text-xs text-slate-500">{item.artist?.stageName || 'Artist'} · {item.status}</p><a href={item.listeningUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-700 underline">Review official release</a><div className="mt-2 flex gap-2"><button onClick={() => reviewMusic('releases', item._id, 'approved')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">{item.status === 'takedown_pending' ? 'Keep published' : 'Approve'}</button><button onClick={() => reviewMusic('releases', item._id, item.status === 'takedown_pending' ? 'removed' : 'rejected')} className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-bold text-slate-800">{item.status === 'takedown_pending' ? 'Remove' : 'Reject'}</button></div></div>)}</div></div></section>}

      <section className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2 sm:p-6">
        <div><h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-950"><ExternalLink className="h-4 w-4 text-blue-700" /> Official listening and downloads</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">Open a search result on Audius to access its official player, artist profile, release details and any download option the rights holder has enabled.</p></div>
        <div><h2 className="text-sm font-extrabold text-slate-950">Showbiz coverage</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">For celebrity interviews, entertainment reporting and music-industry news, browse the newsroom's entertainment stories.</p><Link to="/search?q=entertainment" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">Explore entertainment news <ArrowUpRight className="h-4 w-4" /></Link></div>
      </section>
      <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">Music catalogue metadata and listening pages are provided by Audius. Availability, playback and downloads are controlled by the original artist and provider.</p>
    </main>
  )
}
