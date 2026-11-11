const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option', 'svg', 'math'])

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span', 'a', 'img', 'figure', 'figcaption', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'em', 'strong', 'b', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
])

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
}

// A writer can paste anything into the story body, so javascript:, data: and
// file: links have to die before the markup reaches a reader's browser.
const SAFE_URL = /^(https?:|mailto:|tel:|\/(?!\/)|\.\/|#)/i

function safeUrl(value: string): boolean {
  return SAFE_URL.test(value.trim())
}

function cleanElement(element: Element) {
  [...element.attributes].forEach((attribute) => {
    const name = attribute.name.toLowerCase()
    const allowed = ALLOWED_ATTRIBUTES[element.tagName.toLowerCase()] || []
    if (!allowed.includes(name) || (['href', 'src'].includes(name) && !safeUrl(attribute.value))) {
      element.removeAttribute(attribute.name)
    }
  })

  // Links that open a new tab must not be able to reach back to our page.
  if (element.tagName === 'A' && element.getAttribute('target') === '_blank') {
    element.setAttribute('rel', 'noopener noreferrer')
  }
}

function sanitizeNode(node: Element) {
  [...node.childNodes].forEach((child) => {
    const element = child as Element
    if (!element.tagName) return
    const tag = element.tagName.toLowerCase()
    if (BLOCKED_TAGS.has(tag)) {
      element.remove()
      return
    }
    if (ALLOWED_TAGS.has(tag)) {
      cleanElement(element)
      sanitizeNode(element)
      return
    }
    // Unknown markup keeps its words but loses its shell.
    sanitizeNode(element)
    if (!element.parentNode) return
    while (element.firstChild) element.parentNode.insertBefore(element.firstChild, element)
    element.remove()
  })
}

/**
 * Older stories carry raw HTML typed by writers. This keeps the readable
 * markup and throws away everything that could run code.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  sanitizeNode(parsed.body)
  return parsed.body.innerHTML
}
