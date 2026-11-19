const mongoose = require('mongoose');

/**
 * One competition's matches on one calendar day, exactly as the scoreboard feed
 * reported them, kept so that the readers of this site are the only people who
 * have to ask for it once.
 *
 * This is a cache with a shape, not a record of history: a goal that happened is
 * worth printing, and a goal that happened three weeks ago belongs in a story
 * rather than in this collection. That is why a document is keyed on the
 * competition and the day instead of on the match, and why the rows only keep
 * the fields a scores page actually draws - team, badge, minute, score - and
 * never the hundreds of kilobytes the feed carries around them.
 */
const teamSchema = new mongoose.Schema({
  id: String,
  name: String,
  short: String,
  logo: String,
  // The feed prints a plain string here. A match that has not started has no
  // score, and that is stored as nothing rather than as 0-0, because a page that
  // says 0-0 for a game still on Sunday is a lie a reader will notice.
  score: String,
  record: String,
  form: String,
  winner: Boolean,
}, { _id: false });

const matchSchema = new mongoose.Schema({
  id: String,
  name: String,
  shortName: String,
  start: Date,
  // pre | in | post. The page's tabs are these three words.
  state: String,
  // Whatever the feed chose to say: "FT", "HT", "AET", "Postponed". Kept because
  // a result decided after extra time or penalties is not the same fact as a
  // normal full time, and only the source knows which it was.
  statusText: String,
  // The live clock, "72'+3" when stoppage time is running.
  clock: String,
  period: Number,
  venue: String,
  // Set only on rows read from the day's all-competitions board: the competition
  // the feed files this match under, which it prints beside the fixture because
  // that board carries every competition in the world at once and does not say
  // whose day it is. A followed league already knows its own name, so its rows
  // leave this empty.
  competition: {
    id: String,
    name: String,
  },
  home: teamSchema,
  away: teamSchema,
}, { _id: false });

const scoreboardSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true },
  // YYYYMMDD, the form the feed is asked in. A day is part of the key because a
  // reader chooses yesterday, today and tomorrow as three different pages.
  dateKey: { type: String, required: true },
  league: {
    name: String,
    logo: String,
  },
  matches: [matchSchema],
  fetchedAt: Date,
  // When a reader last asked for this document. The cron only re-asks the
  // upstream for the days and competitions somebody is actually looking at,
  // which is what keeps a free server from spending its whole hour fetching
  // leagues nobody on the site has opened.
  watchedAt: Date,
}, { timestamps: true });

scoreboardSchema.index({ code: 1, dateKey: 1 }, { unique: true });
// The cron's question is "which days has a reader asked for lately, newest
// first", and that is a sort on one field, not a join across two.
scoreboardSchema.index({ watchedAt: -1 });
// Opening a match reads the day's row for it without scanning anybody's cache:
// the page cannot wait on a collection-wide search to find one fixture.
scoreboardSchema.index({ 'matches.id': 1 });

module.exports = mongoose.model('SportScoreboard', scoreboardSchema);
