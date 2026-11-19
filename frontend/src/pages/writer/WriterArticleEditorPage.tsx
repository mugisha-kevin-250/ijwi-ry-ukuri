import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { writerAPI, publicAPI } from '../../services/api'
import { uploadImage } from '../../services/apiClient'
import MediaImage from '../../components/common/MediaImage'
import StoryVideoField from '../../components/writers/StoryVideoField'
import { useI18n } from '../../context/I18nContext'
import type { ArticleSource, Category } from '../../types'
import { canonicalCategoryId, categoryLabel, resolveCategories } from '../../data/categoryVisuals'

export default function WriterArticleEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState({
    title: '',
    summary: '',
    content: '',
    category: '',
    featuredImage: '',
    // Two lines about the photograph, and the writer is the one who has it:
    // what it shows, and whose picture it is.
    imageCredit: '',
    imageCaption: '',
    // The clip for this story: a link the video already lives behind, or the
    // file itself. Kept as one address in the form; the server decides what the
    // reader's page is allowed to load.
    videoUrl: '',
    tags: ''
  })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [imageFileName, setImageFileName] = useState('')

  // Two things the desk reads alongside the copy: what the story stands on, and
  // what the writer changed. A source is filed with its own request rather than
  // with the story, so it exists the moment it is named; the note travels with a
  // save and is what the review desk sees next to the version it replaces.
  const [status, setStatus] = useState('')
  const [editNote, setEditNote] = useState('')
  const [sources, setSources] = useState<ArticleSource[]>([])
  const [sourceForm, setSourceForm] = useState({
    title: '',
    organization: '',
    url: '',
    type: 'link',
    quote: '',
    accessedAt: ''
  })
  const [sourceBusy, setSourceBusy] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [sourceNotice, setSourceNotice] = useState('')

  useEffect(() => {
    publicAPI.getCategories().then((res:any) => {
      const data = res.data.data
      if (Array.isArray(data)) setCategories(data)
      else if (data?.categories) setCategories(data.categories)
    }).catch(()=>{})
    if (id) {
      writerAPI.getArticle(id).then((res:any) => {
        const article = res.data.data?.article || res.data.data
        if (article) {
          setForm({
            title: article.title || '',
            summary: article.summary || '',
            content: article.content || '',
            category: article.category?._id || article.category || '',
            featuredImage: article.featuredImage || '',
            imageCredit: article.imageCredit || '',
            imageCaption: article.imageCaption || '',
            videoUrl: article.videoUrl || '',
            tags: (article.tags || []).join(', ')
          })
          setStatus(article.status || '')
          setSources(Array.isArray(article.sources) ? article.sources : [])
          if (article.featuredImage) {
            const parts = article.featuredImage.split('/')
            setImageFileName(parts[parts.length - 1] || '')
          }
        }
      }).catch(()=>{})
    }
  }, [id])

  // The database keeps some sections twice, once in English and once in
  // Kinyarwanda. Writers pick the canonical copy so a story never lands in a
  // duplicate, and an old story opened for editing is moved on save.
  const sections = useMemo(() => resolveCategories(categories), [categories])

  useEffect(() => {
    if (!categories.length || !form.category) return
    setForm((f: any) => {
      const canonical = canonicalCategoryId(categories, f.category)
      return canonical === f.category ? f : { ...f, category: canonical }
    })
  }, [categories, form.category])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFileName(file.name)
    setUploading(true)
    setError('')
    try {
      const url = await uploadImage(file)
      setForm((f: any) => ({ ...f, featuredImage: url }))
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveImage = () => {
    setForm((f: any) => ({ ...f, featuredImage: '' }))
    setImageFileName('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = {
        title: form.title,
        summary: form.summary,
        content: form.content,
        category: form.category,
        featuredImage: form.featuredImage,
        // A credit without a picture credits nothing, so the lines travel with
        // the image they describe and are cleared when it is removed.
        imageCredit: form.featuredImage ? form.imageCredit.trim() : '',
        imageCaption: form.featuredImage ? form.imageCaption.trim() : '',
        videoUrl: form.videoUrl.trim(),
        tags: form.tags.split(',').map((t:any) => t.trim()).filter(Boolean),
        // Only the desk's earlier copy is recorded, and this says what the new
        // one fixes. A draft has no published version to answer for.
        editNote: editNote.trim() || undefined
      }
      let publishRefusal = ''
      if (id) {
        await writerAPI.updateArticle(id, payload)
        try {
          await writerAPI.publishArticle(id)
        } catch (err: any) {
          // The story saved either way, so the writer is told the real reason it
          // did not go live rather than a generic failure.
          publishRefusal = err?.response?.data?.message || t('writer.publishFailed')
        }
      } else {
        const res = await writerAPI.createArticle(payload)
        const article = ((res.data.data as any)?.article ?? res.data.data) as { _id?: string } | undefined
        if (article?._id) {
          try {
            await writerAPI.publishArticle(article._id)
          } catch (err: any) {
            publishRefusal = err?.response?.data?.message || t('writer.publishFailed')
          }
        }
      }
      if (publishRefusal) {
        setError(publishRefusal)
        toast.warn(publishRefusal)
        navigate('/writer/articles')
      } else {
        toast.success(id ? t('writer.editArticle') : t('writer.save'))
        navigate('/writer/dashboard')
      }
    } catch (err: any) {
      console.error(err)
      const message = err.response?.data?.message || t('writer.saveFailed')
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const addSource = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    setSourceBusy('add')
    setSourceError('')
    setSourceNotice('')
    try {
      const res = await writerAPI.addSource(id, {
        title: sourceForm.title.trim(),
        organization: sourceForm.organization.trim(),
        url: sourceForm.url.trim(),
        type: sourceForm.type as ArticleSource['type'],
        quote: sourceForm.quote.trim(),
        accessedAt: sourceForm.accessedAt || undefined,
      })
      setSources((res.data.data as any)?.sources || [])
      setSourceForm({ title: '', organization: '', url: '', type: 'link', quote: '', accessedAt: '' })
      setSourceNotice(t('writer.sourceAdded'))
    } catch (err: any) {
      // The API answers with the sentence a writer can act on - no address and
      // no name, or the twenty-source ceiling - so that is what goes on screen.
      setSourceError(err?.response?.data?.message || t('writer.sourceAddFailed'))
    } finally {
      setSourceBusy('')
    }
  }

  const dropSource = async (sourceId?: string) => {
    if (!id || !sourceId) return
    setSourceBusy(sourceId)
    setSourceError('')
    setSourceNotice('')
    try {
      const res = await writerAPI.removeSource(id, sourceId)
      setSources((res.data.data as any)?.sources || [])
    } catch (err: any) {
      setSourceError(err?.response?.data?.message || t('writer.sourceRemoveFailed'))
    } finally {
      setSourceBusy('')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-xl font-extrabold">{id ? t('writer.editArticle') : t('writer.newArticle')}</h1>
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('writer.title')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
        <textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder={t('writer.summary')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={3} required />
        <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder={t('writer.content')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={12} required />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required>
          <option value="">{t('writer.category')}</option>
          {sections.map(({ category }) => <option key={category._id} value={category._id}>{categoryLabel(category, t)}</option>)}
        </select>
        <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder={t('writer.tags')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <div>
          <label className="mb-2 block text-sm font-semibold">{t('writer.featuredImage')}</label>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 transition-colors">
              {imageFileName ? imageFileName : t('writer.chooseImage')}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} className="hidden" />
            </label>
            {imageFileName && (
              <button type="button" onClick={handleRemoveImage} className="text-xs text-red-600 hover:underline">
                Remove
              </button>
            )}
          </div>
          {uploading && <p className="mt-2 text-xs text-slate-500">{t('writer.uploading')}</p>}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {form.featuredImage && (
            <div className="mt-3 relative">
              <MediaImage src={form.featuredImage} alt="" className="h-48 w-full rounded-lg object-cover border border-slate-200" />
              <span className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white text-xs px-2 py-1">Image ready</span>
            </div>
          )}
          {/* Two honest lines about one photograph. What it shows, and whose it
              is - a picture the newsroom did not take has to say so. */}
          {form.featuredImage && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">{t('writer.imageCaption')}</label>
                <input
                  value={form.imageCaption}
                  onChange={(e) => setForm({ ...form, imageCaption: e.target.value })}
                  maxLength={240}
                  placeholder={t('writer.imageCaptionHint')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">{t('writer.imageCredit')}</label>
                <input
                  value={form.imageCredit}
                  onChange={(e) => setForm({ ...form, imageCredit: e.target.value })}
                  maxLength={160}
                  placeholder={t('writer.imageCreditHint')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </div>
        <StoryVideoField value={form.videoUrl} onChange={(videoUrl) => setForm({ ...form, videoUrl })} />
        {/* What the story is standing on. Filed per source rather than with the
            save, because a source is a fact about the reporting and not a line
            of the copy: it is on the record the moment it is named, and the desk
            - never the writer - is the one who says it was checked. */}
        {id && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-800">{t('writer.sources')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('writer.sourcesHint')}</p>

            {sources.length > 0 && (
              <ul className="mt-3 space-y-2">
                {sources.map((source, index) => (
                  <li key={source._id || `source-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-white p-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{source.title || source.organization || source.url}</p>
                      <p className="text-xs text-slate-500">
                        {t(`articles.sourceType.${source.type || 'link'}`)}
                        {source.organization ? ` · ${source.organization}` : ''}
                        {' · '}
                        {source.verificationStatus === 'verified'
                          ? t('articles.sourceVerified')
                          : source.verificationStatus === 'rejected'
                            ? t('articles.sourceRejected')
                            : t('articles.sourcePending')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void dropSource(source._id)}
                      disabled={sourceBusy !== ''}
                      className="shrink-0 text-xs font-semibold text-red-600 hover:underline disabled:opacity-40"
                    >
                      {sourceBusy === source._id ? t('writer.removing') : t('writer.removeSource')}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={addSource} className="mt-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={sourceForm.title}
                  onChange={(e) => setSourceForm({ ...sourceForm, title: e.target.value })}
                  maxLength={200}
                  placeholder={t('writer.sourceTitle')}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={sourceForm.organization}
                  onChange={(e) => setSourceForm({ ...sourceForm, organization: e.target.value })}
                  maxLength={160}
                  placeholder={t('writer.sourceOrg')}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={sourceForm.url}
                  onChange={(e) => setSourceForm({ ...sourceForm, url: e.target.value })}
                  placeholder={t('writer.sourceUrl')}
                  inputMode="url"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:col-span-2"
                />
                <select
                  value={sourceForm.type}
                  onChange={(e) => setSourceForm({ ...sourceForm, type: e.target.value })}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {['link', 'document', 'interview', 'official-data', 'observation'].map((kind) => (
                    <option key={kind} value={kind}>{t(`articles.sourceType.${kind}`)}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={sourceForm.accessedAt}
                  onChange={(e) => setSourceForm({ ...sourceForm, accessedAt: e.target.value })}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <textarea
                  value={sourceForm.quote}
                  onChange={(e) => setSourceForm({ ...sourceForm, quote: e.target.value })}
                  rows={2}
                  maxLength={600}
                  placeholder={t('writer.sourceQuote')}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:col-span-2"
                />
              </div>
              {sourceError && <p role="alert" className="text-xs font-semibold text-red-700">{sourceError}</p>}
              {sourceNotice && <p className="text-xs font-semibold text-emerald-700">{sourceNotice}</p>}
              <button
                type="submit"
                disabled={sourceBusy !== '' || (!sourceForm.title.trim() && !sourceForm.url.trim())}
                className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {sourceBusy === 'add' ? t('writer.addingSource') : t('writer.addSource')}
              </button>
            </form>
          </div>
        )}

        {/* A live story rewritten is a story somebody already shared. The note
            says what the new copy answers, and the desk reads it with the
            version it replaces. */}
        {id && status !== 'draft' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t('writer.editNote')}</label>
            <input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              maxLength={300}
              placeholder={t('writer.editNoteHint')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        )}

        <button disabled={loading} className="rounded-lg bg-blue-700 px-6 py-2 text-sm font-bold text-white disabled:opacity-50">{loading ? t('writer.saving') : t('writer.save')}</button>
      </form>
    </div>
  )
}
