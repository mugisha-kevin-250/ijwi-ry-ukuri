/**
 * Whether a story still reads as breaking.
 *
 * The server is the authority (backend/src/utils/breakingNews.js) and the
 * scheduler is what takes the flag off in the database. This copy of the same
 * twenty-four hours exists because a story can go stale between two cron runs,
 * and a reader should never be shouted at by an emergency that happened
 * yesterday. Both sides use the timestamp rather than the flag alone, so the
 * worst that a disagreement can do is one honest pill on a story the desk has
 * already taken down.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const BREAKING_WINDOW_MS = DAY_MS;

interface BreakingFields {
  isBreaking?: boolean;
  breakingAt?: string | Date | null;
}

export function readsAsBreaking(article?: BreakingFields | null, now: number = Date.now()): boolean {
  if (!article || article.isBreaking !== true) return false;
  const stamped = article.breakingAt ? new Date(article.breakingAt).getTime() : NaN;
  if (!Number.isFinite(stamped)) return false;
  return now - stamped <= BREAKING_WINDOW_MS;
}
