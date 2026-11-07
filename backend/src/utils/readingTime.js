// Readers time a story by words, not characters, and an HTML tag or a run of
// whitespace is not something you read — so strip the markup first.
const WORDS_PER_MINUTE = 200;

function estimateReadingTime(content) {
  const text = String(content || '').replace(/<[^>]*>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

module.exports = { estimateReadingTime, WORDS_PER_MINUTE };
