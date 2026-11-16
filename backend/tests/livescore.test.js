/**
 * The scores page, from the feed to the rows a reader is shown.
 *
 * Nothing in this file talks to ESPN. Every answer is a fixture copied from a
 * real response and kept in the shape the real response has, and the tests are
 * about the four promises the page is built on: the reader's browser never asks
 * a sports feed, one day is fetched once and served from our own database to
 * everybody else, a number on the page is a number the feed printed, and a feed
 * that is down is reported as down instead of shown as an empty Tuesday.
 */
process.env.MONGODB_URI = '';
// Two competitions rather than the thirteen the site follows: a test that counts
// upstream calls has to know how many calls it is asking for.
process.env.LIVESCORE_LEAGUES = 'eng.1,esp.1';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const SportScoreboard = require('../src/models/SportScoreboard');
const SportMatch = require('../src/models/SportMatch');
const SportStandings = require('../src/models/SportStandings');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const liveScoreService = require('../src/services/liveScoreService');

const { dayKey, scoreboard, matchDetail, standings, leagues, search, refreshWatched } = liveScoreService;

// The service stamps what it stores with the real clock, so the tests ask
// questions of the same clock rather than a fixed date that would drift away
// from it. One minute of real time is the whole unit of this page, so the
// fixtures move forward and back in minutes.
const now = new Date();
const TODAY = dayKey(0, now);
const YESTERDAY = dayKey(1, now);
const TOMORROW = dayKey(-1, now);
const minutes = (count) => new Date(now.getTime() + count * 60 * 1000);
const at = (count) => minutes(count).toISOString();

// The feed carries a light and a dark badge for every club and competition, and
// the dark one has a black box baked into it. On a blue-and-white page, taking
// whichever came first in the array is a printing error, so the order here is
// deliberately dark-first.
const DARK = (id) => ({ href: `https://a.espncdn.com/dark/${id}.png`, rel: ['primary', 'dark'] });
const LIGHT = (id) => ({ href: `https://a.espncdn.com/light/${id}.png`, rel: ['light', 'default'] });

const club = (id, name, short) => ({
  id: String(id),
  displayName: name,
  shortDisplayName: short,
  logos: [DARK(id), LIGHT(id)],
});

function competitor(id, name, short, { homeAway, score, form, summary, winner = false }) {
  return {
    homeAway,
    score,
    team: club(id, name, short),
    records: [{ summary }],
    form,
    winner,
  };
}

function match(id, { name, away, home, state, status, clock = '', period = 0, start }) {
  return {
    id: String(id),
    name,
    shortName: name.split(' at ')[0],
    date: start,
    competitions: [
      {
        date: start,
        venue: { fullName: 'Elland Road' },
        status: {
          clock: period * 45 * 60,
          displayClock: clock,
          period,
          type: { name: `STATUS_${state.toUpperCase()}`, state, detail: status, shortDetail: status, description: status },
        },
        // Printed away-first, as one real Championship day did: the page has to
        // read the homeAway marker and not the position in the array.
        competitors: [away, home],
      },
    ],
  };
}

const LEEDS = (score, winner) => competitor(357, 'Leeds United', 'Leeds', { homeAway: 'home', score, winner, summary: '3-5-2', form: 'WLDDL' });
const SPURS = (score, winner) => competitor(367, 'Tottenham Hotspur', 'Spurs', { homeAway: 'away', score, winner, summary: '3-3-4', form: 'LWWWD' });
const ARSENAL = (score, winner) => competitor(359, 'Arsenal', 'Arsenal', { homeAway: 'home', score, winner, summary: '9-0-1', form: 'WWWLW' });
const HULL = (score, winner) => competitor(306, 'Hull City', 'Hull', { homeAway: 'away', score, winner, summary: '2-5-3', form: 'LDDLD' });

/** A day with one match in play and one fixture yet to kick off. */
const scoreboardFeed = (name) => ({
  leagues: [{ uid: 's/60~l/43~l/1', name, logos: [DARK('league'), LIGHT('league')] }],
  events: [
    match(401878758, {
      name: 'Tottenham Hotspur at Leeds United',
      state: 'in',
      status: "2nd 48'",
      clock: "48'",
      period: 2,
      start: at(-60),
      home: LEEDS('1', true),
      away: SPURS('0'),
    }),
    // A fixture that has not been played is printed with a score of "0" by this
    // feed. The page must not show it.
    match(401878760, {
      name: 'Hull City at Arsenal',
      state: 'pre',
      status: 'Scheduled',
      start: at(120),
      home: ARSENAL('0'),
      away: HULL('0'),
    }),
  ],
});

/**
 * The summary of the live match above, in the shape ESPN actually answers.
 *
 * Note what is missing: this payload prints no title, no minute and no clock for
 * the match. Those are the scoreboard's, and it is the point of several of the
 * tests below.
 */
function summaryFeed({ state = 'in', status = "2nd 48'", competitors = [LEEDS('1', true), SPURS('0')] } = {}) {
  return {
    header: {
      id: '401878758',
      competitions: [
        {
          id: '401878758',
          date: at(-60),
          status: { type: { state, detail: status, shortDetail: status, description: status } },
          competitors,
        },
      ],
    },
    leagues: [{ name: 'English Premier League', logos: [DARK('league'), LIGHT('league')] }],
    gameInfo: { venue: { fullName: 'Elland Road' }, attendance: 37851 },
    rosters: [
      {
        homeAway: 'home',
        team: club(357, 'Leeds United', 'Leeds'),
        formation: '4-2-3-1',
        winner: true,
        roster: [
          { jersey: '9', starter: true, position: { displayName: 'Forward' }, athlete: { id: '270641', displayName: 'Noah Okafor' } },
          { jersey: '1', starter: true, position: { displayName: 'Goalkeeper' }, athlete: { id: '111', displayName: 'Lucas Perri' } },
          // A row with no name is not a player.
          { jersey: '0', athlete: {} },
        ],
      },
      {
        homeAway: 'away',
        team: club(367, 'Tottenham Hotspur', 'Spurs'),
        formation: '4-3-3',
        roster: [{ jersey: '19', starter: false, athlete: { id: '222', displayName: 'Dominic Solanke' } }],
      },
    ],
    boxscore: {
      teams: [
        {
          homeAway: 'home',
          team: club(357, 'Leeds United', 'Leeds'),
          statistics: [
            { name: 'possessionPct', label: 'Possession', displayValue: '39.2', value: 0.392 },
            { name: 'totalShots', label: 'SHOTS', displayValue: '16', value: 16 },
            { name: 'yellowCards', label: 'Yellow Cards', displayValue: '2', value: 2 },
            // No label at all: the feed's own pipeline field, not a statistic a
            // competition shows a reader.
            { name: 'shotMatrix', displayValue: '', value: 0 },
            { name: 'expectedGoals', displayValue: '1.2', value: 1.2 },
          ],
        },
        {
          homeAway: 'away',
          team: club(367, 'Tottenham Hotspur', 'Spurs'),
          statistics: [
            { name: 'possessionPct', displayValue: '60.8', value: 0.608 },
            { name: 'totalShots', displayValue: '7', value: 7 },
            { name: 'yellowCards', displayValue: '3', value: 3 },
          ],
        },
      ],
    },
    keyEvents: [
      // The stoppage noise, printed twice every time play restarts.
      { id: '1', type: { text: 'Start Delay', type: 'start-delay' }, period: { number: 1 }, clock: { value: 60, displayValue: "1'" }, wallclock: at(-59) },
      { id: '2', type: { text: 'End Delay', type: 'end-delay' }, period: { number: 1 }, clock: { value: 60, displayValue: "1'" }, wallclock: at(-58) },
      { id: '3', type: { id: '80', text: 'Kickoff', type: 'kickoff' }, period: { number: 1 }, clock: { value: 0, displayValue: '' }, scoringPlay: false, wallclock: at(-60) },
      {
        id: '4',
        type: { text: 'Yellow Card', type: 'yellow-card' },
        text: 'Micky van de Ven (Tottenham Hotspur) is shown the yellow card for a bad foul.',
        period: { number: 1 },
        clock: { value: 900, displayValue: "15'" },
        team: { id: '367', displayName: 'Tottenham Hotspur' },
        participants: [{ athlete: { id: '333', displayName: 'Micky van de Ven' } }],
        wallclock: at(-45),
      },
      // The one that reads like a booking and is not one.
      {
        id: '5',
        type: { text: 'Substitution', type: 'substitution' },
        text: 'Substitution, Tottenham Hotspur. Dominic Solanke replaces Mathys Tel because of an injury.',
        period: { number: 1 },
        clock: { value: 2580, displayValue: "43'" },
        team: { id: '367', displayName: 'Tottenham Hotspur' },
        participants: [{ athlete: { id: '222', displayName: 'Dominic Solanke' } }, { athlete: { id: '444', displayName: 'Mathys Tel' } }],
        wallclock: at(-17),
      },
      { id: '6', type: { text: 'Halftime', type: 'halftime' }, period: { number: 1 }, clock: { value: 2700, displayValue: '' }, wallclock: at(-15) },
      { id: '7', type: { text: 'Start 2nd Half', type: 'start-2nd-half' }, period: { number: 2 }, clock: { value: 0, displayValue: '' }, wallclock: at(-13) },
      {
        id: '8',
        type: { text: 'Goal', type: 'goal' },
        text: 'Goal! Leeds United 1, Tottenham Hotspur 0. Noah Okafor (Leeds United) right footed shot from the centre of the box to the bottom left corner.',
        shortText: 'Noah Okafor Goal',
        period: { number: 2 },
        clock: { value: 4712, displayValue: "79'" },
        scoringPlay: true,
        team: { id: '357', displayName: 'Leeds United' },
        participants: [{ athlete: { id: '270641', displayName: 'Noah Okafor' } }],
        wallclock: at(-1),
      },
      { id: '9', type: { text: 'End Regular Time', type: 'end-regular-time' }, period: { number: 2 }, clock: { value: 5400, displayValue: '' }, wallclock: at(0) },
    ],
  };
}

function standingRow(id, name, { rank, played, win, draw, loss, for: scored, against, difference, points, deductions = '', note = '' }) {
  return {
    team: club(id, name, name.split(' ')[0]),
    note: note ? { rank, color: '#81D6AC', description: note } : undefined,
    stats: [
      { name: 'rank', displayValue: String(rank), value: rank },
      { name: 'gamesPlayed', displayValue: String(played), value: played },
      { name: 'wins', displayValue: String(win), value: win },
      { name: 'ties', displayValue: String(draw), value: draw },
      { name: 'losses', displayValue: String(loss), value: loss },
      { name: 'pointsFor', displayValue: String(scored), value: scored },
      { name: 'pointsAgainst', displayValue: String(against), value: against },
      { name: 'pointDifferential', displayValue: difference, value: Number(difference) },
      { name: 'points', displayValue: String(points), value: points },
      { name: 'overall', displayValue: `${win}-${draw}-${loss}`, value: win },
      { name: 'deductions', displayValue: deductions, value: deductions === '' ? 0 : Number(deductions) },
    ],
  };
}

const standingsFeed = (entries) => ({
  id: '43',
  name: 'English Premier League',
  season: { year: 2026, displayName: '2026-27 English Premier League' },
  children: [{ id: 'stage-1', name: '2026-27 English Premier League', standings: { id: 'table-1', name: '', entries } }],
});

/**
 * The network, stood in for. Every answer is a fixture, and the calls are
 * counted because the whole point of the design is how few of them there are.
 */
function stubFetch(respond) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const target = String(url);
    calls.push(target);
    return respond(target);
  };
  return {
    calls,
    count: (part) => calls.filter((url) => url.includes(part)).length,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const httpResponse = (status) => ({ ok: status >= 200 && status < 300, status, json: async () => ({}) });

/** The two leagues of the watch list answered with the same fixture day. */
const dayEverywhere = () => stubFetch((url) => jsonResponse(scoreboardFeed(url.includes('esp.1') ? 'Spanish LALIGA' : 'English Premier League')));

test.before(async () => {
  await connectDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test.beforeEach(() => {
  // The process remembers who it is fetching for and what the feed refused
  // recently. That memory is the design, and it is also the one thing that
  // would let a test pass by reading the previous test's fetch.
  liveScoreService.resetCaches();
});

// --- the page a reader opens -------------------------------------------------------

test('one day is fetched once per competition and grouped with the feed’s own names', async () => {
  const stub = dayEverywhere();
  try {
    const page = await scoreboard({ now });
    assert.equal(stub.calls.length, 2, 'two leagues, two calls');
    assert.equal(page.ok, true);
    assert.equal(page.provider, 'espn');
    assert.equal(page.dateKey, TODAY);
    assert.equal(page.leagues.length, 2);
    assert.deepEqual(
      page.leagues.map((group) => group.name),
      ['English Premier League', 'Spanish LALIGA'],
    );

    const premier = page.leagues[0];
    // The light badge, not whichever came first.
    assert.equal(premier.logo, 'https://a.espncdn.com/light/league.png');
    assert.equal(premier.matches.length, 2);
    assert.equal(premier.stale, false);

    const live = premier.matches[0];
    assert.equal(live.state, 'in');
    assert.equal(live.clock, "48'");
    assert.equal(live.statusText, "2nd 48'");
    // Home is the side the feed marked home, not the side it listed first.
    assert.equal(live.home.name, 'Leeds United');
    assert.equal(live.home.score, '1');
    assert.equal(live.home.logo, 'https://a.espncdn.com/light/357.png');
    assert.equal(live.home.record, '3-5-2');
    assert.equal(live.home.form, 'WLDDL');
    assert.equal(live.away.name, 'Tottenham Hotspur');
    assert.equal(live.away.score, '0');

    // A fixture that has not been played has no score, however the feed wrote it.
    const fixture = premier.matches[1];
    assert.equal(fixture.state, 'pre');
    assert.equal(fixture.home.score, '');
    assert.equal(fixture.away.score, '');
    assert.equal(fixture.clock, '');

    assert.deepEqual(page.counts, { total: 4, live: 2, upcoming: 2, finished: 0 });
    // A page with a match in play asks again on the cron's own clock.
    assert.equal(page.pollSeconds, 60);
    assert.equal(page.refreshing, false);
    assert.equal(await SportScoreboard.countDocuments({ dateKey: TODAY }), 2);
  } finally {
    stub.restore();
  }
});

test('the next sixty readers of that day are answered from the database', async () => {
  await SportScoreboard.deleteMany({});
  const stub = dayEverywhere();
  try {
    const first = await scoreboard({ now });
    assert.equal(stub.calls.length, 2, 'a cold page costs one call per competition');
    assert.equal(first.leagues.length, 2);

    await scoreboard({ now: minutes(0.5) });
    assert.equal(stub.calls.length, 2, 'nothing was asked of the feed a second time');

    // Twenty tabs of the same cold leagues, all at once: the same two calls,
    // because one fetch is shared by everybody waiting on it.
    await SportScoreboard.deleteMany({});
    const pages = await Promise.all(Array.from({ length: 20 }, () => scoreboard({ now })));
    assert.equal(stub.calls.length, 4, 'twenty readers, two fetches, twice over');
    assert.equal(pages.at(-1).leagues.length, 2);
    assert.equal(pages.at(-1).leagues[0].matches.length, 2);
  } finally {
    stub.restore();
  }
});

test('yesterday and tomorrow are their own pages', async () => {
  await SportScoreboard.deleteMany({});
  const stub = dayEverywhere();
  try {
    await scoreboard({ date: YESTERDAY, league: 'eng.1', now });
    await scoreboard({ date: TOMORROW, league: 'eng.1', now });
    await scoreboard({ date: TODAY, league: 'eng.1', now });
    assert.equal(stub.calls.length, 3);
    assert.match(stub.calls[0], /dates=\d{8}/);
    assert.deepEqual(
      (await SportScoreboard.find({ code: 'eng.1' }).distinct('dateKey')).sort(),
      [TODAY, TOMORROW, YESTERDAY].sort(),
    );
  } finally {
    stub.restore();
  }
});

test('a date nobody on a news site is counting down to is refused without asking for it', async () => {
  const stub = dayEverywhere();
  try {
    const far = await scoreboard({ date: '20300101', now });
    assert.equal(far.ok, false);
    assert.equal(far.reason, 'DATE_OUT_OF_RANGE');

    const lastSeason = await scoreboard({ date: '20251101', now });
    assert.equal(lastSeason.ok, false);
    assert.equal(lastSeason.reason, 'DATE_OUT_OF_RANGE');

    const garbage = await scoreboard({ date: 'yesterday', now });
    assert.equal(garbage.reason, 'DATE_OUT_OF_RANGE');
    assert.equal(stub.calls.length, 0, 'a refused date costs nothing');
  } finally {
    stub.restore();
  }
});

test('a competition shaped like nothing is not asked of the feed', async () => {
  const stub = dayEverywhere();
  try {
    const wrong = await scoreboard({ league: 'not a league!', now });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.reason, 'UNKNOWN_LEAGUE');
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

// --- when the feed is not there ------------------------------------------------------

test('a feed that cannot be reached is reported, and the last real rows are still shown', async () => {
  const good = dayEverywhere();
  try {
    await scoreboard({ now });
  } finally {
    good.restore();
  }

  const down = stubFetch(() => {
    throw new Error('socket hang up');
  });
  try {
    // Two minutes on, past the window a live day counts as current for.
    const page = await scoreboard({ now: minutes(2) });
    assert.equal(page.ok, true, 'the reader still gets a page');
    assert.equal(page.leagues.length, 2);
    assert.equal(page.leagues[0].stale, true);
    assert.equal(page.leagues[0].matches[0].clock, "48'", 'the last score really fetched, not a blank');
    assert.equal(page.stale, true);
    assert.equal(page.errors.length, 2);
    assert.deepEqual(
      page.errors.map((item) => item.reason),
      ['UNREACHABLE', 'UNREACHABLE'],
    );
    assert.equal(down.calls.length, 2);
  } finally {
    down.restore();
  }

  // And while it is refusing, the next poll is answered from here instead of
  // asking again on the reader's behalf.
  const quiet = stubFetch(() => {
    throw new Error('socket hang up');
  });
  try {
    await scoreboard({ now: minutes(2.25) });
    assert.equal(quiet.calls.length, 0, 'a refused league is not asked again inside half a minute');
  } finally {
    quiet.restore();
  }
});

test('an angry feed is not stored as an empty day', async () => {
  const first = dayEverywhere();
  try {
    await scoreboard({ now });
  } finally {
    first.restore();
  }

  const blocked = stubFetch(() => httpResponse(429));
  try {
    const page = await scoreboard({ now: minutes(3) });
    assert.equal(page.ok, true);
    assert.deepEqual(
      page.errors.map((item) => item.reason),
      ['PROVIDER_ERROR', 'PROVIDER_ERROR'],
    );
    assert.equal(page.leagues[0].matches.length, 2, 'the rows from the last good read are still there');
  } finally {
    blocked.restore();
  }
});

test('an answer that is an error object is unreadable rather than empty', async () => {
  await SportScoreboard.deleteMany({});
  const stub = stubFetch(() => jsonResponse({ error: 'No data found' }));
  try {
    const page = await scoreboard({ league: 'eng.1', now: minutes(20) });
    assert.equal(page.ok, true);
    assert.equal(page.leagues.length, 0, 'a league that could not be read is not shown as a league with no matches');
    assert.deepEqual(page.errors, [{ code: 'eng.1', reason: 'UNREADABLE_RESPONSE' }]);
    assert.equal(await SportScoreboard.countDocuments({ code: 'eng.1', dateKey: TODAY }), 0, 'an error object is not stored as a day');
  } finally {
    stub.restore();
  }
});

// --- the scheduled pass ----------------------------------------------------------------

test('the pass keeps warm only what a reader is looking at', async () => {
  await SportScoreboard.deleteMany({});
  const warm = stubFetch((url) => jsonResponse(scoreboardFeed('English Premier League')));
  try {
    await scoreboard({ league: 'eng.1', now });
  } finally {
    warm.restore();
  }
  // A league nobody has opened for two hours is nobody's business any more.
  await SportScoreboard.updateOne({ code: 'eng.1' }, { $set: { watchedAt: minutes(-3) } });

  const unwatched = stubFetch(() => jsonResponse(scoreboardFeed('English Premier League')));
  try {
    await refreshWatched({ now: minutes(-2.5) });
    assert.equal(unwatched.calls.length, 0, 'a league the last reader left three hours ago is not fetched');
  } finally {
    unwatched.restore();
  }

  await SportScoreboard.updateOne({ code: 'eng.1' }, { $set: { watchedAt: now } });
  const pass = stubFetch((url) => jsonResponse(scoreboardFeed('English Premier League')));
  try {
    const result = await refreshWatched({ now: minutes(1.5) });
    assert.equal(pass.count('scoreboard'), 1, 'only the one watched league was re-asked');
    assert.equal(result.watched, 1);
    assert.equal(result.failed, 0);
  } finally {
    pass.restore();
  }
});

test('days fall off the page on their own, in both directions', async () => {
  await SportScoreboard.create({
    code: 'eng.1',
    dateKey: '20000101',
    league: { name: 'An old day' },
    matches: [],
    fetchedAt: new Date('2000-01-01'),
    watchedAt: now,
  });
  await SportScoreboard.create({
    code: 'eng.1',
    dateKey: '20991231',
    league: { name: 'A day only a script asked for' },
    matches: [],
    fetchedAt: now,
    watchedAt: now,
  });
  const stub = stubFetch(() => jsonResponse(scoreboardFeed('English Premier League')));
  try {
    await refreshWatched({ now });
  } finally {
    stub.restore();
  }
  assert.equal(await SportScoreboard.countDocuments({ dateKey: '20000101' }), 0);
  assert.equal(await SportScoreboard.countDocuments({ dateKey: '20991231' }), 0);
  assert.ok(await SportScoreboard.findOne({ dateKey: TODAY }), 'today stays');
});

// --- the match a reader clicks ------------------------------------------------------------

test('a match page is built from the feed’s own events, statistics and line-ups', async () => {
  const day = stubFetch((url) => jsonResponse(scoreboardFeed('English Premier League')));
  try {
    await scoreboard({ league: 'eng.1', now });
  } finally {
    day.restore();
  }

  const stub = stubFetch((url) => (url.includes('summary') ? jsonResponse(summaryFeed()) : jsonResponse(scoreboardFeed('English Premier League'))));
  try {
    const detail = await matchDetail('401878758', { league: 'eng.1', now });
    assert.equal(detail.ok, true);
    assert.equal(detail.stale, false);
    assert.equal(detail.provider, 'espn');

    // The summary prints neither the title nor the minute. Both come from the
    // day's scoreboard row we already hold, without asking the feed for it again.
    assert.equal(stub.count('scoreboard'), 0);
    assert.equal(detail.name, 'Tottenham Hotspur at Leeds United');
    assert.equal(detail.clock, "48'");
    assert.equal(detail.venue, 'Elland Road');
    assert.equal(detail.attendance, '37851');
    assert.equal(detail.home.name, 'Leeds United');
    assert.equal(detail.home.score, '1');
    assert.equal(detail.home.formation, '4-2-3-1');
    assert.equal(detail.home.record, '3-5-2');
    assert.equal(detail.home.players.length, 2, 'a roster row with no name is not a player');
    assert.equal(detail.away.score, '0');

    // Stoppage noise is off the page, and a substitution that reads like a
    // booking is not colourised as one.
    assert.deepEqual(
      detail.events.map((event) => `${event.kind}:${event.label}:${event.minute}`),
      ['other:Kickoff:', 'card:Yellow Card:15\'', 'substitution:Substitution:43\'', 'other:Halftime:', 'other:Start 2nd Half:', 'goal:Goal:79\'', 'other:End Regular Time:'],
    );
    assert.equal(detail.events[0].minute, '', 'a minute the feed left blank stays blank');
    assert.equal(detail.events[5].text.startsWith('Goal!'), true);
    assert.deepEqual(detail.events[5].players, ['Noah Okafor']);
    assert.equal('second' in detail.events[0], false, 'the fields that only ordered the list are not on the page');
    assert.equal('wallclock' in detail.events[0], false);

    // Possession is a bar, so it is not also a row, and a statistic the feed
    // never named is not a statistic.
    assert.equal(detail.possession.label, 'Possession');
    assert.equal(detail.possession.home, '39.2');
    assert.equal(detail.possession.away, '60.8');
    assert.deepEqual(detail.stats.map((stat) => stat.label), ['SHOTS', 'Yellow Cards']);
    assert.equal(detail.stats[0].home, '16');
    assert.equal(detail.stats[0].away, '7');
  } finally {
    stub.restore();
  }
});

test('a fixture that has not kicked off shows no score, even on its own page', async () => {
  // Both prints are stamped with the same minute, which is exactly the tie the
  // service settles in favour of the page the reader asked for - so this test has
  // to start from an empty day rather than one an earlier pass already re-stamped.
  await SportScoreboard.deleteMany({});
  await SportMatch.deleteMany({});
  const day = stubFetch((url) => jsonResponse(scoreboardFeed('English Premier League')));
  try {
    await scoreboard({ league: 'eng.1', now });
  } finally {
    day.restore();
  }
  const stub = stubFetch((url) =>
    url.includes('summary')
      ? jsonResponse(summaryFeed({ state: 'pre', status: 'Scheduled', competitors: [LEEDS('0'), SPURS('0')] }))
      : jsonResponse(scoreboardFeed('English Premier League')),
  );
  try {
    await SportMatch.deleteMany({});
    const detail = await matchDetail('401878758', { league: 'eng.1', now });
    assert.equal(detail.state, 'pre');
    assert.equal(detail.home.score, '');
    assert.equal(detail.away.score, '');
    assert.equal(detail.clock, '');
  } finally {
    stub.restore();
  }
});

test('an open match page keeps counting on the rows the pass already refreshed', async () => {
  await SportMatch.deleteMany({});
  const stub = stubFetch((url) => (url.includes('summary') ? jsonResponse(summaryFeed()) : jsonResponse(scoreboardFeed('English Premier League'))));
  try {
    await scoreboard({ league: 'eng.1', now });
    await matchDetail('401878758', { league: 'eng.1', now });
  } finally {
    stub.restore();
  }

  // The minute moves because the scoreboard was refreshed. The reader's tab does
  // not ask the feed for anything at all.
  await SportScoreboard.updateOne(
    { code: 'eng.1', dateKey: TODAY },
    { $set: { fetchedAt: minutes(0.75), watchedAt: minutes(0.75), 'matches.0.clock': "63'", 'matches.0.home.score': '2' } },
  );
  const quiet = stubFetch(() => {
    throw new Error('a poll of a warm page must not reach the feed');
  });
  try {
    const again = await matchDetail('401878758', { league: 'eng.1', now: minutes(0.75) });
    assert.equal(quiet.calls.length, 0);
    assert.equal(again.clock, "63'");
    assert.equal(again.home.score, '2');
    assert.equal(again.away.score, '0');
    assert.equal(again.home.name, 'Leeds United');
  } finally {
    quiet.restore();
  }

  // And refreshing a live match from a summary that prints no clock never blanks
  // the line the reader is looking at.
  const refreshed = stubFetch((url) => (url.includes('summary') ? jsonResponse(summaryFeed()) : jsonResponse(scoreboardFeed('English Premier League'))));
  try {
    const later = await matchDetail('401878758', { league: 'eng.1', now: minutes(20) });
    assert.equal(refreshed.count('summary'), 1);
    assert.equal(later.clock, "63'", 'the minute the scoreboard last printed survives a summary refresh');
    assert.equal(later.name, 'Tottenham Hotspur at Leeds United');
  } finally {
    refreshed.restore();
  }
});

test('a match id that is not a match id is refused, and a match nobody has read says so', async () => {
  const stub = stubFetch(() => httpResponse(503));
  try {
    const wrong = await matchDetail('../secret', { league: 'eng.1', now });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.reason, 'BAD_MATCH');

    await SportMatch.deleteMany({});
    const missing = await matchDetail('401999999', { league: 'eng.1', now });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'PROVIDER_ERROR');
    assert.equal(stub.count('summary'), 1);
  } finally {
    stub.restore();
  }
});

// --- the league table -----------------------------------------------------------------------

test('the table keeps the numbers the competition published', async () => {
  const entries = [
    standingRow(359, 'Arsenal', { rank: 1, played: 10, win: 9, draw: 0, loss: 1, for: 15, against: 5, difference: '+10', points: 27, note: 'Champions League' }),
    // A deduction is a negative fact about a club's season. Reading it with
    // `Number(x) || 0` makes it disappear, and reading the blank one the same way
    // invents a punishment that was never given.
    standingRow(405, 'Everton', { rank: 12, played: 10, win: 4, draw: 3, loss: 3, for: 12, against: 11, difference: '+1', points: 9, deductions: '-4' }),
    standingRow(306, 'Hull City', { rank: 18, played: 10, win: 2, draw: 5, loss: 3, for: 9, against: 12, difference: '-3', points: 11 }),
  ];
  const stub = stubFetch(() => jsonResponse(standingsFeed(entries)));
  try {
    const table = await standings('eng.1', { now });
    assert.equal(table.ok, true);
    assert.equal(table.season, '2026-27 English Premier League');
    assert.equal(table.entries.length, 3);

    const arsenal = table.entries.find((row) => row.team.name === 'Arsenal');
    assert.equal(arsenal.rank, 1);
    assert.equal(arsenal.points, '27');
    assert.equal(arsenal.difference, '+10');
    assert.equal(arsenal.record, '9-0-1');
    assert.equal(arsenal.note, 'Champions League');
    assert.equal(arsenal.deductions, '');
    assert.equal(table.entries.find((row) => row.team.name === 'Everton').deductions, '-4');
    // The competition's own order, with its own rank on each row: re-sorting by
    // points here would move a club the league holds twelfth above one it holds
    // eighteenth.
    assert.deepEqual(
      table.entries.map((row) => `${row.rank}:${row.team.name}:${row.points}`),
      ['1:Arsenal:27', '12:Everton:9', '18:Hull City:11'],
    );
    assert.equal(await SportStandings.countDocuments({ code: 'eng.1' }), 1);
  } finally {
    stub.restore();
  }
});

test('a group stage is not one table of thirty-two clubs', async () => {
  const cup = {
    id: '1121',
    name: 'UEFA Champions League',
    season: { year: 2026, displayName: '2026-27 UEFA Champions League' },
    children: [
      {
        name: 'Group Stage',
        standings: [
          { name: 'Group A', entries: [standingRow(359, 'Arsenal', { rank: 1, played: 2, win: 2, draw: 0, loss: 0, for: 5, against: 1, difference: '+4', points: 6 })] },
          { name: 'Group B', entries: [standingRow(367, 'Tottenham Hotspur', { rank: 1, played: 2, win: 1, draw: 1, loss: 0, for: 4, against: 2, difference: '+2', points: 4 })] },
        ],
      },
    ],
  };
  const stub = stubFetch(() => jsonResponse(cup));
  try {
    const table = await standings('uefa.champions', { now });
    assert.equal(table.ok, true);
    assert.equal(table.entries.length, 2);
    assert.deepEqual(
      table.entries.map((row) => row.table),
      ['Group A', 'Group B'],
    );
    assert.deepEqual(
      table.entries.map((row) => row.rank),
      [1, 1],
    );
  } finally {
    stub.restore();
  }
});

test('a table that cannot be read keeps the last one and says it is old', async () => {
  const good = stubFetch(() =>
    jsonResponse(standingsFeed([standingRow(359, 'Arsenal', { rank: 1, played: 10, win: 9, draw: 0, loss: 1, for: 15, against: 5, difference: '+10', points: 27 })])),
  );
  try {
    await standings('eng.1', { now });
  } finally {
    good.restore();
  }
  await SportStandings.updateOne({ code: 'eng.1' }, { $set: { fetchedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) } });

  const down = stubFetch(() => {
    throw new Error('socket hang up');
  });
  try {
    const later = await standings('eng.1', { now: new Date(Date.now() + 7 * 60 * 60 * 1000) });
    assert.equal(later.ok, true);
    assert.equal(later.stale, true);
    assert.equal(later.entries[0].points, '27');
  } finally {
    down.restore();
  }
});

// --- the listings and the routes ---------------------------------------------------------------

test('the watch list counts what is on the day, and names the rest from the list', async () => {
  const stub = stubFetch((url) => jsonResponse(scoreboardFeed(url.includes('esp.1') ? 'Spanish LALIGA' : 'English Premier League')));
  try {
    await scoreboard({ league: 'eng.1', now });
    const list = await leagues({ now });
    assert.equal(list.ok, true);
    assert.equal(list.leagues.length, 2);
    const premier = list.leagues.find((item) => item.code === 'eng.1');
    assert.equal(premier.name, 'English Premier League');
    assert.equal(premier.matches, 2);
    assert.equal(premier.live, 1);
    const spain = list.leagues.find((item) => item.code === 'esp.1');
    assert.equal(spain.matches, 0, 'a league nobody has opened today is on the list, and says so');
  } finally {
    stub.restore();
  }
});

test('the page names every competition it follows, not only the ones with matches', async () => {
  await SportScoreboard.deleteMany({});
  const stub = dayEverywhere();
  try {
    const page = await scoreboard({ league: 'eng.1', now });
    assert.equal(page.leagues.length, 1, 'one competition was asked for');
    assert.equal(page.followed.length, 2, 'every competition on the list is still named');
    assert.deepEqual(
      page.followed.map((item) => item.code),
      ['eng.1', 'esp.1'],
    );
    // The badge comes from the newsroom's own list so a row of chips is a row of
    // badges from one source; the name is the competition's own, whether the day
    // printed it or the list has been holding it all along.
    assert.equal(page.followed[0].name, 'English Premier League');
    assert.equal(page.followed[0].logo, 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png');
    assert.equal(page.followed[1].name, 'Spanish LALIGA');
    assert.equal(page.followed[1].logo, 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png');
    assert.equal(JSON.stringify(page.followed).includes('site.api.espn.com'), false);
  } finally {
    stub.restore();
  }
});

test('a team or a competition can be searched out of the days already read', async () => {
  await SportScoreboard.deleteMany({});
  // The whole point of this search is that it is free: it reads what this server
  // already holds. The stub below is not an answer, it is a tripwire.
  const stub = stubFetch(() => jsonResponse(scoreboardFeed('English Premier League')));
  try {
    await SportScoreboard.create([
      {
        code: 'eng.1',
        dateKey: TODAY,
        league: { name: 'English Premier League' },
        matches: [
          {
            id: '11',
            name: 'Leeds United at Arsenal',
            shortName: 'Leeds at Arsenal',
            state: 'in',
            statusText: "1st 25'",
            clock: "25'",
            period: 1,
            start: minutes(-25),
            home: { name: 'Arsenal', short: 'ARS', score: '1' },
            away: { name: 'Leeds United', short: 'LEE', score: '0' },
          },
        ],
        fetchedAt: now,
        watchedAt: now,
      },
      {
        code: 'eng.1',
        dateKey: YESTERDAY,
        league: { name: 'English Premier League' },
        matches: [
          {
            id: '12',
            name: 'Hull City at Arsenal',
            shortName: 'Hull at Arsenal',
            state: 'post',
            statusText: 'FT',
            clock: '',
            period: 2,
            start: minutes(-26 * 60),
            home: { name: 'Arsenal', short: 'ARS', score: '3' },
            away: { name: 'Hull City', short: 'HUL', score: '1' },
          },
        ],
        fetchedAt: now,
        watchedAt: now,
      },
      {
        // A competition this newsroom does not follow cannot be searched, and a
        // club that plays in it must not walk into somebody else's answer.
        code: 'ita.1',
        dateKey: TODAY,
        league: { name: 'Italian Serie A' },
        matches: [
          {
            id: '13',
            name: 'Roma at Arsenal',
            shortName: 'Roma at Arsenal',
            state: 'pre',
            start: minutes(200),
            home: { name: 'Roma', short: 'ROM' },
            away: { name: 'Arsenal', short: 'ARS' },
          },
        ],
        fetchedAt: now,
        watchedAt: now,
      },
    ]);

    const team = await search({ q: 'Arsenal', now });
    assert.equal(team.ok, true);
    assert.equal(team.term, 'Arsenal');
    assert.equal(team.competitions.length, 0, 'no competition is called Arsenal');
    assert.equal(team.matches.length, 2, 'the two English days, not the Italian one');
    assert.deepEqual(team.matches.map((row) => row.id), ['11', '12'], 'newest first');
    assert.equal(team.matches[0].code, 'eng.1');
    assert.equal(team.matches[0].leagueName, 'English Premier League');
    assert.equal(team.matches[0].dateKey, TODAY);
    assert.equal(team.matches[1].dateKey, YESTERDAY);
    // The window the answer can speak for travels with it, so a page that finds
    // nothing can say what it did not look at. Written as the days themselves:
    // a week back and three forward is what the page promises a reader.
    assert.equal(team.earliest, dayKey(7, now));
    assert.equal(team.latest, dayKey(-21, now));

    // The three letters a fixture list prints are a name a reader types.
    const short = await search({ q: 'lee', now });
    assert.deepEqual(short.matches.map((row) => row.id), ['11']);

    // A competition is found by its own name, whether or not it has a match on
    // a day anybody has opened.
    const trophy = await search({ q: 'laliga', now });
    assert.deepEqual(
      trophy.competitions.map((item) => [item.code, item.name]),
      [['esp.1', 'Spanish LALIGA']],
    );
    assert.equal(trophy.matches.length, 0);

    // The code itself is a search term, and a dot is a dot and not a wildcard.
    const byCode = await search({ q: 'eng.1', now });
    assert.deepEqual(byCode.competitions.map((item) => item.code), ['eng.1']);
    assert.equal(byCode.matches.length, 0);

    // Two letters is where a name stops being an accident.
    for (const term of ['a', '  ', '']) {
      const refused = await search({ q: term, now });
      assert.equal(refused.ok, true, `${JSON.stringify(term)} is answered, not rejected`);
      assert.equal(refused.competitions.length, 0);
      assert.equal(refused.matches.length, 0);
      assert.equal(refused.earliest, null);
    }

    const nobody = await search({ q: 'Kigali', now });
    assert.equal(nobody.ok, true);
    assert.equal(nobody.matches.length, 0);
    assert.equal(nobody.earliest, dayKey(7, now), 'an empty answer still says its window');

    assert.equal(stub.calls.length, 0, 'a search asked the feed nothing');
  } finally {
    stub.restore();
  }
});

test('the scores page is public and a stranger cannot ask it for anything', async () => {
  await SportScoreboard.deleteMany({});
  const stub = stubFetch((url) => jsonResponse(scoreboardFeed('English Premier League')));
  try {
    const anonymous = await request(app).get('/api/scores/scoreboard?league=eng.1');
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.body.data.provider, 'espn');
    assert.equal(anonymous.body.data.leagues[0].matches[0].clock, "48'");
    // The reader's browser is handed our database's answer and our badges. It is
    // never handed the sports feed's address, which is the whole point.
    assert.equal(JSON.stringify(anonymous.body).includes('site.api.espn.com'), false);

    const badDate = await request(app).get('/api/scores/scoreboard?date=20300101');
    assert.equal(badDate.status, 400);
    assert.match(badDate.body.message, /last week/i);

    const stranger = await request(app).get('/api/scores/scoreboard?league=xyz.1');
    assert.equal(stranger.status, 200, 'a code shaped like a real one but unknown simply has its own day');

    const badMatch = await request(app).get('/api/scores/match/not-a-match');
    assert.equal(badMatch.status, 400);

    const standingsRefused = await request(app).get('/api/scores/standings?league=not%20a%20league');
    assert.equal(standingsRefused.status, 400);
  } finally {
    stub.restore();
  }
});

test('the search route answers a stranger from the cache alone', async () => {
  await SportScoreboard.deleteMany({});
  const stub = stubFetch(() => jsonResponse(scoreboardFeed('English Premier League')));
  try {
    await SportScoreboard.create({
      code: 'esp.1',
      dateKey: TOMORROW,
      league: { name: 'Spanish LALIGA' },
      matches: [
        {
          id: '21',
          name: 'Girona at Barcelona',
          shortName: 'Girona at Barcelona',
          state: 'pre',
          statusText: 'Scheduled',
          start: minutes(300),
          home: { name: 'Girona', short: 'GIR' },
          away: { name: 'Barcelona', short: 'BAR' },
        },
      ],
      fetchedAt: now,
      watchedAt: now,
    });

    const found = await request(app).get('/api/scores/search?q=barcelona');
    assert.equal(found.status, 200);
    assert.equal(found.body.data.term, 'barcelona');
    assert.equal(found.body.data.matches.length, 1);
    assert.equal(found.body.data.matches[0].name, 'Girona at Barcelona');
    assert.equal(found.body.data.matches[0].dateKey, TOMORROW, 'the row says which day to open');
    assert.equal(found.body.data.competitions.length, 0, 'a club is not a competition');
    // The competition is found by its own name, from the newsroom's list, whether
    // or not the cache holds a single match of it.
    const trophy = await request(app).get('/api/scores/search?q=laliga');
    assert.equal(trophy.status, 200);
    assert.equal(trophy.body.data.competitions.length, 1);
    assert.equal(trophy.body.data.competitions[0].code, 'esp.1');
    // As everywhere else on this page, the browser is handed our database's
    // answer and never the feed's address.
    assert.equal(JSON.stringify(found.body).includes('site.api.espn.com'), false);

    const nothing = await request(app).get('/api/scores/search?q=%20mid%20');
    assert.equal(nothing.status, 200);
    assert.equal(nothing.body.data.term, 'mid');

    // No term, and a term too short to be a name, are both answered rather than
    // treated as a mistake the reader has to be told about.
    for (const query of ['', '?q=a']) {
      const refused = await request(app).get(`/api/scores/search${query}`);
      assert.equal(refused.status, 200);
      assert.equal(refused.body.data.matches.length, 0);
      assert.equal(refused.body.data.competitions.length, 0);
    }

    assert.equal(stub.calls.length, 0, 'the search route asked the feed nothing');
  } finally {
    stub.restore();
  }
});
