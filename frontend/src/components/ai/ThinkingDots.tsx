/**
 * The three dots a RADAR AI bubble wears while the desk is composing an answer.
 *
 * A Gemini round trip is seconds, not milliseconds, and a bubble that sits
 * empty next to the reader's own question looks like nothing happened. The dots
 * rise one after another so the wait reads as work in progress rather than a
 * stuck page.
 *
 * They are decoration, so the wrapper is `aria-hidden`: the label beside them
 * says "thinking" and the bubble carrying them is a `role="status"` region,
 * which is what a screen reader should announce. The animation is switched off
 * for a device that asked for less motion, and three steady dots stay in place -
 * the dots are the loader, the movement is only the manner.
 */
export default function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      <span className="ai-thinking-dot" />
      <span className="ai-thinking-dot" />
      <span className="ai-thinking-dot" />
    </span>
  )
}
