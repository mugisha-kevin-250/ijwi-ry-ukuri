const mongoose = require('mongoose');

// Append-only newsroom activity. This is deliberately separate from Article:
// an article can be edited or archived, but the record of who did it must not
// disappear when the article changes.
const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  action: { type: String, required: true, trim: true, maxlength: 80, index: true },
  entityType: { type: String, required: true, trim: true, maxlength: 40, index: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  entityLabel: { type: String, trim: true, maxlength: 240, default: '' },
  summary: { type: String, required: true, trim: true, maxlength: 500 },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, trim: true, maxlength: 64, default: '' },
  userAgent: { type: String, trim: true, maxlength: 300, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
