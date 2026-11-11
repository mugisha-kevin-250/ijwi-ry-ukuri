// Render hands the reader's real address in a header and its own proxy
// address on the socket. Anything that identifies a caller - a view record, a
// rate-limit bucket - has to use the same rule or every viewer on a shared
// network looks like one person.
module.exports = function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || '')
    .split(',')[0]
    .trim();
  return first || req.socket.remoteAddress || '';
};
