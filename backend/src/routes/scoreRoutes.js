const express = require('express');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const liveScoreService = require('../services/liveScoreService');

const router = express.Router();

/**
 * What is on the scores page.
 *
 * Four reads, all public, all answered from our own database wherever the
 * database can answer them. The browser never talks to a sports feed and never
 * needs to: that is the whole reason a crowd on one shared carrier address can
 * watch sixty matches at once without the newsroom's IP being the thing that
 * gets rate-limited.
 *
 * The payloads are deliberately wider than a table of numbers. `stale`,
 * `refreshing` and `fetchedAt` travel with the rows so the page can tell a
 * reader, in words, when the score they are looking at was last really fetched
 * instead of presenting a figure it cannot stand behind.
 */

/** The leagues this newsroom follows, with whatever it knows about today. */
router.get('/leagues', async (req, res, next) => {
  try {
    return successResponse(res, 200, 'Leagues', await liveScoreService.leagues({ now: new Date() }));
  } catch (error) {
    return next(error);
  }
});

/**
 * Every league's matches on one day, grouped, with the counts the tabs use.
 *
 * `?live=1` is the "Live" tab and costs nothing extra: the rows are already in
 * the document, and the answer keeps the whole grouping so the tab does not have
 * to change the page's shape.
 */
router.get('/scoreboard', async (req, res, next) => {
  try {
    const payload = await liveScoreService.scoreboard({
      date: req.query.date,
      league: req.query.league,
      live: req.query.live === '1' || req.query.live === 'true',
      now: new Date(),
    });
    if (!payload.ok) {
      // A date outside the window is its own answer, because the reader picked it
      // and deserves to be told why the page cannot show it.
      if (payload.reason === 'DATE_OUT_OF_RANGE') {
        return errorResponse(res, 400, 'The scores page covers the last week and the three weeks ahead.');
      }
      return errorResponse(res, 400, 'Unknown competition');
    }
    return successResponse(res, 200, 'Live scores', payload);
  } catch (error) {
    return next(error);
  }
});

/** One match: goals, cards, substitutions, line-ups, statistics. */
router.get('/match/:id', async (req, res, next) => {
  try {
    const payload = await liveScoreService.matchDetail(req.params.id, {
      league: req.query.league,
      now: new Date(),
    });
    if (!payload.ok) {
      // A match that has never been looked at cannot be described before it is
      // fetched, so an unreachable feed at that moment is the server's problem
      // to report, not the reader's to guess at.
      if (payload.reason === 'BAD_MATCH') return errorResponse(res, 400, 'Unknown match');
      if (payload.reason === 'UNKNOWN_LEAGUE') return errorResponse(res, 400, 'Unknown competition');
      return errorResponse(res, 502, 'Scores are not reachable right now, please try again in a moment.');
    }
    return successResponse(res, 200, 'Match', payload);
  } catch (error) {
    return next(error);
  }
});

/** One competition's league table. */
router.get('/standings', async (req, res, next) => {
  try {
    const payload = await liveScoreService.standings(req.query.league, { now: new Date() });
    if (!payload.ok) {
      if (payload.reason === 'UNKNOWN_LEAGUE') return errorResponse(res, 400, 'Unknown competition');
      return errorResponse(res, 502, 'The league table is not reachable right now, please try again in a moment.');
    }
    return successResponse(res, 200, 'League table', payload);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
