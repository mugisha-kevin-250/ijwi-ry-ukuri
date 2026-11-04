import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { writerAPI, publicAPI } from '../../services/api'
import { apiClient } from '../../services/apiClient'
import { useI18n } from '../../context/I18nContext'

export default function WriterArticleEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [categories, setCategories] = useState<any[]>([])
  const [form, setForm] = useState({
    title: '',
    summary: '',
    content: '',
    category: '',
    featuredImage: '',
    tags: ''
  })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [imageFileName, setImageFileName] = useState('')

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
            tags: (article.tags || []).join(', ')
          })
          if (article.featuredImage) {
            const parts = article.featuredImage.split('/')
            setImageFileName(parts[parts.length - 1] || '')
          }
        }
      }).catch(()=>{})
    }
  }, [id])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFileName(file.name)
    setUploading(true)
    setError('')
    const formData = new FormData()
    formData.append('image', file)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiClient.baseURL}/upload/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.message || 'Upload failed')
      }
      const url = json.data?.url
      if (url) setForm((f: any) => ({ ...f, featuredImage: url }))
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
        tags: form.tags.split(',').map((t:any) => t.trim()).filter(Boolean)
      }
      let publishFailed = false
      if (id) {
        await writerAPI.updateArticle(id, payload)
        try {
          await writerAPI.publishArticle(id)
        } catch {
          publishFailed = true
        }
      } else {
        const res = await writerAPI.createArticle(payload)
        const article = ((res.data.data as any)?.article ?? res.data.data) as { _id?: string } | undefined
        if (article?._id) {
          try {
            await writerAPI.publishArticle(article._id)
          } catch {
            publishFailed = true
          }
        }
      }
      if (publishFailed) {
        setError(t('writer.publishFailed'))
        toast.warn(t('writer.publishFailed'))
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
          {categories.map((c:any) => <option key={c._id} value={c._id}>{c.name}</option>)}
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
              <img src={form.featuredImage} alt="" className="h-48 w-full rounded-lg object-cover border border-slate-200" />
              <span className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white text-xs px-2 py-1">Image ready</span>
            </div>
          )}
        </div>
        <button disabled={loading} className="rounded-lg bg-blue-700 px-6 py-2 text-sm font-bold text-white disabled:opacity-50">{loading ? t('writer.saving') : t('writer.save')}</button>
      </form>
    </div>
  )
}
