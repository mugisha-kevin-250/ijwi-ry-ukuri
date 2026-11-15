const mongoose = require('mongoose');

/**
 * One competition's league table, as the feed printed it.
 *
 * A table moves once a matchday, not once a minute, so this is cached far longer
 * than the scoreboard and is refreshed on its own clock. The numbers are copied
 * straight from the source and nothing is computed here: RADAR does not decide
 * goal difference, it repeats what the competition says it is.
 */
const entrySchema = new mongoose.Schema({
  rank: Number,
  // Only a cup competition fills this in - "Group A". A league table leaves it
  // blank, and the page shows the label because a table of thirty-two clubs
  // from eight groups is not one table.
  table: String,
  team: {
    id: String,
    name: String,
    short: String,
    logo: String,
  },
  played: Number,
  win: Number,
  draw: Number,
  loss: Number,
  scored: Number,
  conceded: Number,
  // A string, because the feed's own value can be "+10" or "E" (eliminated) and
  // the page should print what the competition published, not a number we
  // invented from it.
  difference: String,
  points: String,
  // The record the source writes for the row, "9-0-1", kept for the tooltip a
  // reader wants when they do not trust a single column.
  record: String,
  // Points a club has been taken off by the competition, as the feed printed it.
  // Blank for everybody else, and a table that hides a deduction is a table that
  // cannot be explained to the reader who asks why the row is where it is.
  deductions: String,
  note: String,
}, { _id: false });

const standingsSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  league: { name: String, logo: String },
  season: String,
  entries: [entrySchema],
  fetchedAt: Date,
  watchedAt: Date,
}, { timestamps: true });

// The cron asks "which tables is somebody still reading", sorted the same way.
standingsSchema.index({ watchedAt: -1 });

module.exports = mongoose.model('SportStandings', standingsSchema);
