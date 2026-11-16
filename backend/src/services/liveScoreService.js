/**
 * The scores page's only window on the outside world.
 *
 * Everything the reader sees on /live-sports is fetched from one free public
 * sports feed, from this server, on a schedule - never from the browser. That
 * single rule is the reason the page exists in this shape: a thousand readers
 * refreshing every thirty seconds is a thousand requests to *us*, and at most
 * four requests upstream at any moment, however many people are watching. A paid
 * key is not involved and none can be: the feed is public, so the only protection
 * that matters is not hammering it.
 *
 * Four rules hold this file together:
 * - What is stored was printed by the source. The minute, the score, the league
 *   table and the booking are copied out of the feed's own fields; nothing here is
 *   calculated, guessed or filled in. A match that has not started has no score
 *   rather than 0-0, and a club the competition has taken four points off keeps
 *   the minus four.
 * - A document is only re-asked for when somebody is actually looking at it. The
 *   cron walks the rows a reader touched in the last few minutes, not the whole
 *   watch list, so an idle site spends nothing.
 * - Upstream work is capped, never queued behind a stranger's curiosity. Four
 *   conversations with the feed at a time, one attempt per league per poll, and
 *   any reader who arrives while they are busy is answered from this database and
 *   asked to come back in half a minute.
 * - When the feed cannot be reached the page says so, league by league. It serves
 *   the rows that really were last fetched, marks them stale and gives the reason,
 *   and never invents a result to fill the gap.
 */
const env = require('../config/env');
const SportScoreboard = require('../models/SportScoreboard');
const SportMatch = require('../models/SportMatch');
const SportStandings = require('../models/SportStandings');
const { wallClock, MINUTE_MS, HOUR_MS } = require('../utils/clock');

// A number read from the environment is only trusted when it is one. A typo in
// the dashboard would otherwise make every fetch abort before it started and
// every document permanently stale, which reads as a broken feed and is a
// broken setting.
const numberFrom = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const BASE = String(env.ESPN_BASE_URL || 'https://site.api.espn.com/apis').replace(/\/+$/, '');
const TIMEOUT_MS = Math.max(3000, numberFrom(env.LIVESCORE_TIMEOUT_MS, 12000));
const REFRESH_SECONDS = Math.max(15, numberFrom(env.LIVESCORE_REFRESH_SECONDS, 60));
const REFRESH_MS = REFRESH_SECONDS * 1000;
// The scheduled pass runs once a minute, so the window a live document counts as
// current for can never be shorter than that. An operator who asks for a refresh
// every 20 seconds would otherwise find every league expired on every single
// pass, and the newsroom would pay for the whole watch list sixty times an hour.
const CRON_PERIOD_MS = MINUTE_MS;
const LIVE_TTL = Math.max(REFRESH_MS, CRON_PERIOD_MS);
// Days are kept long enough to cover "the match on Saturday" being read on
// Monday, and no longer: this is a scores page, not an archive.
const KEEP_DAYS = 8;
// The furthest ahead anybody may ask for. The feed answers any eight-digit day,
// including one a year from now whose whole answer is a season's fixture list,
// and every day nobody has looked at before costs a fetch and a stored row.
const AHEAD_DAYS = 21;
// One competition does not stage more than a handful of matches a day. Anything
// larger is a day asked for in the wrong shape, and a whole season is not going
// into a half-gigabyte cluster.
const MAX_MATCHES_PER_DAY = 40;
// A row is only re-fetched by the cron while a reader keeps looking at it.
const WATCHED_WINDOW_MS = 20 * MINUTE_MS;
// One free instance can afford roughly twelve upstream calls a minute without
// the pass overlapping itself, so the cron never queues more than that.
const MAX_REFRESH_PER_RUN = 12;
// Four conversations with the feed at a time, in this process, whatever the
// traffic looks like. This is the number that decides whether the newsroom's
// address stays usable.
const MAX_CONCURRENT_FETCHES = 4;
// The scheduled pass is allowed twice as many, because its work has to happen
// whether anybody is watching or not, and it is what keeps the next reader's
// answer already sitting here.
const HARD_FETCH_CAP = MAX_CONCURRENT_FETCHES * 2;
// How long a reader's request waits for a cold league before the page is served
// from the database. The fetch carries on and lands before the next poll.
const REQUEST_BUDGET_MS = 6000;
// The same courtesy to the scheduled pass, which has a minute to spend and
// should not spend it all on one league that has stopped answering.
const CRON_BUDGET_MS = 40 * 1000;
// A reader waiting for a page to fill in is pointed at the next poll, not at a
// minute.
const REFRESHING_POLL_SECONDS = 10;
// When the feed refuses a league, the next half minute is spent answering from
// the database instead of asking again. Without this, a competition the feed has
// stopped serving - a typo'd code, an endpoint that changed - is a page that
// retries every ten seconds for as long as one reader keeps the tab open, and
// the polite crowd this design exists for turns into the noisy one. It is half
// the cron's period, so the scheduled pass is never the thing a failure blocks.
const FAILURE_COOLDOWN_MS = 30 * 1000;
// A league table moves once a matchday, not once a minute.
const STANDINGS_TTL = 6 * HOUR_MS;

const DEFAULT_LEAGUES = [
  { code: 'eng.1', name: 'English Premier League', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
  { code: 'esp.1', name: 'Spanish LALIGA', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png' },
  { code: 'ita.1', name: 'Italian Serie A', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png' },
  { code: 'ger.1', name: 'German Bundesliga', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png' },
  { code: 'fra.1', name: 'French Ligue 1', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png' },
  { code: 'uefa.champions', name: 'UEFA Champions League', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png' },
  { code: 'uefa.europa', name: 'UEFA Europa League', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png' },
  { code: 'caf.champions', name: 'CAF Champions League', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2391.png' },
  { code: 'eng.2', name: 'English League Championship', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/24.png' },
  { code: 'por.1', name: 'Portuguese Primeira Liga', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/14.png' },
  { code: 'ned.1', name: 'Dutch Eredivisie', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/11.png' },
  { code: 'tur.1', name: 'Turkish Super Lig', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/18.png' },
  { code: 'sco.1', name: 'Scottish Premiership', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/45.png' },
];

// The feed is named so a reader can check a number against it. Its URLs are not
// handed to the browser: the page exists so that nobody has to ask the feed
// anything, and a crowd that did would be asking from this newsroom's address.
const PROVIDER = 'espn';

const scoreboardUrl = (code, dateKey) =>
  `${BASE}/site/v2/sports/soccer/${encodeURIComponent(code)}/scoreboard?dates=${dateKey}&limit=100`;
const summaryUrl = (code, id) =>
  `${BASE}/site/v2/sports/soccer/${encodeURIComponent(code)}/summary?event=${encodeURIComponent(id)}`;
const standingsUrl = (code) => `${BASE}/v2/sports/soccer/${encodeURIComponent(code)}/standings`;

/** The leagues this newsroom follows, overridable with LIVESCORE_LEAGUES=eng.1,esp.1,... */
function leagueList() {
  const raw = String(env.LIVESCORE_LEAGUES || '').trim();
  if (!raw) return DEFAULT_LEAGUES.slice();
  const codes = [...new Set(
    raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((code) => /^[a-z0-9][a-z0-9.]{1,23}$/.test(code)),
  )];
  if (!codes.length) return DEFAULT_LEAGUES.slice();
  // A code the operator added is printed with the name the feed gives it, and
  // with nothing until then: a made-up league name on a scores page is worse
  // than a bare code.
  return codes.map((code) => DEFAULT_LEAGUES.find((league) => league.code === code) || { code, name: '', logo: '' });
}

function validCode(code) {
  // Codes are the feed's own (eng.1, uefa.champions). This is a shape check
  // rather than a security boundary: the path is fixed, the code is its last
  // segment, and anything not shaped like one simply has no matches.
  return /^[a-z0-9][a-z0-9.]{1,23}$/.test(String(code || ''));
}

/** YYYYMMDD on the newsroom's own clock, so "today" means today in Kigali. */
function dayKey(offsetDays = 0, now = new Date()) {
  const clock = wallClock(new Date(now.getTime() - offsetDays * 24 * HOUR_MS), env.SCHEDULER_TZ);
  return clock.dateKey.replace(/-/g, '');
}

/**
 * The days a reader may ask for: the last week and the three weeks ahead.
 *
 * Any eight digits are a valid question to the feed, and every day nobody has
 * looked at before is a fetch and a stored row. A scores page does not need the
 * 1998 final and a free database cannot afford a stranger deciding it does: a
 * loop over a thousand dates is a thousand leagues asked of the feed, which is
 * precisely the traffic this whole design exists to prevent.
 */
function dayAllowed(dateKey, now = new Date()) {
  if (!/^[0-9]{8}$/.test(String(dateKey || ''))) return false;
  return dateKey >= dayKey(KEEP_DAYS - 1, now) && dateKey <= dayKey(-AHEAD_DAYS, now);
}

function failed(reason, status) {
  return { ok: false, reason, status: status || null };
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; RADARNewsroom/1.0)' },
    });
    // A feed that is down or angry answers 404, 429 or 500, sometimes with a
    // JSON error object instead of a scoreboard. Reading either as a day's
    // results would store an empty page and call it a fact.
    if (!response.ok) return { ...failed('PROVIDER_ERROR', response.status), body: null };
    const body = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.error) {
      return { ...failed(body ? 'UNREADABLE_RESPONSE' : 'EMPTY_RESPONSE', response.status), body: null };
    }
    return { ok: true, status: response.status, body };
  } catch (error) {
    // Nothing here throws: an unparseable answer, a refused connection and a
    // runtime with no fetch at all all land on the same honest report.
    return failed(error && error.name === 'AbortError' ? 'TIMEOUT' : 'UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }
}

let activeFetches = 0;

/** The feed, with the newsroom's own ceiling on how often it may be asked. */
async function fetchJson(url, { urgent = false } = {}) {
  if (activeFetches >= (urgent ? HARD_FETCH_CAP : MAX_CONCURRENT_FETCHES)) return failed('BUSY');
  activeFetches += 1;
  try {
    return await getJson(url);
  } finally {
    activeFetches -= 1;
  }
}

// --- normalising the feed ------------------------------------------------------

/**
 * The badge a white page should draw.
 *
 * The feed carries two per club or competition: one for a light background and
 * one, often with a black box baked into it, for a dark one. Taking whichever
 * comes first in the array picks the dark one for a fifth of the clubs in the
 * data, which on a blue-and-white page reads as a printing error.
 */
function preferredLogo(logos = []) {
  const list = logos || [];
  const wanted =
    list.find((logo) => (logo.rel || []).includes('light') && logo.href) ||
    list.find((logo) => (logo.rel || []).includes('full') && !(logo.rel || []).includes('dark') && logo.href) ||
    list.find((logo) => logo.href && !(logo.rel || []).includes('dark'));
  return wanted ? String(wanted.href) : '';
}

function logoOf(team = {}) {
  if (team.logo) return String(team.logo);
  return preferredLogo(team.logos);
}

function nameOf(team = {}, short = false) {
  if (short) return team.shortDisplayName || team.abbreviation || team.name || team.displayName || '';
  return team.displayName || team.name || team.shortDisplayName || team.location || '';
}

/** A date the feed printed, or nothing at all. An invalid one is never stored. */
function dateOf(value) {
  if (!value) return undefined;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? undefined : when;
}

/**
 * The first of two prints that says something.
 *
 * An empty string is what the feed leaves where it had nothing to write, so it
 * does not count as an answer: a page built from two payloads is allowed to take
 * the title from the one that has it.
 */
function firstOf(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? '';
}

/**
 * The score as the feed printed it.
 *
 * Today this field is a plain string in both the scoreboard and the match page,
 * but the same provider writes numbers as objects elsewhere in the same payload,
 * and a scores page that printed "[object Object]" - or lost a 0-0 into an empty
 * string because a zero is falsy - would be a page that lied about the one
 * number anybody came for.
 */
function scoreString(competitor, state) {
  if (state === 'pre') return '';
  const raw = (competitor || {}).score;
  if (raw == null) return '';
  if (typeof raw === 'object') return String(raw.displayValue ?? '');
  return String(raw);
}

/**
 * One competitor turned into the row the page draws.
 *
 * A match that has not started prints no score. The feed writes "0" for both
 * sides of a Saturday fixture, and a page showing 0-0 for a game that has not
 * been played is the one mistake a scores page is not allowed. A match that was
 * played and finished 0-0 is a different fact entirely, so the blanking is
 * driven by the state and never by the value of the number.
 */
function sideOf(competitor, state) {
  const team = (competitor || {}).team || {};
  const record = (competitor.records || [])[0];
  return {
    id: String(team.id || ''),
    name: nameOf(team),
    short: nameOf(team, true),
    logo: logoOf(team),
    score: scoreString(competitor, state),
    record: record && record.summary ? String(record.summary) : '',
    form: competitor.form ? String(competitor.form) : '',
    winner: Boolean(competitor.winner),
  };
}

function matchRowOf(event) {
  const competition = (event.competitions || [])[0] || {};
  const status = competition.status || {};
  const type = status.type || {};
  const state = type.state || 'pre';
  const competitors = competition.competitors || [];
  // The home side is taken from the feed's own homeAway marker, never from the
  // position in the array: in one Championship day the six matches were printed
  // [away, home], [home, away], [away, home], [home, away], [away, home],
  // [home, away], and a page that trusted the order put three goals on the
  // wrong side of the row.
  const home = competitors.find((item) => item.homeAway === 'home') || {};
  const away = competitors.find((item) => item.homeAway === 'away') || {};
  return {
    id: String(event.id),
    name: event.name || '',
    shortName: event.shortName || '',
    start: dateOf(competition.startDate || competition.date || event.date),
    state,
    statusText: type.shortDetail || type.detail || type.description || '',
    clock: state === 'pre' ? '' : String(status.displayClock ?? ''),
    period: Number(status.period) || 0,
    venue: (competition.venue && competition.venue.fullName) || (event.venue && event.venue.fullName) || '',
    home: sideOf(home, state),
    away: sideOf(away, state),
  };
}

function statOf(stats, name) {
  return (stats || []).find((stat) => stat.name === name) || {};
}

/**
 * The number the source printed, or nothing.
 *
 * A point deduction is a negative number and a percentage is a decimal, and
 * reading either with `Number(x) || 0` turns a four-point deduction into a zero
 * and a league table into a lie. A figure is a number here only when the feed's
 * own text really is one, and a figure the feed left blank stays blank.
 */
function numberOf(stat) {
  const printed = stat ? stat.displayValue : undefined;
  // An empty string is how the feed writes a statistic that stands for nothing,
  // and `Number('')` is zero: a deduction printed as "" would come back as a
  // four-point deduction that was paid. The number underneath is what says.
  const raw = typeof printed === 'string' && printed.trim() === '' ? (stat.value ?? '') : (printed ?? stat.value ?? '');
  const value = Number(raw);
  return raw === '' || !Number.isFinite(value) ? null : value;
}

function standingsEntryOf(entry, index, rankInTable) {
  const stats = entry.stats || [];
  const team = entry.team || {};
  // The competition's own rank, wherever it chose to write it: a rank
  // statistic, or the promotion note. Only when it wrote neither is the row's
  // place in the feed's list used, and that is the feed's order rather than ours.
  const stated = numberOf(statOf(stats, 'rank')) ?? (entry.note && entry.note.rank);
  return {
    rank: Number.isFinite(stated) ? stated : (Number.isFinite(rankInTable) ? rankInTable : index + 1),
    team: { id: String(team.id || ''), name: nameOf(team), short: nameOf(team, true), logo: logoOf(team) },
    played: numberOf(statOf(stats, 'gamesPlayed')),
    win: numberOf(statOf(stats, 'wins')),
    draw: numberOf(statOf(stats, 'ties')),
    loss: numberOf(statOf(stats, 'losses')),
    scored: numberOf(statOf(stats, 'pointsFor')),
    conceded: numberOf(statOf(stats, 'pointsAgainst')),
    difference: String(statOf(stats, 'pointDifferential').displayValue ?? ''),
    points: String(statOf(stats, 'points').displayValue ?? ''),
    record: String(statOf(stats, 'overall').displayValue ?? ''),
    // A competition that took points off a club says so in this statistic, and
    // the table has to show it: without it a row of 38 is printed for a club the
    // league is holding on 34.
    deductions: String(statOf(stats, 'deductions').displayValue ?? ''),
    note: (entry.note && entry.note.description) || '',
  };
}

// What the feed chose to call each kind of thing that happened. The card list is
// exact rather than a pattern match on the word "card", because the same feed
// writes "Substitution Card Injury" and "Second Yellow Card Leading To A
// Sending Off" in prose, and a page that colours those as a booking is wrong.
const CARD_TYPES = new Set(['yellow-card', 'red-card', 'yellow-red', 'second-yellow']);
// The feed's list of what happened, minus the stoppage noise it prints twice
// every time play restarts. Anything else kept is something the source itself
// called a period marker.
const PERIOD_MARKERS = new Set([
  'kickoff',
  'halftime',
  'start-2nd-half',
  'end-regular-time',
  'extra-time',
  'penalties',
  'end-extra-time',
]);

function kindOf(type = {}) {
  const kind = String(type.type || '');
  if (kind === 'goal') return 'goal';
  if (CARD_TYPES.has(kind)) return 'card';
  if (kind === 'substitution') return 'substitution';
  if (PERIOD_MARKERS.has(kind)) return 'other';
  return null;
}

function eventOf(raw) {
  const kind = kindOf(raw.type);
  if (!kind) return null;
  const clock = raw.clock || {};
  const minutes = Math.floor(Number(clock.value) / 60);
  return {
    // The clock as the source wrote it. Kickoff and half time are printed with
    // no clock at all, and a minute the feed left blank stays blank rather than
    // being invented as "0'".
    minute: String(clock.displayValue ?? (minutes > 0 ? `${minutes}'` : '')),
    // Used only to put the list in order; nothing on the page reads these two.
    second: Number(clock.value) || 0,
    wallclock: dateOf(raw.wallclock),
    period: Number((raw.period || {}).number) || 0,
    kind,
    label: (raw.type && raw.type.text) || '',
    text: raw.text || raw.shortText || '',
    teamId: raw.team ? String(raw.team.id || '') : '',
    teamName: raw.team ? nameOf(raw.team) : '',
    players: (raw.participants || []).map((item) => (item.athlete && item.athlete.displayName) || '').filter(Boolean),
    scoringPlay: Boolean(raw.scoringPlay),
  };
}

/** The same list without the two fields only the ordering needed. */
function printableEvents(events) {
  return (events || []).map(({ second, wallclock, ...event }) => event);
}

/**
 * The two sides' team statistics paired into the rows a page can draw.
 *
 * Only a statistic the feed gave a name to is kept. The other 28 entries in the
 * payload are the model numbers of a data pipeline - a per-minute possession
 * grid, expected-goals vectors, a map of where the ball was - and a reader
 * cannot make sense of them, so they are not put on the page under a label we
 * invented for them.
 */
function statRowsOf(boxscore) {
  const teams = boxscore && boxscore.teams ? boxscore.teams : [];
  const home = teams.find((item) => item.homeAway === 'home') || teams[0] || {};
  const away = teams.find((item) => item.homeAway === 'away') || teams[1] || {};
  const names = [...new Set([...(home.statistics || []), ...(away.statistics || [])].map((stat) => stat.name))];
  return names.reduce((rows, name) => {
    const left = statOf(home.statistics, name);
    const right = statOf(away.statistics, name);
    const label = left.label || left.displayName || right.label || right.displayName || '';
    // A name with no label is the feed's internal field name, not something the
    // competition ever shows a reader.
    if (!label) return rows;
    // The home side's own label wins. Reading the away row's label for the home
    // figure is what printed "Accurate Crosses" over a possession percentage one
    // minute and "Corners" the next, depending only on which side the feed
    // happened to list first.
    rows.push({
      name,
      label,
      home: String(left.displayValue ?? ''),
      away: String(right.displayValue ?? ''),
      homeValue: numberOf(left),
      awayValue: numberOf(right),
    });
    return rows;
  }, []);
}

function sideFromSummary(roster, boxTeam, headerCompetitor, state) {
  const team = (boxTeam && boxTeam.team) || (roster && roster.team) || (headerCompetitor && headerCompetitor.team) || {};
  const competitor = headerCompetitor || {};
  const record = (competitor.records || [])[0];
  return {
    teamId: String(team.id || ''),
    name: nameOf(team),
    short: nameOf(team, true),
    logo: logoOf(team),
    // Same rule as the scoreboard: a fixture that has not been played prints no
    // score, however the feed happens to write one.
    score: scoreString(competitor, state),
    winner: Boolean((roster && roster.winner) || competitor.winner),
    formation: (roster && roster.formation) || '',
    record: record && record.summary ? String(record.summary) : '',
    form: competitor.form ? String(competitor.form) : '',
    players: ((roster && roster.roster) || []).map((player) => ({
      id: String(((player || {}).athlete || {}).id || ''),
      name: (player.athlete && (player.athlete.displayName || player.athlete.fullName)) || '',
      jersey: player.jersey ? String(player.jersey) : '',
      position: (player.position && (player.position.displayName || player.position.abbreviation)) || '',
      starter: Boolean(player.starter),
    })).filter((player) => player.name),
  };
}

// --- one upstream call per league per freshness window -------------------------

// What is being fetched, by key, so fifty readers of the same cold league cost
// one call.
const inflight = new Map();
// What the feed refused recently, by the same key.
const failures = new Map();

/**
 * Write a cache row without ever losing the row that was already there.
 *
 * The key is both the filter and part of what is written, so two processes
 * upserting the same cold league in the same moment can make the second collide
 * with its own unique index. That is not a failure of the data, it is two people
 * asking for the same thing, and the answer is the row that won.
 */
async function store(Model, filter, payload) {
  try {
    await Model.updateOne(filter, { $set: payload }, { upsert: true });
  } catch (error) {
    if (error && error.code !== 11000) throw error;
  }
}

/**
 * Is a fetch for this key already running? Asked without awaiting.
 *
 * Reading the map and reserving the key have to happen in the same tick. A
 * request that awaits before it looks lets two readers of a cold league each
 * find nobody waiting, and then both ask the feed for the same day - and under
 * real load, where a hundred database callbacks land in one tick, that is a
 * happening bug rather than a possible one. Asking the feed twice for one league
 * is the one thing this map exists to prevent.
 */
function pendingRun(key) {
  return inflight.get(key) || null;
}

/**
 * A follower's answer is the leader's answer, success or failure.
 *
 * A follower that gave up and started its own run would ask the feed again, so
 * even a leader that threw is reported as an answer rather than retried.
 */
async function answerFromRun(run) {
  try {
    return await run;
  } catch (error) {
    return failed(error && error.code === 11000 ? 'DUPLICATE_ROW' : 'RUN_FAILED');
  }
}

/** What the feed last said no to, while it is still too soon to ask again. */
function recentlyRefused(key) {
  const held = failures.get(key);
  return held && Date.now() - held.at < FAILURE_COOLDOWN_MS ? held.reason : null;
}

/**
 * How long one day's rows stay current, decided by what is on them.
 *
 * A match in play is re-read every minute. A fixture kicking off shortly is
 * re-read every minute so the page flips to live on its own. A day whose games
 * have all finished is a closed book and is read again after six hours at most.
 * A day that came back with nothing on it is the special case: an empty list is
 * not a finished day, it is a day nobody has read properly yet, and trusting it
 * for six hours would let a Thursday fetched at two in the morning print "no
 * matches today" all afternoon while the fixtures sit one request away.
 */
function ttlFor(doc, now = Date.now()) {
  const matches = (doc && doc.matches) || [];
  if (matches.some((match) => match.state === 'in')) return LIVE_TTL;
  const upcoming = matches
    .filter((match) => match.state === 'pre' && match.start)
    .map((match) => new Date(match.start).getTime())
    .filter((time) => Number.isFinite(time) && time > now);
  if (upcoming.some((time) => time - now < 3 * HOUR_MS)) return LIVE_TTL;
  if (upcoming.length) return 10 * MINUTE_MS;
  if (!matches.length) {
    // Today or later: keep asking, because the fixtures may simply not have
    // been published yet. A past day that really was empty is not going to fill
    // itself in, and is not worth an upstream call every minute of forever.
    return doc && doc.dateKey >= dayKey(0, new Date(now)) ? LIVE_TTL : 6 * HOUR_MS;
  }
  return 6 * HOUR_MS;
}

function isFresh(doc, now = Date.now()) {
  if (!doc) return false;
  // A row with no stamp on it at all is not evidence of a stale fetch, it is
  // evidence of a half-written one, and treating it as expired would make every
  // single request pay for the feed again.
  const at = dateOf(doc.fetchedAt || doc.updatedAt || doc.createdAt);
  if (!at) return true;
  return now - at.getTime() < ttlFor(doc, now);
}

async function loadScoreboard(code, dateKey, { urgent = false, now = new Date() } = {}) {
  const key = `${code}|${dateKey}`;
  const doc = await SportScoreboard.findOne({ code, dateKey }).lean();
  if (!urgent && doc && isFresh(doc, now.getTime())) return { ok: true, doc, fetched: false };

  const held = pendingRun(key);
  if (held) {
    const answer = await answerFromRun(held);
    return { ok: answer.ok !== false, doc: answer.doc || doc, fetched: false, reason: answer.ok === false ? answer.reason : null };
  }

  // Nobody is waiting on this league and the feed is busy. The page is answered
  // from the database and the poll comes back later. The scheduled pass, which
  // is the work that has to happen either way, is allowed twice as many calls.
  if (!urgent && activeFetches >= MAX_CONCURRENT_FETCHES) return { ok: true, doc, fetched: false, queued: true };

  // The feed said no to this league seconds ago. Say the same thing without
  // asking it again, and let the row that is already here carry the page.
  const refused = recentlyRefused(key);
  if (refused) return { ok: true, doc, fetched: false, reason: refused };

  const run = (async () => {
    const upstream = await fetchJson(scoreboardUrl(code, dateKey), { urgent });
    // The row that was already here travels back with the bad news, so the
    // caller never has to guess whether an empty answer means "no matches" or
    // "no feed".
    if (!upstream.ok) {
      failures.set(key, { at: Date.now(), reason: upstream.reason });
      return { ...upstream, doc };
    }
    failures.delete(key);
    const league = (upstream.body.leagues || [])[0] || {};
    // Stamped with the clock the caller is working to, so one minute of this
    // page has one answer to "how old is this" wherever it is asked.
    const fetchedAt = new Date(now.getTime());
    await store(SportScoreboard, { code, dateKey }, {
      code,
      dateKey,
      league: {
        // The feed names itself. The static table is only used for the leagues
        // listing before anybody has read them.
        name: league.name || '',
        logo: preferredLogo(league.logos),
      },
      matches: (upstream.body.events || []).map(matchRowOf).slice(0, MAX_MATCHES_PER_DAY),
      fetchedAt,
      watchedAt: fetchedAt,
    });
    return { ok: true, doc: await SportScoreboard.findOne({ code, dateKey }).lean(), fetched: true };
  })().finally(() => {
    // Only the process that made the reservation clears it, so a slow pass
    // cannot delete a faster one's place in the queue.
    if (inflight.get(key) === run) inflight.delete(key);
  });
  inflight.set(key, run);
  return run;
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      // One league's bad row must not cancel the other twelve. Everything in
      // here already reports its own failure; this is for the shape nobody
      // predicted, and an abandoned pass would take its results with it.
      try {
        await worker(items[index], index);
      } catch (error) {
        console.warn(`Live score pass abandoned one row: ${error?.message || error}`);
      }
    }
  });
  await Promise.all(runners);
}

/**
 * Wait for a body of background work for a while, without owning it.
 *
 * The fetch that outlives the budget keeps going and lands in the database for
 * the next poll. The timer does not, because a request that answered in 200ms
 * should not hold a sleeping instance awake for six more seconds to find out
 * whether something it has stopped waiting for finished. A rejection is
 * reported as itself rather than as "still running", so a broken read never
 * masquerades as a slow one.
 */
function withBudget(promise, ms) {
  let timer;
  const budget = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ settled: false, timedOut: true }), ms);
    if (typeof timer?.unref === 'function') timer.unref();
  });
  const work = Promise.resolve(promise)
    .then((value) => ({ settled: true, timedOut: false, value }))
    .catch((error) => ({ settled: true, timedOut: false, error: error?.message || String(error) }));
  return Promise.race([work, budget]).finally(() => clearTimeout(timer));
}

// --- what the page asks for -----------------------------------------------------

/**
 * One league's rows, with the truth about how current they are.
 *
 * `stale` is decided by that league's own freshness window, not by whether some
 * other competition happened to still be loading when this request gave up
 * waiting. A reader is told exactly which numbers were not re-read.
 */
function leagueRows(doc, { error = null, pending = false, now = new Date() } = {}) {
  const matches = (doc.matches || [])
    .map((match) => ({
      id: match.id,
      name: match.name,
      shortName: match.shortName,
      start: match.start || null,
      state: match.state,
      statusText: match.statusText || '',
      clock: match.clock || '',
      period: match.period || 0,
      venue: match.venue || '',
      home: match.home || {},
      away: match.away || {},
    }))
    .sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0));
  return {
    code: doc.code,
    name: (doc.league && doc.league.name) || doc.code,
    logo: (doc.league && doc.league.logo) || '',
    matches,
    fetchedAt: doc.fetchedAt || null,
    stale: !isFresh(doc, now.getTime()),
    pending,
    error,
  };
}

function counts(groups) {
  const all = groups.flatMap((group) => group.matches);
  return {
    total: all.length,
    live: all.filter((match) => match.state === 'in').length,
    upcoming: all.filter((match) => match.state === 'pre').length,
    finished: all.filter((match) => match.state === 'post').length,
  };
}

/**
 * Every league we follow on one day, grouped.
 *
 * A cold cache would be thirteen upstream calls, and a reader should not have to
 * wait thirteen fetches out loud: the page is answered from the database, the
 * missing leagues keep fetching in the background, and the poll half a minute
 * later arrives to a filled page.
 */
async function scoreboard({ date, league, live = false, now = new Date() } = {}) {
  const asked = String(date || '').trim();
  if (asked && !dayAllowed(asked, now)) return { ok: false, reason: 'DATE_OUT_OF_RANGE' };
  const dateKey = asked || dayKey(0, now);
  const wanted = String(league || '').trim();
  if (wanted && !validCode(wanted)) return { ok: false, reason: 'UNKNOWN_LEAGUE' };
  const codes = wanted ? [wanted] : leagueList().map((item) => item.code);

  // One read for the whole page rather than thirteen. The cost of a poll on this
  // server stays independent of how many competitions are being followed.
  const stored = await SportScoreboard.find({ code: { $in: codes }, dateKey })
    .select('code dateKey league matches fetchedAt')
    .lean();
  const byCode = new Map(stored.map((doc) => [doc.code, doc]));
  const missing = codes.filter((code) => !isFresh(byCode.get(code), now.getTime()));

  const outcome = new Map();
  if (missing.length) {
    await withBudget(
      mapLimit(missing, MAX_CONCURRENT_FETCHES, async (code) => {
        outcome.set(code, await loadScoreboard(code, dateKey, { now }));
      }),
      REQUEST_BUDGET_MS,
    );
  }

  // Whoever was looking at this day when the request arrived is what keeps the
  // cron interested in it. A page nobody opens is a page that stops being fetched.
  await SportScoreboard.updateMany({ code: { $in: codes }, dateKey }, { $set: { watchedAt: now } }).catch(() => {});

  const groups = [];
  const pending = [];
  const errors = [];
  for (const code of codes) {
    const result = outcome.get(code) || {};
    if (result.ok === false || result.reason) errors.push({ code, reason: result.reason || result.error || 'PROVIDER_ERROR' });
    if (result.queued) pending.push(code);
    const doc = result.doc || byCode.get(code);
    // A league with nothing stored and nothing fetched is not a league with no
    // matches. It is a league this newsroom has not managed to read yet, and it
    // is named as such rather than disappearing from the page.
    if (!doc) {
      if (!pending.includes(code) && missing.includes(code)) pending.push(code);
      continue;
    }
    groups.push(leagueRows(doc, { error: result.ok === false ? result.reason || 'PROVIDER_ERROR' : null, pending: Boolean(result.queued), now }));
  }

  const filtered = live
    ? groups.map((group) => ({ ...group, matches: group.matches.filter((match) => match.state === 'in') })).filter((group) => group.matches.length)
    : groups;

  const anyLive = filtered.some((group) => group.matches.some((match) => match.state === 'in'));
  const refreshing = pending.length > 0;
  const pollSeconds = refreshing ? REFRESHING_POLL_SECONDS : Math.round((anyLive ? REFRESH_MS : 5 * MINUTE_MS) / 1000);

  return {
    ok: true,
    provider: PROVIDER,
    dateKey,
    dayClock: wallClock(now, env.SCHEDULER_TZ).dateKey,
    leagues: filtered,
    // Everything this newsroom follows, named, whether or not it has anything on
    // this day. A page that only lists the competitions with matches reads as
    // though the others were never followed at all, and the reader who wants the
    // Turkish table has no way to say so.
    //
    // The badge comes from the newsroom's own list first, because a row of chips
    // printed from one source is a row of badges that actually match each other,
    // and because the list still has a name for a competition whose day has not
    // been read yet. The feed's name wins where it has one: it is the competition
    // calling itself that, on that day, in that season.
    followed: leagueList().map((item) => {
      const doc = byCode.get(item.code);
      return {
        code: item.code,
        name: (doc && doc.league && doc.league.name) || item.name || item.code,
        logo: item.logo || (doc && doc.league && doc.league.logo) || '',
      };
    }),
    counts: counts(filtered),
    pendingLeagues: pending,
    errors,
    stale: filtered.some((group) => group.stale),
    refreshing,
    pollSeconds,
    refreshSeconds: REFRESH_SECONDS,
    nextRefreshAt: new Date(now.getTime() + pollSeconds * 1000).toISOString(),
  };
}

/**
 * Everything a reader wants after clicking a match: who scored, who was booked,
 * who came on, what the two teams did with the ball.
 *
 * Only the page somebody is actually looking at asks for this, so it is fetched
 * on demand rather than crawled for every match in every competition.
 */
async function matchDetail(id, { league, now = new Date() } = {}) {
  const espnId = String(id || '').trim();
  if (!/^[0-9]{4,12}$/.test(espnId)) return { ok: false, reason: 'BAD_MATCH' };

  const stored = await SportMatch.findOne({ espnId })
    .select('espnId code league state name clock statusText start fetchedAt')
    .lean();
  // The minute a match is being played and the title over the page are printed
  // by the day's scoreboard, which the cron already re-reads every minute for any
  // day a reader has open. Reading that row from our own database costs one query
  // and is what lets a match page keep counting up without asking the source
  // again - the summary payload carries neither.
  const from = await scoreboardRowFor(espnId);
  // A match that is being played is re-read with the live documents; one that
  // has finished is a fact that will not change again this week. The state the
  // reader is shown is the fresher of the two prints, so a fixture that has just
  // kicked off is treated as live rather than sitting out its pre-match window.
  const shown = stateOf(stored, from);
  const ttlForState = (state) => (state === 'in' ? LIVE_TTL : state === 'pre' ? 30 * MINUTE_MS : 12 * HOUR_MS);
  const stamp = stored && dateOf(stored.fetchedAt);
  if (stamp && now.getTime() - stamp.getTime() < ttlForState(shown)) {
    await SportMatch.updateOne({ espnId }, { $set: { watchedAt: now } }).catch(() => {});
    return presentMatch(await SportMatch.findOne({ espnId }).lean(), { stale: false, from });
  }

  const code = String(league || (stored && stored.code) || '').trim();
  if (!code || !validCode(code)) {
    // The reader is looking at a real match. Without a competition to ask, the
    // last thing known about it is the honest answer.
    return stored ? presentMatch(await SportMatch.findOne({ espnId }).lean(), { stale: true, from }) : { ok: false, reason: 'UNKNOWN_LEAGUE' };
  }

  const key = `match|${code}|${espnId}`;
  const pending = pendingRun(key);
  if (pending) return await answerFromRun(pending);

  // A match page the feed refused seconds ago is answered from this database
  // rather than by asking again on every poll of every open tab.
  const refused = recentlyRefused(key);
  if (refused) {
    return stored ? presentMatch(await SportMatch.findOne({ espnId }).lean(), { stale: true, from }) : failed(refused);
  }

  const run = (async () => {
    const upstream = await fetchJson(summaryUrl(code, espnId));
    if (!upstream.ok) {
      failures.set(key, { at: Date.now(), reason: upstream.reason });
      // An unreachable feed is reported as the last known state of the match the
      // reader is looking at, never as "no data".
      return stored ? presentMatch(await SportMatch.findOne({ espnId }).lean(), { stale: true, from }) : upstream;
    }
    failures.delete(key);
    const body = upstream.body;
    const header = body.header || {};
    const leagueSeen = (body.leagues || [])[0] || header.league || {};
    const competition = (header.competitions || [])[0] || {};
    const status = competition.status || {};
    const type = status.type || {};
    const state = type.state || 'pre';
    const competitors = competition.competitors || [];
    const boxTeams = (body.boxscore && body.boxscore.teams) || [];
    const rosters = body.rosters || [];
    const events = (body.keyEvents || []).map(eventOf).filter(Boolean);
    // Half time ends the first period with a clock of 45 minutes and the second
    // begins with a clock of zero, so the period and the clock alone put the
    // second half's events before the whistle that ended the first. The feed's
    // own wall clock is what says when each line was really written.
    events.sort(
      (a, b) =>
        (a.wallclock?.getTime() ?? 0) - (b.wallclock?.getTime() ?? 0) ||
        (a.period - b.period) * 100000 + (a.second - b.second),
    );

    const printed = (from && from.row) || {};
    const fetchedAt = new Date(now.getTime());
    await store(SportMatch, { espnId }, {
      espnId,
      code,
      league: {
        name: leagueSeen.name || (stored && stored.league && stored.league.name) || '',
        // Whatever the feed printed this time; the row already here if it did
        // not print one, so a badge never goes blank on a lucky day.
        logo: preferredLogo(leagueSeen.logos) || (stored && stored.league && stored.league.logo) || '',
      },
      // Kept from the scoreboard whenever the summary printed nothing, so a
      // refresh of a live match never wipes the line the reader is looking at.
      name: header.name || printed.name || (stored && stored.name) || '',
      start: dateOf(competition.date || printed.start),
      state,
      statusText: type.shortDetail || type.detail || printed.statusText || (stored && stored.statusText) || '',
      clock: state === 'pre' ? '' : String(status.displayClock ?? '') || printed.clock || (stored && stored.clock) || '',
      venue: (body.gameInfo && body.gameInfo.venue && body.gameInfo.venue.fullName) || printed.venue || '',
      attendance: body.gameInfo && body.gameInfo.attendance != null ? String(body.gameInfo.attendance) : '',
      home: sideFromSummary(
        rosters.find((item) => item.homeAway === 'home'),
        boxTeams.find((item) => item.homeAway === 'home'),
        competitors.find((item) => item.homeAway === 'home') || {},
        state,
      ),
      away: sideFromSummary(
        rosters.find((item) => item.homeAway === 'away'),
        boxTeams.find((item) => item.homeAway === 'away'),
        competitors.find((item) => item.homeAway === 'away') || {},
        state,
      ),
      events: printableEvents(events),
      stats: statRowsOf(body.boxscore),
      fetchedAt,
      watchedAt: fetchedAt,
    });
    return presentMatch(await SportMatch.findOne({ espnId }).lean(), { stale: false, from });
  })().finally(() => {
    if (inflight.get(key) === run) inflight.delete(key);
  });
  inflight.set(key, run);
  return run;
}

/**
 * The same match as the day's scoreboard last printed it.
 *
 * A match belongs to one day, but a postponed one can be reprinted on a later
 * row, so the newest day wins.
 */
async function scoreboardRowFor(espnId) {
  const doc = await SportScoreboard.findOne({ 'matches.id': espnId }, { 'matches.$': 1, fetchedAt: 1 })
    .sort({ dateKey: -1 })
    .lean();
  const row = doc && (doc.matches || [])[0];
  if (!row) return null;
  return { row, at: dateOf(doc.fetchedAt) };
}

/** The state the reader is told: whichever of the two prints the feed made later. */
function stateOf(stored, from) {
  if (!from) return stored ? stored.state : 'pre';
  const atDoc = stored && dateOf(stored.fetchedAt);
  if (!atDoc || (from.at && from.at.getTime() > atDoc.getTime())) return from.row.state || 'pre';
  return stored.state;
}

function presentMatch(doc, { stale, from }) {
  if (!doc) return { ok: false, reason: 'NOT_FOUND' };
  const possession = (doc.stats || []).find((stat) => stat.name === 'possessionPct') || null;
  const row = (from && from.row) || null;
  const at = dateOf(doc.fetchedAt);
  // Strictly later, so a tie - the same minute for both prints, which is what a
  // reader who opened the page just after the pass ran gets - goes to the match
  // page. It is the read somebody asked for, and it carries the goal.
  const rowIsNewer = Boolean(row) && (!at || (from.at && from.at.getTime() > at.getTime()));
  // Two prints of one match: the day's scoreboard, which carries the title and
  // the minute but not the goals, and the match page, which carries everything
  // else and no minute at all. Each line is taken from whichever print the feed
  // made later, and from the other when the later one says nothing - which is
  // how the summary of a live match still lands on a page that shows a clock.
  const shown = (detail, printed) => (rowIsNewer ? firstOf(printed, detail) : firstOf(detail, printed));
  const state = stateOf(doc, from);
  const side = (detail, printedSide) => {
    const base = detail || {};
    if (!printedSide) return base;
    return {
      ...base,
      name: firstOf(base.name, printedSide.name),
      short: firstOf(base.short, printedSide.short),
      logo: firstOf(base.logo, printedSide.logo),
      record: firstOf(base.record, printedSide.record),
      form: firstOf(base.form, printedSide.form),
      score: state === 'pre' ? '' : shown(base.score, printedSide.score),
      winner: Boolean(rowIsNewer ? printedSide.winner : base.winner),
    };
  };
  return {
    ok: true,
    stale: Boolean(stale),
    provider: PROVIDER,
    id: doc.espnId,
    code: doc.code,
    league: doc.league || { name: '', logo: '' },
    name: shown(doc.name, row && row.name),
    start: doc.start || (row && row.start) || null,
    state,
    statusText: shown(doc.statusText, row && row.statusText),
    clock: state === 'pre' ? '' : shown(doc.clock, row && row.clock),
    venue: firstOf(doc.venue, row && row.venue),
    attendance: doc.attendance || '',
    home: side(doc.home, row && row.home),
    away: side(doc.away, row && row.away),
    events: printableEvents(doc.events),
    // Possession is drawn as its own bar, so it is not repeated as a row.
    stats: (doc.stats || []).filter((stat) => stat.name !== 'possessionPct'),
    // The label comes from the stored row - the feed's own words for it - rather
    // than from an internal name that happens to sound like a percentage.
    possession: possession ? { label: possession.label || 'Possession', home: possession.home, away: possession.away } : null,
    fetchedAt: doc.fetchedAt || null,
  };
}

/**
 * Every table the standings document contains, in whatever order it chose to
 * carry them.
 *
 * The feed nests differently per competition - a league puts one table under the
 * season, a group stage puts a table per group, and a knockout puts the whole
 * thing under children - so the shape is searched rather than assumed. A node
 * that has rows is a table and stops the walk; a node that has none is a branch.
 */
function collectTables(node, found = []) {
  if (!node) return found;
  if (Array.isArray(node)) {
    node.forEach((item) => collectTables(item, found));
    return found;
  }
  if (Array.isArray(node.entries) && node.entries.length) {
    found.push({ name: node.name || node.displayName || '', entries: node.entries });
    return found;
  }
  for (const key of ['standings', 'groups', 'children']) collectTables(node[key], found);
  return found;
}

/**
 * The league table. It moves once a matchday, so it is asked for on its own
 * clock and a reader almost always gets it straight out of the database.
 */
async function standings(league, { now = new Date() } = {}) {
  const code = String(league || '').trim();
  if (!code || !validCode(code)) return { ok: false, reason: 'UNKNOWN_LEAGUE' };
  const stored = await SportStandings.findOne({ code }).lean();
  const stamp = stored && dateOf(stored.fetchedAt);
  if (stamp && now.getTime() - stamp.getTime() < STANDINGS_TTL) {
    await SportStandings.updateOne({ code }, { $set: { watchedAt: now } }).catch(() => {});
    return presentStandings(stored, { stale: false });
  }

  const key = `standings|${code}`;
  const pending = pendingRun(key);
  if (pending) return await answerFromRun(pending);

  const refused = recentlyRefused(key);
  if (refused) return stored ? presentStandings(stored, { stale: true }) : failed(refused);

  const run = (async () => {
    const upstream = await fetchJson(standingsUrl(code));
    if (!upstream.ok) {
      failures.set(key, { at: Date.now(), reason: upstream.reason });
      return stored ? presentStandings(stored, { stale: true }) : upstream;
    }
    failures.delete(key);
    const body = upstream.body;
    // A league answers with one table under the season, and a cup with a table
    // per group. The feed's own document says which it is, and both shapes are
    // walked rather than guessed at, because a cup read as a league is a table of
    // nothing and a league read as a cup is thirty-eight rows of blanks.
    const tables = collectTables(body, []);

    // One list, with the group named on every row. Thirty-two clubs out of
    // eight groups is not one table, and a page that pretends it is gives rows
    // that cannot be read.
    const entries = [];
    // The rows come out in the order the competition published them, with the
    // rank it printed on each one. Re-sorting them by points here would move a
    // club the league is holding twelfth above one it is holding eighteenth,
    // which is a table RADAR invented and the competition did not.
    for (const table of tables) {
      table.entries.forEach((row, index) => entries.push({ ...standingsEntryOf(row, index + 1, index + 1), table: table.name }));
    }

    const fetchedAt = new Date(now.getTime());
    await store(SportStandings, { code }, {
      code,
      league: {
        name: body.name || (stored && stored.league && stored.league.name) || '',
        logo: preferredLogo(body.logos) || (stored && stored.league && stored.league.logo) || '',
      },
      season: (body.season && (body.season.displayName || String(body.season.year))) || (stored && stored.season) || '',
      entries,
      fetchedAt,
      watchedAt: fetchedAt,
    });
    return presentStandings(await SportStandings.findOne({ code }).lean(), { stale: false });
  })().finally(() => {
    if (inflight.get(key) === run) inflight.delete(key);
  });
  inflight.set(key, run);
  return run;
}

function presentStandings(doc, { stale }) {
  if (!doc) return { ok: false, reason: 'NOT_FOUND' };
  return {
    ok: true,
    stale: Boolean(stale),
    provider: PROVIDER,
    code: doc.code,
    league: doc.league || { name: '', logo: '' },
    season: doc.season || '',
    entries: doc.entries || [],
    fetchedAt: doc.fetchedAt || null,
  };
}

// --- the background pass --------------------------------------------------------

/**
 * Keep warm what a reader is actually watching, and only that.
 *
 * This is the whole reason a free instance can carry a live scores page: the
 * work is done once per watched league per minute by one process, and every
 * other request on earth is answered from the database. A site nobody is reading
 * fetches nothing at all.
 */
async function refreshWatched({ now = new Date() } = {}) {
  const since = new Date(now.getTime() - WATCHED_WINDOW_MS);
  const days = [dayKey(0, now), dayKey(1, now)];
  let refreshed = 0;
  let failedCount = 0;

  const warm = await SportScoreboard.find({ watchedAt: { $gte: since }, dateKey: { $in: days } })
    .sort({ watchedAt: -1 })
    .limit(MAX_REFRESH_PER_RUN)
    .select('code dateKey fetchedAt matches')
    .lean();
  const needs = warm.filter((doc) => !isFresh(doc, now.getTime()));
  // One pass, one budget. A feed that stops answering one league is not allowed
  // to hold the whole minute, because the minute is what every reader on the
  // page is counting on.
  const pass = await withBudget(
    mapLimit(needs, MAX_CONCURRENT_FETCHES, async (doc) => {
      const result = await loadScoreboard(doc.code, doc.dateKey, { urgent: true, now });
      if (result.ok === false) failedCount += 1;
      else refreshed += 1;
    }),
    CRON_BUDGET_MS,
  );
  if (pass.error) console.warn(`Live score pass reported a problem: ${pass.error}`);

  // A match somebody has open is worth its own refresh: the scoreboard gives the
  // minute and the score, but only the match page has the goal that went in.
  const openMatches = await SportMatch.find({ state: 'in', watchedAt: { $gte: since } })
    .sort({ watchedAt: -1 })
    .limit(6)
    .select('espnId code')
    .lean();
  await withBudget(
    mapLimit(openMatches, 2, async (match) => {
      const result = await matchDetail(match.espnId, { league: match.code, now });
      if (result && result.ok === false) failedCount += 1;
      else refreshed += 1;
    }),
    15 * 1000,
  );

  const tables = await SportStandings.find({ watchedAt: { $gte: since } })
    .sort({ watchedAt: -1 })
    .limit(4)
    .select('code fetchedAt')
    .lean();
  await withBudget(
    mapLimit(tables, 1, async (table) => {
      const stamp = dateOf(table.fetchedAt);
      if (stamp && now.getTime() - stamp.getTime() < STANDINGS_TTL) return;
      const result = await standings(table.code, { now });
      if (result && result.ok === false) failedCount += 1;
      else refreshed += 1;
    }),
    10 * 1000,
  );

  // Days fall off the page on their own, in both directions: nothing a reader
  // could still be looking at goes, and nothing that only a script asked for
  // stays. The match pages go on the same clock as the days they came from,
  // because a result nobody has opened in a week is a story, not a score - and a
  // match the feed never gave a date to ages on the day it was read, because
  // otherwise it is the one row nothing would ever clear.
  const cutoff = now.getTime() - KEEP_DAYS * 24 * HOUR_MS;
  const pruned = await SportScoreboard
    .deleteMany({ $or: [{ dateKey: { $lt: dayKey(KEEP_DAYS - 1, now) } }, { dateKey: { $gt: dayKey(-AHEAD_DAYS, now) } }] })
    .catch(() => ({ deletedCount: 0 }));
  const prunedMatches = await SportMatch.deleteMany({
    $or: [{ start: { $lt: new Date(cutoff) } }, { start: null, fetchedAt: { $lt: new Date(cutoff) } }],
  }).catch(() => ({ deletedCount: 0 }));

  return {
    refreshed,
    failed: failedCount,
    watched: warm.length,
    pruned: (pruned.deletedCount || 0) + (prunedMatches.deletedCount || 0),
  };
}

/** The leagues listing, with whatever the database already knows about them. */
async function leagues({ now = new Date() } = {}) {
  const dateKey = dayKey(0, now);
  const list = leagueList();
  const docs = await SportScoreboard.find({ code: { $in: list.map((item) => item.code) }, dateKey })
    .select('code league matches fetchedAt')
    .lean();
  const byCode = new Map(docs.map((doc) => [doc.code, doc]));
  return {
    ok: true,
    provider: PROVIDER,
    dateKey,
    refreshSeconds: REFRESH_SECONDS,
    leagues: list.map((league) => {
      const doc = byCode.get(league.code);
      const matches = (doc && doc.matches) || [];
      return {
        code: league.code,
        // The name the feed printed for this league wins over the static table,
        // because the static table is ours and the feed is the competition's.
        name: (doc && doc.league && doc.league.name) || league.name || league.code,
        logo: (doc && doc.league && doc.league.logo) || league.logo || '',
        matches: matches.length,
        live: matches.filter((match) => match.state === 'in').length,
        fetchedAt: (doc && doc.fetchedAt) || null,
      };
    }),
  };
}

/**
 * Find a team or a competition in what the scores desk has already read.
 *
 * A reader who types "Arsenal" wants the Arsenal rows; one who types "Champions"
 * wants the competition. Both are answered out of our own database and our own
 * list of leagues, and the feed is never asked - which is what makes this search
 * free. A thousand people searching at once is a thousand reads of a collection
 * this server already holds, not a thousand more requests to somebody else.
 *
 * The days it can see are the days the page can see: the last week and the three
 * weeks ahead, and only the ones somebody has opened, because a day nobody
 * looked at was never fetched. A team that is not in the answer is not in those
 * days, and the page says exactly that rather than guessing at a fixture list.
 */
const SEARCH_LIMIT = 30;
const SEARCH_COMPETITION_LIMIT = 8;

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function search({ q, now = new Date() } = {}) {
  const term = String(q || '').trim().slice(0, 60);
  const needle = term.toLowerCase();
  if (needle.length < 2) {
    // Two letters is where a name stops being an accident. Below it the answer
    // is a wall of rows nobody asked for, so nothing is searched at all.
    return { ok: true, term, competitions: [], matches: [], earliest: null, latest: null };
  }

  const pattern = new RegExp(escapeForRegex(needle), 'i');
  const list = leagueList();
  const competitions = list
    .filter((league) => `${league.name} ${league.code}`.toLowerCase().includes(needle))
    .slice(0, SEARCH_COMPETITION_LIMIT)
    .map((league) => ({ code: league.code, name: league.name || league.code, logo: league.logo || '' }));

  const earliest = dayKey(KEEP_DAYS - 1, now);
  const latest = dayKey(-AHEAD_DAYS, now);
  // The codes come first so the read uses the same index every other read on
  // this collection uses, instead of walking the whole cache for one name.
  const stored = await SportScoreboard
    .find({
      code: { $in: list.map((league) => league.code) },
      dateKey: { $gte: earliest, $lte: latest },
      $or: [
        { 'matches.home.name': pattern },
        { 'matches.away.name': pattern },
        { 'matches.home.short': pattern },
        { 'matches.away.short': pattern },
      ],
    })
    .select('code dateKey league matches')
    .lean();

  const matches = [];
  for (const doc of stored) {
    for (const match of doc.matches || []) {
      const home = match.home || {};
      const away = match.away || {};
      const named = `${home.name || ''} ${home.short || ''} ${away.name || ''} ${away.short || ''}`;
      // The database said one of the four sides matched; the row is checked
      // against the whole sentence here so the answer is the name the reader
      // typed and not a sibling that happened to share a substring.
      if (!pattern.test(named)) continue;
      matches.push({
        id: match.id,
        name: match.name,
        shortName: match.shortName,
        start: match.start || null,
        state: match.state,
        statusText: match.statusText || '',
        clock: match.clock || '',
        period: match.period || 0,
        venue: match.venue || '',
        home,
        away,
        code: doc.code,
        leagueName: (doc.league && doc.league.name) || doc.code,
        dateKey: doc.dateKey,
      });
    }
  }

  // Newest first: somebody looking for a club wants to see what it did last.
  // What is still to come is on the day they land on when they open the row.
  matches.sort((a, b) => new Date(b.start || 0) - new Date(a.start || 0));

  return {
    ok: true,
    term,
    competitions,
    matches: matches.slice(0, SEARCH_LIMIT),
    // What the search could see, printed so an empty answer can say why it is
    // empty instead of looking like a broken one.
    earliest,
    latest,
  };
}

/**
 * Forgets who is fetching what and which league the feed recently refused.
 *
 * The suite needs this because those two memories are the design: without
 * clearing them a test would answer from the previous test's fetch and prove
 * nothing about the one it is supposed to make. Nothing in the newsroom calls
 * it - a running server is meant to remember.
 */
function resetCaches() {
  inflight.clear();
  failures.clear();
}

module.exports = {
  scoreboard,
  matchDetail,
  standings,
  leagues,
  search,
  refreshWatched,
  resetCaches,
  leagueList,
  dayKey,
  dayAllowed,
  matchRowOf,
  eventOf,
  printableEvents,
  standingsEntryOf,
  statRowsOf,
  kindOf,
  scoreboardUrl,
  summaryUrl,
  standingsUrl,
  PROVIDER,
  REFRESH_MS,
  REFRESH_SECONDS,
  LIVE_TTL,
  TIMEOUT_MS,
  KEEP_DAYS,
  AHEAD_DAYS,
};
