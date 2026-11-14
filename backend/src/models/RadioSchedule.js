const mongoose = require('mongoose');

/**
 * The timetable the radio desk keeps.
 *
 * A station is a schedule before it is a signal: somebody decides that the morning
 * news comes at seven and the evening round-up at six. On this site the reading is
 * done by the reader's own browser voice, so the timetable is what makes it a
 * programme instead of an endless list of stories - it decides which stories are
 * in an edition, how many, and what the presenter says before the first one.
 *
 * The times are wall-clock, not intervals. "Every 6 hours" drifts when the free
 * host restarts the container; "07:00" does not, provided the schedule says which
 * clock it means - hence the timezone below.
 */
const slotSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  // Wall-clock start, 24h "HH:mm", read in the schedule's own timezone.
  at: {
    type: String,
    required: true,
    match: /^([01]\d|2[0-3]):[0-5]\d$/
  },
  // 0 = Sunday through 6 = Saturday. An empty list means every day, which is what
  // a news bulletin normally is.
  days: [{ type: Number, min: 0, max: 6 }],
  // Which sections lead this edition. Empty means everything, newest first.
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  storyCount: { type: Number, default: 8, min: 1, max: 25 },
  // Whether Gemini writes the presenter's opening lines for this edition. When it
  // is off, or the model is not configured, or the call fails, the desk reads a
  // plain written introduction instead - the timetable is never held up by a model.
  useAiScript: { type: Boolean, default: true },
  enabled: { type: Boolean, default: true }
});

const radioScheduleSchema = new mongoose.Schema({
  // One document, always. A second timetable would mean two answers to "what is on
  // air right now", which is the one question the page must never have to guess at.
  key: { type: String, default: 'default', unique: true },
  // Every slot time is read on this clock. Kept on the document rather than in an
  // environment variable because it is an editorial fact about the schedule, and
  // the admin has to be able to see what they set.
  timezone: { type: String, default: 'Africa/Kigali' },
  slots: [slotSchema],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('RadioSchedule', radioScheduleSchema);
