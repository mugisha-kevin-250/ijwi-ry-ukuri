/**
 * The clock the timetable is read on.
 *
 * A programme at seven in the morning means seven in Kigali, not seven in whatever
 * timezone a free hosting container happens to have been placed in, and not
 * "server local time" either - which is the sentence that quietly moves a whole
 * schedule by two hours when an infrastructure provider reboots something.
 *
 * Intl is used rather than a date library because Node already ships the zone
 * data, and a schedule is the one thing on this site that cannot afford a drift.
 * When a device has no data for the zone that was set, everything falls back to
 * UTC together instead of half the calculations agreeing and half not.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const formatterCache = new Map();

function partsFor(timeZone) {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  // An unsupported zone throws here rather than silently reading the wrong clock.
  // Callers fall back to UTC, and the schedule document says so out loud.
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The wall clock at one instant, on one zone.
 *
 * Returns `at` as minutes-past-midnight, `day` as 0=Sunday, `dateKey` as
 * "YYYY-MM-DD" and `occurrenceKey` as "YYYY-MM-DDTHH:mm" - which is the identity
 * of an edition, and what stops one programme being rebuilt every time a reader
 * opens the page.
 */
function wallClock(date, timeZone) {
  let zone = timeZone || 'UTC';
  let formatter;
  try {
    formatter = partsFor(zone);
  } catch {
    zone = 'UTC';
    formatter = partsFor(zone);
  }
  const fields = {};
  for (const part of formatter.formatToParts(date)) fields[part.type] = part.value;

  // "24" is what hour12:false gives for midnight on some engines.
  const hour = Number(fields.hour) % 24;
  const minute = Number(fields.minute);
  const second = Number(fields.second);
  const day = WEEKDAY.indexOf(fields.weekday.slice(0, 3));
  const pad = (value) => String(value).padStart(2, '0');

  return {
    timeZone: zone,
    year: Number(fields.year),
    month: Number(fields.month),
    dayOfMonth: Number(fields.day),
    day: day < 0 ? new Date(date).getUTCDay() : day,
    hour,
    minute,
    at: hour * 60 + minute,
    dateKey: `${fields.year}-${pad(fields.month)}-${pad(fields.day)}`,
    occurrenceKey: `${fields.year}-${pad(fields.month)}-${pad(fields.day)}T${pad(hour)}:${pad(minute)}`,
  };
}

/** Minutes past midnight for an "HH:mm" string. */
function toMinutes(value) {
  const [hour, minute] = String(value || '00:00').split(':').map((piece) => Number(piece) || 0);
  return Math.min(Math.max(hour * 60 + minute, 0), 24 * 60 - 1);
}

function fromMinutes(minutes) {
  const value = Math.min(Math.max(Math.round(minutes), 0), 24 * 60 - 1);
  const pad = (part) => String(part).padStart(2, '0');
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
}

/**
 * The instant a slot starts on a given wall-clock date, in that slot's timezone.
 *
 * Finding the UTC instant for a local time is the awkward direction, so this
 * guesses from the date read as if it were UTC and corrects the answer once: at
 * most two steps, and it lands on the right minute even across the two days a
 * year a shift happens.
 */
function instantFor(dateKey, minutes, timeZone) {
  const [year, month, day] = dateKey.split('-').map(Number);
  let instant = Date.UTC(year, (month || 1) - 1, day || 1, Math.floor(minutes / 60), minutes % 60, 0, 0);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const clock = wallClock(new Date(instant), timeZone);
    // Both the day and the minute have to agree. Near midnight, in a zone away
    // from UTC, the first guess lands on the wrong date altogether.
    if (clock.dateKey === dateKey && clock.at === minutes) return instant;
    const dayDelta = dayNumber(dateKey) - dayNumber(clock.dateKey);
    instant += (dayDelta * 24 * 60 + (minutes - clock.at)) * MINUTE_MS;
  }
  return instant;
}

function dayNumber(dateKey) {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.round(parsed / DAY_MS) : 0;
}

/**
 * Which programme is on air, and which one follows.
 *
 * A slot runs from its start until the next slot that is due today, so "18:00
 * Evening round-up" is still the answer at 18:40, and the last slot of the day
 * runs until the first one tomorrow. Days are respected: a weekday-only
 * programme is not on air on a Sunday, and the bulletin a reader sees is the one
 * the timetable actually asked for at that moment.
 */
function resolve(slots, date = new Date(), timeZone = 'Africa/Kigali') {
  const enabled = (Array.isArray(slots) ? slots : []).filter((slot) => slot && slot.enabled !== false);
  const clock = wallClock(date, timeZone);
  if (!enabled.length) return { clock, current: null, next: null };

  const startsOn = (dayKey, weekday) =>
    enabled
      .filter((slot) => !Array.isArray(slot.days) || slot.days.length === 0 || slot.days.includes(weekday))
      .map((slot) => ({ slot, minutes: toMinutes(slot.at), startsAt: instantFor(dayKey, toMinutes(slot.at), timeZone) }))
      .filter((entry) => Number.isFinite(entry.startsAt))
      .sort((a, b) => a.minutes - b.minutes);

  const today = startsOn(clock.dateKey, clock.day);
  const tomorrow = startsOn(dateKeyPlus(date, timeZone, 1), (clock.day + 1) % 7);

  let current = null;
  for (const entry of today) {
    if (entry.startsAt <= date.getTime()) current = entry;
    else break;
  }
  // Before the first programme of the day the air belongs to last night's, which
  // is exactly what a real station's schedule looks like at 02:00.
  if (!current) {
    const yesterday = startsOn(dateKeyPlus(date, timeZone, -1), (clock.day + 6) % 7);
    if (yesterday.length) current = yesterday[yesterday.length - 1];
  }

  const next = today.find((entry) => entry.startsAt > date.getTime()) || tomorrow[0] || null;

  return {
    clock,
    current: current ? describeEntry(current, clock) : null,
    next: next ? describeEntry(next, clock) : null,
  };
}

/**
 * A slot plus the identity of this particular edition of it.
 *
 * The occurrence key is taken from the clock the programme started on, so the one
 * that began at 23:00 yesterday is still "yesterday's 23:00" when a reader opens
 * the page at 01:00 - and the desk does not remake it every time somebody looks.
 */
function describeEntry(entry, clock) {
  const started = wallClock(new Date(entry.startsAt), clock.timeZone);
  return {
    slot: entry.slot,
    minutes: entry.minutes,
    startsAt: new Date(entry.startsAt),
    timezone: started.timeZone,
    occurrenceKey: `${started.dateKey}T${entry.slot.at}`,
  };
}

/** The date key `days` from the instant, counted on the schedule's own clock. */
function dateKeyPlus(date, timeZone, days) {
  return wallClock(new Date(date.getTime() + days * DAY_MS), timeZone).dateKey;
}

module.exports = { resolve, wallClock, instantFor, toMinutes, fromMinutes, MINUTE_MS, HOUR_MS, DAY_MS };
