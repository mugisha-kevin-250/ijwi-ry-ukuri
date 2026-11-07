import { toast } from 'react-toastify'

interface ShareOptions {
  url: string
  title?: string
  text?: string
  copiedLabel: string
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    // Clipboard access needs a secure context and focus, neither of which an
    // installed PWA always has — the old selection trick still works there.
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.top = '-100px'
    document.body.appendChild(field)
    field.select()
    document.execCommand('copy')
    field.remove()
  }
}

/**
 * Opens the platform share sheet when there is a real one, and always ends with
 * the link copied plus a toast, so the reader is never left watching a button do
 * nothing.
 */
export async function shareArticle({ url, title, text, copiedLabel }: ShareOptions) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url })
      return
    } catch (error) {
      // The reader opened the sheet and closed it — nothing was meant to happen.
      if (error instanceof Error && error.name === 'AbortError') return
    }
  }
  await copyText(url)
  toast.success(copiedLabel)
}
