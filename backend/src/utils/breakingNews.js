/**
 * Breaking news, and the discipline that comes with the words.
 *
 * "Breaking" is the desk saying this one is worth dropping what you are doing
 * for. It is not something a story claims about itself, and it is a spend: a
 * site with twelve red flags has the same label on everything and therefore on
 * nothing. So the flag is written from staff routes only, it records who
 * pressed it, and it is on a clock - yesterday's breaking story is today's
 * archive, and a reader should not have to know that a page is out of date to
 * stop being shouted at.
 *
 * The clock is kept in two places on purpose. The scheduler runs
 * `expireStale()` so the database tells the truth, and every reader surface
 * compares against `breakingAt` as it renders, so a story stops shouting the
 * minute it goes stale even on a host where the cron has not had a turn yet.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// How long a story is allowed to call itself breaking. A day, because a
// morning's live story is still what people are talking about that evening, and
// because anything longer turns the label into a permanent decoration.
const BREAKING_WINDOW_MS = DAY_MS;

// How many may be breaking at the same instant. Five is a rail a reader can
// actually read; past that, the newsroom is not prioritising, it is decorating.
const MAX_BREAKING = 5;

// A story that is not out yet cannot be breaking. Approved is allowed because
// the desk usually decides both in the same minute, and refusing it there would
// only teach the editor to publish first and flag second.
const DECLARABLE_STATES = ['approved', 'published'];

function windowStart(now) {
  return new Date(new Date(now).getTime() - BREAKING_WINDOW_MS);
}

/**
 * Does this story read as breaking right now?
 *
 * `isBreaking` alone is not enough: the flag is set once and the world moves.
 * A story with no timestamp was never stamped by this code, so it does not
 * count - that also keeps a hand-edited document from living forever.
 */
function readsAsBreaking(article, now = Date.now()) {
  if (!article || article.isBreaking !== true) return false;
  const stamped = article.breakingAt ? new Date(article.breakingAt).getTime() : NaN;
  if (!Number.isFinite(stamped)) return false;
  return now - stamped <= BREAKING_WINDOW_MS;
}

/**
 * Put the flag on, or take it off.
 *
 * Assigns onto the document rather than writing it, so whoever saves the story
 * next decides when it lands and the audit trail of the lifecycle is not
 * bypassed. Returns the refusal reason in the desk's own words: the cap is only
 * useful if pressing it tells you which story to take down.
 */
async function declare({ Article, article, on, by = null, now = Date.now() }) {
  if (!article) return { ok: false, reason: 'That story is not here.' };

  if (on === false) {
    article.isBreaking = false;
    article.breakingAt = undefined;
    article.breakingBy = null;
    return { ok: true, isBreaking: false, reason: null };
  }

  if (!DECLARABLE_STATES.includes(article.status)) {
    return {
      ok: false,
      reason: `Only a story that is out, or approved to go out, can be called breaking. This one is ${article.status}.`
    };
  }

  const live = await Article.countDocuments({
    _id: { $ne: article._id },
    isBreaking: true,
    breakingAt: { $gte: windowStart(now) }
  });
  if (live >= MAX_BREAKING) {
    return {
      ok: false,
      reason: `${live} stories are already breaking. Take one off before this one joins them.`
    };
  }

  article.isBreaking = true;
  article.breakingAt = new Date(now);
  article.breakingBy = by;
  return { ok: true, isBreaking: true, reason: null };
}

/**
 * Take the flag off everything that has aged out.
 *
 * `$set: { isBreaking: false }` and not unsetting the timestamp: the desk's
 * history of when it shouted is worth keeping, and the flag is what a reader
 * acts on.
 */
async function expireStale({ Article, now = Date.now() }) {
  const result = await Article.updateMany(
    {
      isBreaking: true,
      $or: [{ breakingAt: null }, { breakingAt: { $lt: windowStart(now) } }]
    },
    { $set: { isBreaking: false } }
  );
  return result.modifiedCount || 0;
}

module.exports = {
  declare,
  expireStale,
  readsAsBreaking,
  BREAKING_WINDOW_MS,
  MAX_BREAKING,
  DECLARABLE_STATES
};
