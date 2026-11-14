const mongoose = require('mongoose');

/**
 * One edition of one programme.
 *
 * The timetable says when a bulletin is due; this is the bulletin that was
 * actually made for it - the stories it carried and the words the presenter read
 * before them. Keeping a copy means the six o'clock programme a reader opens at
 * half past is still the six o'clock programme, and not a fresh random draw from
 * whatever was published in the last twenty minutes. It also leaves something to
 * look back at: an edition a machine wrote a script for can be read after the
 * fact and checked.
 *
 * `occurrence` is the slot's own date-and-time on its clock ("2026-11-14T18:00"),
 * which is what makes "the 18:00 edition of 14 November" one document and not
 * however many times a page happened to be opened.
 */
const radioBulletinSchema = new mongoose.Schema({
  slot: { type: mongoose.Schema.Types.ObjectId, required: true },
  slotName: { type: String, required: true, trim: true, maxlength: 60 },
  occurrence: { type: String, required: true },
  timezone: { type: String, default: 'Africa/Kigali' },
  startedAt: { type: Date, required: true },
  stories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
  // The headlines as they stood when the edition was made. A story can be renamed
  // or unpublished afterwards, and a bulletin that went out at six should still be
  // readable at eleven without re-running the query and hoping for the same answer.
  storyTitles: [{ type: String }],
  // Spoken before the first story and after the last one.
  opening: { type: String, default: '' },
  closing: { type: String, default: '' },
  // 'ai' when Gemini wrote those two lines, 'desk' when a person's sentence did.
  // The radio page says which, because a reader is entitled to know when a voice
  // on their speaker is a machine speaking without an editor in the loop.
  scriptSource: { type: String, enum: ['ai', 'desk'], default: 'desk' },
  model: { type: String, default: '' },
  // Why a script is not the AI one, when that is the case, so the admin portal can
  // show it instead of leaving a silent downgrade.
  note: { type: String, default: '' }
}, { timestamps: true });

radioBulletinSchema.index({ slot: 1, occurrence: 1 }, { unique: true });
radioBulletinSchema.index({ startedAt: -1 });

module.exports = mongoose.model('RadioBulletin', radioBulletinSchema);
