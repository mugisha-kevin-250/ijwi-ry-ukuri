import { useState } from 'react'
import { Check, ImageOff, Search, Sparkles } from 'lucide-react'
import { adminAPI, type VerifiedPhoto } from '../../services/api'

/** The three fields a story needs to carry a picture honestly. */
export interface PhotoAttachment {
  url: string
  credit: string
  sourceUrl: string
}

function megapixels(photo: VerifiedPhoto) {
  const pixels = (Number(photo.width) || 0) * (Number(photo.height) || 0)
  if (!pixels) return ''
  return pixels >= 1000000 ? `${(pixels / 1000000).toFixed(1)} MP` : `${Math.round(pixels / 1000)}k px`
}

/**
 * Picking a photograph for a story the machine wrote.
 *
 * The promise made to the admin is small and specific: every thumbnail here is
 * a picture this server actually downloaded, and the numbers under it are read
 * off the bytes of that download rather than from a caption. So a 480-pixel
 * snapshot cannot arrive labelled as a 4K one, and a link that 404s is reported
 * as dropped instead of quietly missing from the strip.
 *
 * Commons results carry their own contributor and licence, which is what makes
 * attaching a picture to a published story defensible at all.
 */
export default function AiPhotoPicker({
  topic,
  region,
  attached,
  onAttach,
  onDetach,
}: {
  topic: string
  region?: string
  attached: PhotoAttachment | null
  onAttach: (photo: PhotoAttachment) => void
  onDetach: () => void
}) {
  const [photos, setPhotos] = useState<VerifiedPhoto[]>([])
  const [dropped, setDropped] = useState<{ url: string; reason: string }[]>([])
  const [note, setNote] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [failure, setFailure] = useState('')

  const find = async () => {
    if (topic.trim().length < 6) {
      setFailure('Say what the picture should show first — the topic above is what gets searched.')
      return
    }
    setSearching(true)
    setFailure('')
    try {
      const result = await adminAPI.searchAiPhotos({ topic: topic.trim(), region: region?.trim() || undefined })
      setPhotos(result.photos)
      setDropped(result.dropped)
      setNote(result.note || '')
      setSearched(true)
    } catch (err: any) {
      setFailure(err?.response?.data?.message || 'The picture search failed. Try again in a moment.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-500" />
          <p className="text-xs font-bold text-slate-700">Pictures for this story, checked before they are shown</p>
        </div>
        <button
          type="button"
          onClick={() => void find()}
          disabled={searching}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {searching ? 'Fetching and measuring…' : photos.length ? 'Search again' : 'Find pictures'}
        </button>
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
        Searches Wikimedia Commons and the links Gemini names, then keeps only what actually loads as an image. Each
        one asks its host for the largest copy up to 4K on the long side — nothing is invented, upscaled or claimed
        beyond the file that exists.
      </p>

      {searching && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-md bg-slate-200" />
          ))}
        </div>
      )}

      {failure && (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {failure}
        </p>
      )}

      {!searching && searched && photos.length === 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <ImageOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            No picture here could be fetched for “{topic.trim()}”.
            {note ? ` ${note}` : ' Write your own topic in the box above, or attach one of your own in the editor.'}
          </span>
        </p>
      )}

      {!searching && photos.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => {
            const picked = attached?.url === photo.url;
            return (
              <button
                key={photo.url}
                type="button"
                onClick={() => onAttach({ url: photo.url, credit: photo.credit, sourceUrl: photo.pageUrl || photo.originalUrl || photo.url })}
                aria-pressed={picked}
                className={`group overflow-hidden rounded-md border bg-white text-left shadow-sm transition ${
                  picked ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <span className="relative block aspect-[16/9] w-full overflow-hidden bg-slate-100">
                  <img
                    src={photo.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {photo.width}×{photo.height}
                    {photo.atUhd ? ' · 4K' : ''}
                  </span>
                  {picked && (
                    <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </span>
                <span className="block px-2 py-1.5">
                  <span className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-700">{photo.why || photo.source}</span>
                  <span className="mt-1 block truncate text-[10px] text-slate-500" title={photo.credit}>
                    {photo.credit || 'No named author'}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    {[megapixels(photo), photo.served].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {attached?.url && !searching && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-emerald-900">
            <span className="font-bold">Attached.</span> {attached.credit || 'Source image'}
            {attached.sourceUrl ? ` — ${attached.sourceUrl}` : ''}
          </p>
          <button
            type="button"
            onClick={onDetach}
            className="rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100"
          >
            Take it off
          </button>
        </div>
      )}

      {dropped.length > 0 && !searching && (
        <details className="mt-3 text-[11px] text-slate-600">
          <summary className="cursor-pointer font-semibold text-amber-800">
            {dropped.length} link{dropped.length === 1 ? '' : 's'} the model named did not survive the check
          </summary>
          <ul className="mt-1.5 space-y-1">
            {dropped.map((item) => (
              <li key={item.url} className="break-all">
                {item.reason}
                <span className="text-slate-400"> — {item.url}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
