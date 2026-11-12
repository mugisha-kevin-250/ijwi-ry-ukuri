// Reader-typed text goes straight into a RegExp, so an unescaped "(" would throw
// and a pattern like "(a+)+$" would tie up the server instead of finding nothing.
module.exports = function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
