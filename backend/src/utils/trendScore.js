/**
 * RADAR's own ordering of the trending topics, in the open.
 *
 * Google's traffic band is the evidence and stays printed exactly as Google
 * published it. But a list of forty topics cannot be read in the order the feed
 * happened to emit, and "it looked bigger in the feed" is not something an
 * editor can check. So this file turns the stored observations into a number
 * whose every part the admin can see: how many searches Google's band said, how
 * many times this server actually read the topic, and how long ago it was
 * trending.
 *
 * Three rules hold it together:
 * - Nothing here invents traffic. Every input is a field the provider response
 *   or our own read wrote; a topic with no number gets a zero traffic part, not
 *   a guessed one.
 * - The arithmetic is versioned. A stored score says which version produced it,
 *   so a number from last month is never compared against one from this formula.
 * - The parts are returned alongside the total. A score the newsroom cannot
 *   take apart is not a score, it is a decoration.
 */

// v1 - the first formula the desk could read. Any change to the weights or the
// freshness window below must bump this, not quietly replace it.
const SCORE_VERSION = 'v1';

// One point per tenfold of Google's own band, so a topic reported at 1,000+
// sits three points above one at 10+. Bands are coarse on purpose: Google
// prints "200+", not 214 searches.
const TRAFFIC_POINTS_PER_DECADE = 1.5;
// Being reported four times in a row is a habit, not a spike - so the repeat
// part grows on a square root and a topic seen 64 times only earns 8 points.
const REPEAT_POINTS_AT_16_SIGHTINGS = 2;
// A topic Google printed 84 minutes ago is the one a reader might click today;
// after twelve hours it is yesterday's news and drops to nothing.
const FRESHNESS_HALF_LIFE_HOURS = 12;
const FRESHNESS_FLOOR_HOURS = 36;
const FRESHNESS_POINTS = 2;

const HOUR_MS = 60 * 60 * 1000;

/** Google's "200+" band into the count it stands for; nothing else is inferred. */
function trafficFrom(band) {
  if (typeof band === 'number' && Number.isFinite(band)) return Math.max(0, band);
  const match = String(band ?? '').replace(/[,\s]/g, '').match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * The whole score, in the parts it is made of.
 *
 * `traffic` only ever counts while the topic is still on the list, because a
 * topic that left the feed is not being searched now - the repeat and freshness
 * parts carry its history instead. `reason` says plainly why a total is what it
 * is, which is what the desk shows beside the number.
 */
function trendScore({ approxTraffic, trafficLabel, sightings, seenAt, lastSeenAt, now = Date.now() } = {}) {
  const count = approxTraffic ?? trafficFrom(trafficLabel);
  const reads = Number.isFinite(sightings) && sightings > 0 ? sightings : 0;

  const seen = Date.parse(seenAt || '') || Date.parse(lastSeenAt || '') || null;
  const ageHours = seen ? Math.max(0, (now - seen) / HOUR_MS) : null;
  const onList = ageHours !== null && ageHours < FRESHNESS_FLOOR_HOURS;

  const traffic = onList && count ? Math.log10(count + 1) * TRAFFIC_POINTS_PER_DECADE : 0;
  const repeat = reads ? Math.sqrt(reads) * (REPEAT_POINTS_AT_16_SIGHTINGS / 4) : 0;
  const freshness = ageHours === null
    ? 0
    : FRESHNESS_POINTS * Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_HOURS);

  const parts = {
    traffic: round3(traffic),
    repeat: round3(repeat),
    freshness: round3(freshness),
  };
  const total = round3(parts.traffic + parts.repeat + parts.freshness);

  const reason = ageHours === null
    ? 'No timestamp came with it, so only its sightings count for now.'
    : !onList
      ? `Google last printed it ${Math.floor(ageHours)} h ago, so it is off today's list and holds no traffic points.`
      : `Google's band said ${count ? `${count.toLocaleString()} searches` : 'no number'}, this server read it ${reads} ${reads === 1 ? 'time' : 'times'}, and it was on the list ${ageHours < 1 ? 'minutes' : `${Math.round(ageHours)} hours`} ago.`;

  return {
    version: SCORE_VERSION,
    total,
    parts,
    ageHours: ageHours === null ? null : round3(ageHours),
    onList,
    reason,
  };
}

module.exports = {
  SCORE_VERSION,
  trafficFrom,
  trendScore,
  weights: {
    trafficPointsPerDecade: TRAFFIC_POINTS_PER_DECADE,
    repeatPointsAt16Sightings: REPEAT_POINTS_AT_16_SIGHTINGS,
    freshnessHalfLifeHours: FRESHNESS_HALF_LIFE_HOURS,
    freshnessFloorHours: FRESHNESS_FLOOR_HOURS,
    freshnessPoints: FRESHNESS_POINTS,
  },
};
