import { useState } from 'react'
import { resolveMediaUrl, uploadVideo } from '../../services/apiClient'
import { holdProgress } from '../../utils/apiActivity'
import { useI18n } from '../../context/I18nContext'

interface Props {
  /** What the author pasted, or the /uploads path an upload handed back. */
  value: string
  onChange: (value: string) => void
}

const YOUTUBE = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/(?:embed|shorts|live|v)\/)([A-Za-z0-9_-]{11})/i
const VIMEO = /^(https?:\/\/)?(www\.|player\.)?vimeo\.com\/(?:[^/]*\/)*(\d{6,12})/i
const FILE = /\.(mp4|webm|ogv|ogg|m4v|mov)(\?|#|$)/i

/**
 * What the box under the address is going to be while the author types.
 *
 * The server is the authority: it rebuilds an embed from the video id and
 * refuses anything it does not know, and that answer is what reaches the reader.
 * This only decides what the writer sees before saving, so a paste is answered
 * with a player rather than a paragraph of text - and an address that matches
 * nothing stays a plain line instead of pretending to be a video.
 */
function previewFor(url: string): { kind: 'youtube' | 'vimeo' | 'file' | 'none'; embed: string } {
  const value = url.trim()
  if (!value) return { kind: 'none', embed: '' }
  const youtube = YOUTUBE.exec(value)
  if (youtube) return { kind: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${youtube[4]}?rel=0&playsinline=1` }
  const vimeo = VIMEO.exec(value)
  if (vimeo) return { kind: 'vimeo', embed: `https://player.vimeo.com/video/${vimeo[3]}?dnt=1` }
  if (FILE.test(value)) {
    // A /uploads path is served by the API, not by this origin, so it is
    // resolved exactly the way a photograph on the same story is.
    return { kind: 'file', embed: resolveMediaUrl(value) }
  }
  return { kind: 'none', embed: '' }
}

/**
 * The clip attached to a story. One box for both ways of doing it: paste where
 * the video already lives, or send the file itself. Whichever it is, the writer
 * sees what the reader will get before saving.
 */
export default function StoryVideoField({ value, onChange }: Props) {
  const { t } = useI18n()
  const [uploading, setUploading] = useState(false)
  const [problem, setProblem] = useState('')

  const preview = previewFor(value)

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProblem('')
    setUploading(true)
    // A clip takes longer to leave the laptop than an answer the server can
    // send back at once, and the site has one progress indicator. It is held
    // open here because this upload is fetch, not an API request the counter sees.
    const release = holdProgress()
    try {
      onChange(await uploadVideo(file))
    } catch (error: any) {
      setProblem(error?.message || t('writer.videoUploadFailed'))
    } finally {
      release()
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-semibold">{t('writer.video')}</label>
      <input
        value={value}
        onChange={(event) => {
          setProblem('')
          onChange(event.target.value)
        }}
        inputMode="url"
        maxLength={500}
        placeholder={t('writer.videoHint')}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
          {uploading ? t('writer.videoUploading') : t('writer.chooseVideo')}
          <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" onChange={handleFile} className="hidden" disabled={uploading} />
        </label>
        {value && (
          <button type="button" onClick={() => { setProblem(''); onChange('') }} className="text-xs font-semibold text-red-600 hover:underline">
            {t('writer.videoRemove')}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">{t('writer.videoNote')}</p>
      {problem && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{problem}</p>}

      {preview.kind === 'file' && (
        <video src={preview.embed} controls playsInline className="mt-3 aspect-video w-full rounded-lg border border-slate-200 bg-black" />
      )}
      {preview.kind !== 'none' && preview.kind !== 'file' && (
        <iframe
          src={preview.embed}
          title={t('writer.video')}
          className="mt-3 aspect-video w-full rounded-lg border-0 bg-black"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      )}
    </div>
  )
}
