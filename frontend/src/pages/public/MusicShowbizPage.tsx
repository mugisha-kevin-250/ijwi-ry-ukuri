import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Disc3, ExternalLink, Headphones, Music2, Search, Sparkles } from 'lucide-react'
import { radioAPI, type AudiusTrack } from '../../services/api'
import { useSeo } from '../../utils/useSeo'

function durationLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Duration unavailable'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function AudiusLink({ track, children }: { track: AudiusTrack; children: React.ReactNode }) {
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

  useSeo({
    title: 'RADAR Music & Showbiz — Music streaming and discovery',
    description: 'Discover music, explore artists and listen to the RADAR curated music station. Open official artist pages for full playback and available downloads.',
    path: '/music',
  })

  useEffect(() => {
    let active = true
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

      <section className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2 sm:p-6">
        <div><h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-950"><ExternalLink className="h-4 w-4 text-blue-700" /> Official listening and downloads</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">Open a search result on Audius to access its official player, artist profile, release details and any download option the rights holder has enabled.</p></div>
        <div><h2 className="text-sm font-extrabold text-slate-950">Showbiz coverage</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">For celebrity interviews, entertainment reporting and music-industry news, browse the newsroom's entertainment stories.</p><Link to="/articles?category=entertainment" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">Explore entertainment news <ArrowUpRight className="h-4 w-4" /></Link></div>
      </section>
      <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">Music catalogue metadata and listening pages are provided by Audius. Availability, playback and downloads are controlled by the original artist and provider.</p>
    </main>
  )
}
