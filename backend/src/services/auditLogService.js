const AuditLog = require('../models/AuditLog');

// Audit records are append-only. Callers pass only a small, allowlisted set of
// facts; request bodies, credentials, tokens and article content are never
// copied into the log.
async function record({ actor, action, entityType, entityId, entityLabel, summary, details = {}, req } = {}) {
  if (!action || !entityType || !summary) return null;
  const safeDetails = details && typeof details === 'object' && !Array.isArray(details) ? details : {};
  return AuditLog.create({
    actor: actor?._id || actor || null,
    action: String(action).slice(0, 80),
    entityType: String(entityType).slice(0, 40),
    entityId: entityId || null,
    entityLabel: String(entityLabel || '').slice(0, 240),
    summary: String(summary).slice(0, 500),
    details: safeDetails,
    ipAddress: req?.ip ? String(req.ip).slice(0, 64) : '',
    userAgent: req?.get?.('user-agent') ? String(req.get('user-agent')).slice(0, 300) : '',
  });
}

async function recordSafely(event) {
  try {
    return await record(event);
  } catch (error) {
    // A log outage must not turn a successful publication into an ambiguous
    // failed response. The error remains visible to operators in server logs.
    console.error('[audit] Could not persist newsroom event:', error?.message || error);
    return null;
  }
}

module.exports = { record, recordSafely };
