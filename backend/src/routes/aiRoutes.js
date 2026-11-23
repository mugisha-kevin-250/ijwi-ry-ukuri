const express = require('express');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const geminiService = require('../services/geminiService');
const aiReaderService = require('../services/aiReaderService');
const { plainText } = require('../utils/textFields');

const router = express.Router();

/**
 * RADAR AI - the question desk a reader talks to.
 *
 * The public face of the newsroom's Gemini key. Three things are deliberately
 * true of every route in this file:
 *
 * 1. The key never reaches a browser. The page posts to this server and this
 *    server is the only thing that talks to Google, so the paid credential
 *    stays in the environment where only the owner can read it.
 * 2. A stranger's question cannot make the newsroom say something it has not
 *    reported. Answers are grounded in published stories, looked up here
 *    (see aiReaderService); the slug or topic a page sends is a pointer into
 *    our own database, never a block of text handed to the model.
 * 3. Nothing of the conversation is stored. The thread lives in the reader's
 *    tab and is replayed to the model with the next question, which keeps a
 *    follow-up coherent without this server holding remarks made by people it
 *    does not know. There is no account, no cookie and no table for it.
 *
 * When the key is missing the status call says so and the page prints that
 * instead of a fake chat window - the same rule the weather desk follows.
 */

// Longest question we will send, longest replayed turn we will keep. A reader
// pressing "explain more" writes a sentence, not an essay, and the ceiling
// exists to stop one tab spending the newsroom's monthly budget on one call.
const MAX_QUESTION = 1200;
const MAX_TURNS_KEPT = 8;
const MAX_TURN_CHARS = 1500;

/**
 * How many questions one address may ask in an hour.
 *
 * This is the number the reader-facing chat page works under, so it lives here,
 * beside the desk, and `app.js` reads it for the rate limiter rather than the
 * other way round: the ceiling and the page that names it must not be able to
 * disagree. Twelve was set when the only way in was one boxed question under a
 * story. A conversation spends twelve in six exchanges, and the whole point of
 * the chat page is that a reader may keep asking - so the desk is staffed for
 * forty an hour from one address, which is still a long way short of what one
 * browser sitting on a shared carrier address could spend in an hour if it had
 * no ceiling at all.
 */
const READER_AI_QUESTIONS_PER_HOUR = 40;

/** Is the desk staffed at all. */
router.get('/status', (req, res) => {
  return successResponse(res, 200, 'AI status', {
    configured: geminiService.isConfigured(),
    model: geminiService.activeModel(),
    // The reader-facing panel names the limit it works under, so an answer that
    // stops arriving is explained by the page rather than by silence.
    maxQuestionChars: MAX_QUESTION,
    turnsKept: MAX_TURNS_KEPT,
    questionsPerHour: READER_AI_QUESTIONS_PER_HOUR
  });
});

/**
 * One question.
 *
 * `q` is required; `slug` grounds the answer in the story a reader is on, and
 * `topic` is the looser pointer the home page uses. `history` is the reader's
 * own previous turns, kept in their browser - it is trimmed, role-checked and
 * capped before it goes anywhere near the model.
 */
router.post('/ask', async (req, res, next) => {
  try {
    if (!geminiService.isConfigured()) {
      return errorResponse(res, 503, 'RADAR AI is not connected yet. The newsroom has to give this server its Gemini key before it can answer.');
    }

    const question = plainText(req.body?.q, { maxLength: MAX_QUESTION });
    // Two characters is as short as a question gets, and that is a greeting: "hi"
    // arrives at this desk the way it arrives at any other, and a desk that answers
    // "Type a question first" to a reader saying hello has already lost them.
    if (question.trim().length < 2) {
      return errorResponse(res, 400, 'Type a question first - a few words are enough.');
    }

    const history = (Array.isArray(req.body?.history) ? req.body.history : [])
      .filter((turn) => turn && typeof turn.text === 'string' && turn.text.trim())
      .slice(-MAX_TURNS_KEPT)
      .map((turn) => ({
        role: turn.role === 'assistant' ? 'assistant' : 'user',
        text: plainText(turn.text, { maxLength: MAX_TURN_CHARS })
      }));

    const slug = plainText(req.body?.slug, { maxLength: 200 });
    const topic = plainText(req.body?.topic, { maxLength: 120 });

    const result = await aiReaderService.ask({ question, history, slug, topic });
    return successResponse(res, 200, 'RADAR AI', result);
  } catch (error) {
    // The model's own failures are newsroom information, not stack traces: the
    // reader gets a sentence about the desk, and nothing about the upstream.
    const code = String(error?.code || '');
    if (code === 'AI_EMPTY') return errorResponse(res, 400, error.message);
    if (code === 'AI_BLOCKED') return errorResponse(res, 400, 'RADAR AI will not answer that one. Ask about the news instead.');
    if (code === 'AI_NOT_CONFIGURED') return errorResponse(res, 503, 'RADAR AI is not connected right now. Please try again later.');
    if (code === 'AI_RATE_LIMIT') return errorResponse(res, 429, 'RADAR AI is answering a lot of questions at the moment. Please try again in a minute.');
    if (code === 'AI_UNREACHABLE') return errorResponse(res, 502, 'RADAR AI could not be reached just now. Please try again in a moment.');
    if (code.startsWith('AI_')) return errorResponse(res, 502, 'RADAR AI could not answer that. Please try again, or rephrase your question.');
    return next(error);
  }
});

module.exports = router;
module.exports.QUESTIONS_PER_HOUR = READER_AI_QUESTIONS_PER_HOUR;
