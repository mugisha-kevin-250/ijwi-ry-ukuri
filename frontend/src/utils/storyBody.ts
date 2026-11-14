// Stories are typed as plain text in a textarea, so every line break the writer
// made is a paragraph; only the older records that carry markup go through as HTML.
const HTML_MARKUP = /<\/?(p|h[1-6]|ul|ol|li|blockquote|figure|figcaption|img|a|em|strong|b|i|br|div|span)\b/i

export function looksLikeHtml(content: string): boolean {
  return HTML_MARKUP.test(content || '')
}

export function splitParagraphs(content: string): string[] {
  return String(content || '')
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#8217': "'",
  '#8211': '-',
  '#8212': '-',
  '#8230': '...',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|[a-zA-Z]+);/g, (_whole, name: string) => ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? ' ')
}

// A voice reads a story out loud; it does not read the machinery that formatted
// it. Markup, an address a listener cannot click, and a run of blank lines all
// have to go before the first sentence reaches the browser's speech engine.
export function plainTextForSpeech(content: string): string {
  const raw = String(content || '')
  const withoutTags = looksLikeHtml(raw)
    ? raw.replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, '\n\n').replace(/<[^>]+>/g, ' ')
    : raw
  return decodeEntities(withoutTags)
    .replace(/\b(?:https?|ftp):\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n+ */g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Story text is turned into a headline sentence, the summary, then the body, so
// the whole thing lives in one place and the voice never reads the same line twice.
export function speechScript(story: { title?: string; summary?: string; content?: string }): string {
  const parts = [plainTextForSpeech(story.title || ''), plainTextForSpeech(story.summary || ''), plainTextForSpeech(story.content || '')]
  return parts.filter(Boolean).join('\n\n')
}

export function wordCount(text: string): number {
  const matches = String(text || '').match(/\S+/g)
  return matches ? matches.length : 0
}

// Speech engines stall on a single very long utterance - Chrome is the worst -
// so a story is spoken in sentences gathered up to roughly this many characters.
const CHUNK_TARGET = 220

export function chunksForSpeech(script: string): string[] {
  const paragraphs = splitParagraphs(script)
  const chunks: string[] = []
  let buffer = ''

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim())
    buffer = ''
  }

  paragraphs.forEach((paragraph) => {
    const sentences = paragraph.match(/[^.!?…]+(?:[.!?…]+|$)/g) || [paragraph]
    sentences.forEach((sentence) => {
      const piece = sentence.trim()
      if (!piece) return
      if (buffer && `${buffer} ${piece}`.length > CHUNK_TARGET) flush()
      buffer = buffer ? `${buffer} ${piece}` : piece
      // A single sentence longer than the cap - a writer with no full stops -
      // is cut at a word boundary instead of being handed over whole.
      while (buffer.length > CHUNK_TARGET * 1.6) {
        const cutAt = buffer.lastIndexOf(' ', CHUNK_TARGET)
        const index = cutAt > 0 ? cutAt : CHUNK_TARGET
        chunks.push(buffer.slice(0, index).trim())
        buffer = buffer.slice(index).trim()
      }
    })
    flush()
  })

  return chunks.filter(Boolean)
}

