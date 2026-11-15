const mongoose = require('mongoose');

/**
 * One match, in the detail a reader wants after they have clicked it: who scored
 * and when, who was booked, who came on, and what the two teams did with the
 * ball.
 *
 * Only the page a reader is actually looking at asks for this, so it is fetched
 * on demand and kept for a while rather than crawled for every match in every
 * competition. A match that is still being played is refreshed often; a match that
 * has finished is a fact that will not change again, and there is no reason to
 * spend an upstream call on it this week.
 */
const eventSchema = new mongoose.Schema({
  // The minute as the source printed it, "15'" or "45'+2".
  minute: String,
  period: Number,
  // goal | card | substitution | other, decided from the feed's own type so the
  // page can draw the right mark without reading English sentences.
  kind: String,
  label: String,
  text: String,
  teamId: String,
  teamName: String,
  players: [String],
  scoringPlay: Boolean,
}, { _id: false });

const statSchema = new mongoose.Schema({
  name: String,
  label: String,
  home: String,
  away: String,
  // Possession and shot accuracy are the two numbers a page can honestly draw as
  // a bar, so the raw pair is kept as well as the text.
  homeValue: Number,
  awayValue: Number,
}, { _id: false });

const playerSchema = new mongoose.Schema({
  id: String,
  name: String,
  jersey: String,
  position: String,
  starter: Boolean,
}, { _id: false });

const sideSchema = new mongoose.Schema({
  teamId: String,
  name: String,
  short: String,
  logo: String,
  score: String,
  winner: Boolean,
  formation: String,
  // The form table and the win-loss line are printed by the scoreboard, not the
  // summary, and a match page that shows them is showing the feed's own words.
  record: String,
  form: String,
  players: [playerSchema],
}, { _id: false });

const matchSchema = new mongoose.Schema({
  espnId: { type: String, required: true, unique: true },
  code: String,
  league: { name: String, logo: String },
  name: String,
  start: Date,
  state: String,
  statusText: String,
  clock: String,
  venue: String,
  attendance: String,
  home: sideSchema,
  away: sideSchema,
  events: [eventSchema],
  stats: [statSchema],
  fetchedAt: Date,
  watchedAt: Date,
}, { timestamps: true });

// The cron's one question about this collection is "which matches are being
// played right now that somebody is looking at", so the state and the last read
// sit in the same index and the answer never scans the week's archive.
matchSchema.index({ state: 1, watchedAt: -1 });

module.exports = mongoose.model('SportMatch', matchSchema);
