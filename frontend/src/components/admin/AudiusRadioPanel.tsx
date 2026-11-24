import { useCallback, useEffect, useState } from 'react'
import { Headphones, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { adminAPI, radioAPI, type AudiusTrack } from '../../services/api'
import { serverMessage } from '../../services/apiClient'

export default function AudiusRadioPanel() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AudiusTrack[]>([])
  const [playlist, setPlaylist] = useState<AudiusTrack[]>([])
  const [busy, setBusy] = useState(false)
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    try { setPlaylist(await radioAPI.getAudiusPlaylist()) }
    catch (cause) { setError(serverMessage(cause, 'The station playlist could not be loaded.')) }
  }, [])
  useEffect(() => { void load() }, [load])
  const search = async () => {
    if (query.trim().length < 2) return
    setBusy(true); setError(''); setNotice('')
    try { setResults(await radioAPI.searchAudiusTracks(query.trim())) }
    catch (cause) { setError(serverMessage(cause, 'Audius search is temporarily unavailable.')) }
    finally { setBusy(false) }
  }
  const add = async (track: AudiusTrack) => {
    setWorkingId(track.audiusId); setError(''); setNotice('')
    try { await adminAPI.addAudiusStationTrack(track.audiusId); await load(); setNotice(`Added “${track.title}” to the public radio playlist.`) }
    catch (cause) { setError(serverMessage(cause, 'This track could not be added.')) }
    finally { setWorkingId('') }
  }
  const remove = async (track: AudiusTrack) => {
    setWorkingId(track.audiusId); setError(''); setNotice('')
    try { await adminAPI.removeAudiusStationTrack(track.audiusId); await load(); setNotice(`Removed “${track.title}” from the station playlist.`) }
    catch (cause) { setError(serverMessage(cause, 'This track could not be removed.')) }
    finally { setWorkingId('') }
  }
  const TrackRow = ({ track, action }: { track: AudiusTrack; action: 'add' | 'remove' }) => (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
      {track.artwork ? <img src={track.artwork} alt="" loading="lazy" className="h-12 w-12 rounded-md object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100"><Headphones className="h-5 w-5 text-slate-400" /></span>}
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{track.title}</p><p className="truncate text-xs text-slate-500">{track.artist}</p></div>
      {action === 'add'
        ? <button type="button" onClick={() => void add(track)} disabled={Boolean(workingId)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" />{workingId === track.audiusId ? 'Adding…' : 'Add'}</button>
        : <button type="button" onClick={() => void remove(track)} disabled={Boolean(workingId)} aria-label={`Remove ${track.title}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}
    </li>
  )
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2"><span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Headphones className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900">Audius music station</h2><p className="text-xs text-slate-500">Search Audius and curate the music listeners can play on /radio.</p></div></div>
    <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void search() }}>
      <label className="sr-only" htmlFor="audius-track-search">Search Audius tracks</label>
      <input id="audius-track-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by song or artist" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
      <button type="submit" disabled={busy || query.trim().length < 2} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Search className="h-4 w-4" />{busy ? 'Searching…' : 'Search Audius'}</button>
    </form>
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
    {results.length > 0 && <div className="mt-5"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Search results</h3><ul className="space-y-2">{results.map((track) => <TrackRow key={track.audiusId} track={track} action="add" />)}</ul></div>}
    <div className="mt-5"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">Station playlist ({playlist.length})</h3><button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"><RefreshCw className="h-3.5 w-3.5" />Refresh</button></div>
      {playlist.length === 0 ? <p className="text-sm text-slate-500">No tracks have been added yet.</p> : <ul className="space-y-2">{playlist.map((track) => <TrackRow key={track.audiusId} track={track} action="remove" />)}</ul>}
    </div>
    <p className="mt-3 text-[11px] text-slate-400">Only public Audius tracks are searchable. Adding a track stores its Audius ID and metadata; it does not upload or claim ownership of the audio.</p>
  </section>
}
