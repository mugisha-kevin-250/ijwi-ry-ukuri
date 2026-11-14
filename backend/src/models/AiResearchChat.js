const mongoose = require('mongoose');

// A turn of the research chat. `_id` is off because these are never addressed
// on their own - the whole thread is read and written as one document.
const turnSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 8000 },
    // Which model answered, so an old answer can be read with the right amount
    // of trust when the newsroom has since moved to another one.
    model: String,
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

/**
 * What the admin asked the research desk, and what it said back.
 *
 * The thread is stored rather than kept only in the browser because an editor
 * who closes the laptop mid-research should find the questions they already
 * asked when they come back, and because the server has to send the earlier
 * turns to Gemini itself - a model with no memory of the question before it
 * answers a follow-up as if it were the first one.
 *
 * One document per admin, not one for the whole newsroom: two people asking
 * about two different stories should not read each other's half-formed
 * questions as if they were facts about their own.
 */
const aiResearchChatSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    turns: { type: [turnSchema], default: [] },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiResearchChat', aiResearchChatSchema);
