const mongoose = require('mongoose');

// One shared lease per scheduled job. The unique job index is the cross-process
// coordination point: only one Render instance can own a live lease at a time.
const schedulerLockSchema = new mongoose.Schema({
  job: { type: String, required: true, trim: true, lowercase: true, unique: true },
  owner: { type: String, required: true },
  leaseUntil: { type: Date, required: true },
}, { timestamps: true });

schedulerLockSchema.index({ job: 1 }, { unique: true });

module.exports = mongoose.model('SchedulerLock', schedulerLockSchema);
