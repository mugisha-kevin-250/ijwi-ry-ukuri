/**
 * The radio desk: what is on air, and what it says when it starts.
 *
 * Three things happen here. The timetable is kept (a list of programmes and the
 * wall-clock times they start). An edition of a programme is assembled from the
 * stories this site has actually published. And the presenter's opening lines are
 * written - by Gemini when the admin asked for that and the model answers usefully,
 * by this file when it does not.
 *
 * The order matters and is deliberate. Nothing here waits on a model: a bulletin
 * is a list of real published stories first, and the machine-written sentence that
 * introduces them is decoration on top. If Gemini is unconfigured, rate-limited or
 * returns something odd, the reader hears the plain written line instead and the
 * edition is still the same edition.
 *
 * One more choice worth stating: an edition is built when it starts and then kept.
 * Rebuilding it on every page open would mean the six o'clock bulletin said a
 * different thing to the reader who arrived at ten past than to the one who
 * arrived at twenty, and a story list that moves under a reader who is already
 * listening is not a broadcast.
 */

const Article = require('../models/Article');
const RadioSchedule = require('../models/RadioSchedule');
const RadioBulletin = require('../models/RadioBulletin');
const clock = require('../utils/clock');
const geminiService = require('./geminiService');
const env = require('../config/env');

const HOUR_MS = clock.HOUR_MS;

// A first timetable, so the desk has a shape the admin edits rather than an empty
// box. These are starting points, not a claim that anything is scheduled until a
// person has said so.
const DEFAULT_SLOTS = [
  { name: 'Morning news', at: '07:00' },
  { name: 'Midday update', at: '12:00' },
  { name: 'Evening round-up', at: '18:00' },
  { name: 'Late news', at: '22:00' }
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function getSchedule() {
  const existing = await RadioSchedule.findOne({ key: 'default' });
  if (existing) return existing;
  try {
    return await RadioSchedule.create({ key: 'default', timezone: env.RADIO_TZ || 'Africa/Kigali', slots: DEFAULT_SLOTS });
  } catch (error) {
    // Two readers on a cold database can both find nothing and both create. The
    // unique index picks one, and the loser reads what the winner wrote.
    if (error?.code !== 11000) throw error;
    return RadioSchedule.findOne({ key: 'default' });
  }
}

/**
 * The programme on air right now, plus the one after it.
 *
 * `now` is an argument rather than a call to the clock because the scheduler and a
 * test both need to ask about a minute that is not the current one.
 */
async function resolveNow(now = new Date()) {
  const schedule = await getSchedule();
  // Plain objects, not Mongoose documents: the clock reads a list of slots and
  // should not have to know which ORM produced them.
  const resolved = clock.resolve(schedule.toObject().slots, now, schedule.timezone);
  return { schedule, resolved };
}

/**
 * Stories for one edition: this site's own published work, newest first.
 *
 * The window is the day before the programme started, which is what "today's
 * news" means without a person choosing. If a slot asks for more stories than the
 * window holds, older published stories top it up rather than the bulletin going
 * out with three items in it.
 */
async function pickStories(slot, { since, until }) {
  const wanted = Math.min(Math.max(Number(slot.storyCount) || 8, 1), 25);
  const base = { status: 'published', language: 'en' };
  const categories = (Array.isArray(slot.categories) ? slot.categories : []).filter(Boolean);
  if (categories.length) base.category = { $in: categories };

  const window = { publishedAt: { $lte: until } };
  if (since) window.publishedAt.$gte = since;

  const fresh = await Article.find({ ...base, ...window })
    .sort({ publishedAt: -1 })
    .limit(wanted)
    .select('_id title summary')
    .lean();

  if (fresh.length >= wanted) return fresh;

  const seen = new Set(fresh.map((story) => String(story._id)));
  const older = await Article.find(base)
    .sort({ publishedAt: -1 })
    .limit(wanted * 2)
    .select('_id title summary')
    .lean();
  for (const story of older) {
    if (seen.has(String(story._id))) continue;
    fresh.push(story);
    seen.add(String(story._id));
    if (fresh.length >= wanted) break;
  }
  return fresh;
}

/**
 * The line this file writes when the model did not.
 *
 * It only names how many stories there are and reads the top three headlines as
 * they were published, so it cannot be wrong about anything the site has not
 * already said.
 */
function deskScript({ slotName, startsAt, timezone, stories }) {
  // Written to be heard, not read: a weekday and a time as two separate pieces,
  // because "Saturday, 07:00" comes out of a voice engine as a comma and a pause
  // in the middle of a sentence.
  const read = (options) =>
    startsAt
      ? new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'UTC', hour12: false, ...options }).format(startsAt)
      : '';
  const day = read({ weekday: 'long' });
  const time = read({ hour: '2-digit', minute: '2-digit' });
  const names = stories.slice(0, 3).map((story) => `"${story.title}"`);
  const lead = names.length === 1 ? names[0] : names.length ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : '';
  // The admin names the programme, and a name that already says what it is should
  // not be told twice: "the Morning news news bulletin" is not something to read
  // out loud to a listener.
  const saysWhatItIs = /(bulletin|news|update|round-?up|programme|program|show)/i.test(slotName);
  const programme = saysWhatItIs ? `the ${slotName}` : `the ${slotName} bulletin`;
  const opening = [
    `This is RADAR with ${programme}. It is ${day} at ${time} in Kigali.`,
    stories.length
      ? `${stories.length} ${stories.length === 1 ? 'story is' : 'stories are'} on air: ${lead}.`
      : 'There is nothing new on the wire at the moment, so this is a short bulletin.',
  ].join(' ');
  return {
    opening,
    closing: 'That was the bulletin. The full stories, with the reporting behind them, are on RADAR.',
  };
}

/**
 * The edition of a programme that is on air, made if it has not been made yet.
 *
 * Building it is fast and happens in front of the reader: a list of real published
 * stories and the sentence this file writes for them. Asking Gemini for a presenter
 * script is not fast - it can take tens of seconds, and a reader who pressed play
 * should not stare at a button while a model thinks. So on this path the script is
 * fetched afterwards, in the background, and lands on the edition a few seconds
 * later. Whoever is listening at the very first second hears the desk line; that
 * is the honest trade, and the page says which of the two is being read.
 */
async function bulletinFor(entry, { now = new Date(), awaitScript = false } = {}) {
  if (!entry) return null;
  const slotId = String(entry.slot._id || entry.slot.id);
  const found = await RadioBulletin.findOne({ slot: slotId, occurrence: entry.occurrenceKey });
  // An edition is a fixed thing once broadcast. The one exception is an edition
  // assembled minutes after its stories had all been published elsewhere on the
  // site, which is what a cold start after a free host slept looks like - so an
  // edition with nothing in it is allowed to be made again.
  if (found && found.stories.length) {
    if (awaitScript) return await ensureScript(found, entry);
    return ensureScript(found, entry, { wait: false });
  }

  const stories = await pickStories(entry.slot, {
    since: new Date(entry.startsAt.getTime() - 24 * HOUR_MS),
    until: now
  });
  const slotName = String(entry.slot.name || 'news');
  const plain = deskScript({ slotName, startsAt: entry.startsAt, timezone: entry.timezone, stories });

  const built = {
    slot: slotId,
    slotName,
    occurrence: entry.occurrenceKey,
    timezone: entry.timezone,
    startedAt: entry.startsAt,
    stories: stories.map((story) => story._id),
    storyTitles: stories.map((story) => story.title),
    opening: plain.opening,
    closing: plain.closing,
    scriptSource: 'desk',
    model: '',
    note: ''
  };

  let edition;
  try {
    edition = await RadioBulletin.findOneAndUpdate(
      { slot: slotId, occurrence: entry.occurrenceKey },
      { $set: built },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // Two readers arriving on the same minute both find nothing and both build.
    // The unique index lets one win; the other reads what it wrote.
    if (error?.code !== 11000) throw error;
    edition = await RadioBulletin.findOne({ slot: slotId, occurrence: entry.occurrenceKey });
  }
  if (!edition) return null;

  if (awaitScript) return ensureScript(edition, entry);
  return ensureScript(edition, entry, { wait: false });
}

/**
 * Replace the written line with one from the model, if this programme asked for that.
 *
 * The story list never changes here, only the words introducing it, so a reader who
 * is already listening is not told a different news.
 */
// A model call can outlast the minute that started it, and the cron wakes every
// minute. Without this, a slow Gemini answer would be asked again by the next run
// while the first was still on its way, spending the quota twice for one bulletin.
// The running promise is kept, not just the key, so somebody who genuinely has to
// wait for the answer can join the call already in flight instead of making a second.
const scriptInFlight = new Map();

async function ensureScript(edition, entry, { wait = true } = {}) {
  if (!edition) return edition;
  if (edition.scriptSource === 'ai' || !entry || entry.slot.useAiScript === false) return edition;
  const key = `${edition.slot}/${edition.occurrence}`;

  const running = scriptInFlight.get(key);
  if (running) {
    // A reader's page load does not wait on the model; the admin who pressed
    // rebuild does, and then reads the edition back with whatever it became.
    if (!wait) return edition;
    const settled = await running.catch(() => null);
    return (await RadioBulletin.findById(edition._id)) || settled || edition;
  }

  const job = writeScript(edition, entry).finally(() => scriptInFlight.delete(key));
  scriptInFlight.set(key, job);
  if (!wait) {
    job.catch(() => {});
    return edition;
  }
  return job;
}

async function writeScript(edition, entry) {
  if (edition.scriptSource === 'ai' || !entry || entry.slot.useAiScript === false) return edition;
  if (!geminiService.isConfigured()) {
    if (!edition.note) {
      edition.note = 'GEMINI_API_KEY is not set, so the desk line is read instead of an AI script.';
      await edition.save();
    }
    return edition;
  }

  // Headlines only, deliberately: the more of a story the model is handed, the
  // more room there is to restate a detail in its own words and get it wrong. A
  // bulletin link only has to name what is on air.
  const stories = (edition.storyTitles || []).map((title) => ({ title }));
  if (!stories.length) return edition;

  try {
    const written = await geminiService.radioScript({
      slotName: edition.slotName,
      at: entry.slot.at,
      dayName: DAY_NAMES[wallClockDay(edition.startedAt, edition.timezone)],
      stories
    });
    edition.opening = written.opening;
    edition.closing = written.closing || edition.closing;
    edition.scriptSource = 'ai';
    edition.model = written.model;
    edition.note = '';
    await edition.save();
  } catch (error) {
    // The bulletin goes out either way. The reason is kept so the admin can read
    // why the programme sounded like the fallback.
    edition.note = `AI script not used: ${String(error?.message || error).slice(0, 160)}`;
    await edition.save();
  }
  return edition;
}

function wallClockDay(instant, timeZone) {
  return clock.wallClock(instant, timeZone).day;
}

/**
 * Take one edition off the air.
 *
 * The admin portal needs this because an edition is deliberately kept: pull it and
 * the next read builds a fresh one from what is published at that moment. Only ever
 * one slot and one occurrence, never a sweep.
 */
async function dropBulletin({ slotId, occurrence }) {
  const removed = await RadioBulletin.deleteOne({ slot: String(slotId), occurrence: String(occurrence) });
  return removed?.deletedCount || 0;
}

async function recentBulletins({ limit = 14 } = {}) {
  const wanted = Math.min(Math.max(Number(limit) || 14, 1), 50);
  return RadioBulletin.find().sort({ startedAt: -1 }).limit(wanted).lean();
}

/**
 * Everything the radio page needs in one read.
 *
 * The stories come back as full articles because the page reads them aloud; the
 * timetable comes back as wall-clock times plus real instants, because a reader
 * who is deciding whether to come back for the six o'clock wants the countdown,
 * not a string to parse.
 */
async function timetable({ now = new Date(), withBulletin = true } = {}) {
  const { schedule, resolved } = await resolveNow(now);
  const slots = (schedule.slots || []).map((slot) => ({
    _id: String(slot._id),
    name: slot.name,
    at: slot.at,
    days: slot.days || [],
    storyCount: slot.storyCount,
    categories: (slot.categories || []).map(String),
    useAiScript: slot.useAiScript !== false,
    enabled: slot.enabled !== false
  }));

  const shape = (entry) =>
    entry && {
      _id: String(entry.slot._id),
      name: entry.slot.name,
      at: entry.slot.at,
      startsAt: entry.startsAt.toISOString(),
      occurrence: entry.occurrenceKey
    };

  const payload = {
    timezone: resolved.clock.timeZone,
    now: now.toISOString(),
    slots,
    current: shape(resolved.current),
    next: shape(resolved.next)
  };

  if (withBulletin && resolved.current) {
    const bulletin = await bulletinFor(resolved.current, { now });
    if (bulletin) {
      const articles = await Article.find({ _id: { $in: bulletin.stories }, status: 'published' })
        .sort({ publishedAt: -1 })
        .populate('author', 'fullName username avatar')
        .populate('category', 'name slug translations');
      // The database gives the order the query returned; the bulletin's own order
      // is the running order of the programme, so the page is handed that one.
      const byId = new Map(articles.map((article) => [String(article._id), article]));
      payload.bulletin = {
        _id: String(bulletin._id),
        opening: bulletin.opening,
        closing: bulletin.closing,
        scriptSource: bulletin.scriptSource,
        model: bulletin.model,
        note: bulletin.note,
        startedAt: bulletin.startedAt.toISOString(),
        occurrence: bulletin.occurrence,
        stories: bulletin.stories.map(String).map((id) => byId.get(id)).filter(Boolean).map((article) => article.toJSON())
      };
    }
  }

  return payload;
}

/**
 * The warm-up the scheduler calls.
 *
 * Render's free tier sleeps between visits, so this is a convenience and not the
 * mechanism: `timetable` builds an edition on demand when a reader arrives and no
 * cron ever fired for it.
 */
async function airDueBulletin(now = new Date()) {
  const { resolved } = await resolveNow(now);
  if (!resolved.current) return null;
  const slotId = String(resolved.current.slot._id);
  const exists = await RadioBulletin.findOne({ slot: slotId, occurrence: resolved.current.occurrenceKey });
  // Nothing to do on the ninety-ninth minute of a bulletin that was made at zero.
  if (exists && exists.scriptSource === 'ai') return null;
  const built = await bulletinFor(resolved.current, { now, awaitScript: true });
  return built
    ? { slotName: built.slotName, occurrence: built.occurrence, stories: built.stories.length, scriptSource: built.scriptSource, note: built.note }
    : null;
}

/**
 * Replacing the timetable.
 *
 * Slots are validated here rather than trusted from the request: a programme that
 * starts at "25:70" or reads on a timezone the machine does not know would make
 * the whole page answer "nothing is on air", which is worse than a refused save.
 */
function normaliseSlots(input) {
  const list = Array.isArray(input) ? input : [];
  if (!list.length) return { error: 'A timetable needs at least one programme' };
  if (list.length > 12) return { error: 'Twelve programmes is more than a day can hold' };

  const slots = [];
  for (const item of list) {
    const name = String(item?.name || '').trim().slice(0, 60);
    const at = String(item?.at || '').trim();
    if (!name) return { error: 'Every programme needs a name' };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) return { error: `"${at}" is not a time. Use 24-hour "HH:mm", like 18:00.` };
    const days = (Array.isArray(item?.days) ? item.days : []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    const categories = (Array.isArray(item?.categories) ? item.categories : []).map(String).filter(Boolean);
    slots.push({
      name,
      at,
      days: [...new Set(days)],
      categories,
      storyCount: Math.min(Math.max(Number(item?.storyCount) || 8, 1), 25),
      useAiScript: item?.useAiScript !== false,
      enabled: item?.enabled !== false
    });
  }

  const seen = new Set();
  for (const slot of slots) {
    const key = `${slot.at}|${slot.name.toLowerCase()}`;
    if (seen.has(key)) return { error: `Two programmes called "${slot.name}" start at ${slot.at}` };
    seen.add(key);
  }
  slots.sort((a, b) => a.at.localeCompare(b.at));
  return { slots };
}

async function saveSchedule({ slots, timezone, updatedBy }) {
  const zone = String(timezone || '').trim() || 'Africa/Kigali';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
  } catch {
    return { error: `"${zone}" is not a clock this server can read. Use a city name like Africa/Kigali.` };
  }
  const cleaned = normaliseSlots(slots);
  if (cleaned.error) return { error: cleaned.error };

  const schedule = await getSchedule();
  schedule.timezone = zone;
  schedule.slots = cleaned.slots;
  schedule.updatedBy = updatedBy || schedule.updatedBy;
  await schedule.save();
  return { schedule };
}

module.exports = {
  getSchedule,
  timetable,
  bulletinFor,
  airDueBulletin,
  saveSchedule,
  normaliseSlots,
  pickStories,
  resolveNow,
  dropBulletin,
  recentBulletins,
  DEFAULT_SLOTS
};
