import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { uploadImage, uploadVideo } from '../../services/apiClient'
import { holdProgress } from '../../utils/apiActivity'
import { useI18n } from '../../context/I18nContext'
import MediaImage from '../common/MediaImage'
import { previewFor } from './StoryVideoField'
import type { StoryMedia } from '../../types'

interface Props {
  value: StoryMedia[]
  onChange: (media: StoryMedia[]) => void
  /** The single clip field, so the file button can hand a long clip to it. */
  max?: number
}

const IMAGE_ADDRESS = /(^\/uploads\/[^\s]*\.(?:jpe?g|png|webp|gif)$)|(https?:\/\/\S+\.(?:jpe?g|png|webp|gif)(?:\?|#|$))/i

/**
 * A host typed without a scheme means the https address of it.
 *
 * A picture copied out of a chat app arrives as `apimg.example.org/a.jpg`, and a
 * browser reads that as a path inside this site, so the preview breaks and the
 * author concludes the box does not work. The server fills the scheme in the same
 * way when it stores the address (urlGuard.withHttpsScheme), which is what keeps
 * what the writer previews and what the reader finally loads the same picture.
 * Anything that already names a scheme, or a `/uploads` path of our own, is left
 * exactly as it was given.
 */
const withScheme = (value: string): string =>
  (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('/') ? value : `https://${value}`)

/**
 * The pictures and clips after the one at the top of the story.
 *
 * Each row is one item, and it is added the same way the single fields above it
 * are: paste where it lives, or send the file and take the address back. The
 * order here is the order the reader sees, so a row can be moved as well as
 * removed, and every row carries its own two lines - what it shows and whose it
 * is - because the second photograph is where a credit gets forgotten.
 *
 * What is loadable is the server's decision, not this form's. The preview under
 * a typed address is only so the author can see what they pasted; the story is
 * saved with the address the reader's page is actually allowed to load.
 */
export default function StoryMediaField({ value, onChange, max = 12 }: Props) {
  const { t } = useI18n()
  const items = Array.isArray(value) ? value : []
  const [kind, setKind] = useState<'image' | 'video'>('image')
  const [address, setAddress] = useState('')
  const [uploading, setUploading] = useState(false)
  const [problem, setProblem] = useState('')

  const typed = address.trim()
  const typedPreview = kind === 'video' ? previewFor(typed) : null

  const add = () => {
    if (!typed) return
    if (items.length >= max) {
      setProblem(t('writer.mediaTooMany'))
      return
    }
    onChange([...items, { kind, url: typed }])
    setAddress('')
    setProblem('')
  }

  const drop = (index: number) => onChange(items.filter((_, position) => position !== index))

  const patch = (index: number, fields: Partial<StoryMedia>) =>
    onChange(items.map((item, position) => (position === index ? { ...item, ...fields } : item)))

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    onChange(next)
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProblem('')
    setUploading(true)
    // A file leaves the laptop more slowly than an answer comes back, and the
    // site has one progress line. It is held here because an upload is fetch,
    // not one of the API requests the counter already sees.
    const release = holdProgress()
    try {
      setAddress(kind === 'video' ? await uploadVideo(file) : await uploadImage(file))
    } catch (error: any) {
      setProblem(error?.message || t('writer.mediaUploadFailed'))
    } finally {
      release()
      setUploading(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-800">{t('writer.media')}</p>
      <p className="mt-1 text-xs text-slate-500">{t('writer.mediaHint')}</p>

      {items.length > 0 && (
        <ul className="mt-3 space-y-3">
          {items.map((item, index) => {
            const preview = item.kind === 'video'
              ? previewFor(item.embedUrl || item.url)
              : { kind: 'file' as const, embed: withScheme(item.url) }
            return (
              <li key={item._id || `${item.kind}-${index}`} className="rounded-lg bg-white p-3">
                <div className="flex items-start gap-3">
                  <div className="w-28 shrink-0 sm:w-40">
                    {item.kind === 'video' && preview.kind === 'file' ? (
                      <video src={preview.embed} controls playsInline className="aspect-video w-full rounded bg-black" />
                    ) : item.kind === 'video' ? (
                      <iframe
                        src={preview.embed}
                        title={item.caption || t('writer.mediaVideo')}
                        className="aspect-video w-full rounded border-0 bg-black"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : (
                      <MediaImage src={preview.embed} alt={item.caption || ''} className="h-20 w-full rounded object-cover" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {item.kind === 'video' ? t('writer.mediaVideo') : t('writer.mediaImage')}
                    </p>
                    <input
                      value={item.caption || ''}
                      onChange={(event) => patch(index, { caption: event.target.value })}
                      maxLength={240}
                      placeholder={t('writer.mediaCaption')}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    />
                    <input
                      value={item.credit || ''}
                      onChange={(event) => patch(index, { credit: event.target.value })}
                      maxLength={160}
                      placeholder={t('writer.mediaCredit')}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    />
                    <p className="break-all text-[11px] text-slate-400">{item.url}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={t('writer.mediaUp')}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === items.length - 1}
                      aria-label={t('writer.mediaDown')}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => drop(index)}
                      aria-label={t('writer.mediaRemove')}
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {(['image', 'video'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={`rounded-md px-3 py-1 text-xs font-bold ${kind === option ? 'bg-[#062b52] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {option === 'video' ? t('writer.mediaVideo') : t('writer.mediaImage')}
              </button>
            ))}
          </div>
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
            {uploading ? t('writer.mediaUploading') : t('writer.mediaChooseFile')}
            <input
              type="file"
              accept={kind === 'video' ? 'video/mp4,video/webm,video/ogg,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif'}
              onChange={handleFile}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={address}
            onChange={(event) => { setAddress(event.target.value); setProblem('') }}
            inputMode="url"
            maxLength={500}
            placeholder={t('writer.mediaAddress')}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={add}
            disabled={!typed || uploading || items.length >= max}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('writer.mediaAdd')}
          </button>
        </div>

        {/* What the author pasted, answered with the thing itself rather than a
            paragraph about it, so a wrong link is seen before it is saved. */}
        {typed && kind === 'image' && IMAGE_ADDRESS.test(withScheme(typed)) && (
          <MediaImage src={withScheme(typed)} alt="" className="mt-1 h-24 w-auto rounded-lg object-cover" />
        )}
        {typed && kind === 'video' && typedPreview && typedPreview.kind === 'file' && (
          <video src={typedPreview.embed} controls playsInline className="mt-1 aspect-video w-full max-w-md rounded-lg bg-black" />
        )}
        {typed && kind === 'video' && typedPreview && (typedPreview.kind === 'youtube' || typedPreview.kind === 'vimeo') && (
          <iframe
            src={typedPreview.embed}
            title={t('writer.mediaVideo')}
            className="mt-1 aspect-video w-full max-w-md rounded-lg border-0 bg-black"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        )}

        {typed && kind === 'image' && !IMAGE_ADDRESS.test(withScheme(typed)) && (
          <p role="alert" className="mt-1 text-xs font-semibold text-amber-700">{t('writer.addressNotPlayable')}</p>
        )}
        {typed && kind === 'video' && !typedPreview?.embed && (
          <p role="alert" className="mt-1 text-xs font-semibold text-amber-700">{t('writer.addressNotPlayable')}</p>
        )}

        {problem && <p role="alert" className="text-xs font-semibold text-red-700">{problem}</p>}
        <p className="text-xs text-slate-500">{t('writer.mediaNote')}</p>
      </div>
    </div>
  )
}
