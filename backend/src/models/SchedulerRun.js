const mongoose = require('mongoose');

/**
 * One turn of the scheduled work, and what it had to say about itself.
 *
 * Before this collection the scheduler's only output was a line printed to the
 * host's log - which on a free instance is a page nobody opens, and which is
 * gone the moment the dyno restarts. So the site could be quietly failing to
 * publish what the desk timed for six o'clock, or quietly skipping the scores
 * pass because the last one never finished, and the only proof was somebody
 * noticing that nothing had happened.
 *
 * What is written is deliberately small and deliberately not the story: the job
 * name, whether it ran, what it counted, how long it took, and the thrown
 * message with no stack. A stack would be a line of the build's own paths, and
 * a job summary that carries story text turns a diagnostic into an archive.
 */
const schedulerRunSchema = new mongoose.Schema({
  // 'publish' | 'breaking' | 'radio' | 'scores' | 'weekly-pay'
  job: { type: String, required: true, trim: true, lowercase: true },
  // 'ok' | 'failed' | 'skipped'. Skipped is its own answer because a pass that
  // refuses to overlap the last one looks, from the outside, exactly like a
  // minute where nothing was due.
  status: { type: String, required: true },
  // 'cron' | 'admin' - who woke it. A manual run pressed in the desk has to be
  // tellable from the scheduled one afterwards.
  trigger: { type: String, default: 'cron' },
  // Counts the job reported: { published: 2 }, { refreshed: 4, failed: 1 }.
  did: { type: mongoose.Schema.Types.Mixed },
  ms: { type: Number },
  // The error's own sentence, cut short. Never the stack, never a credential.
  error: { type: String, trim: true },
}, { timestamps: true });

schedulerRunSchema.index({ job: 1, createdAt: -1 });
schedulerRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SchedulerRun', schedulerRunSchema);
