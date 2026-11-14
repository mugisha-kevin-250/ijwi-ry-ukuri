const express = require('express');
const translate = require('../services/translateService');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const router = express.Router();

/**
 * The translation desk. Everything here is read-only for a reader: the site
 * asks for a language, gets the news in it, and is told plainly when the
 * language cannot be served. The key never crosses this boundary - it lives on
 * the server and only the server talks to Google.
 */

// The list the picker shows, and whether it is worth showing it at all.
router.get('/languages', (req, res) => {
  return successResponse(res, 200, 'Languages fetched', {
    languages: translate.languages,
    ...translate.status(),
  });
});

// Does this reader's language exist as far as Google is concerned?
router.get('/check', (req, res) => {
  const lang = translate.normalizeLang(req.query.lang);
  return successResponse(res, 200, 'Language checked', {
    requested: String(req.query.lang || ''),
    language: lang,
    supported: Boolean(lang),
    ...translate.status(),
  });
});

// The site's own labels - the buttons, the nav, the section names - as one set.
// A reader's browser sends the English strings it already has, gets its language
// back once, and caches it; the server caches the same answer for everyone else.
router.post('/chrome', async (req, res, next) => {
  try {
    const { lang, strings } = req.body || {};
    const language = translate.normalizeLang(lang);
    if (!language) return errorResponse(res, 400, 'That language is not one we can translate into.');
    if (!strings || typeof strings !== 'object' || Array.isArray(strings)) {
      return errorResponse(res, 400, 'Send the words to translate as an object.');
    }
    const values = Object.values(strings);
    if (!values.length || values.length > 2000 || values.some((value) => typeof value !== 'string')) {
      return errorResponse(res, 400, 'That is not a set of labels we can translate.');
    }
    if (!translate.configured()) {
      return successResponse(res, 200, 'Translation is not configured', {
        language,
        translated: false,
        strings: {},
        ...translate.status(),
      });
    }
    const result = await translate.chromeStrings(strings, language);
    return successResponse(res, 200, result.translated ? 'Labels translated' : 'Labels left in English', {
      language,
      translated: result.translated,
      strings: result.strings,
      reason: result.reason,
      ...translate.status(),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
