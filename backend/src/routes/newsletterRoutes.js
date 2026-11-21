const express = require('express');
const NewsletterSubscriber = require('../models/NewsletterSubscriber');
const mailer = require('../services/mailerService');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const router = express.Router();

// Same human-shaped address check the contact form uses: a wrong one costs the
// reader a bounce letter, and a strict parser only rejects people with modern
// addresses the site has never heard of.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Confirm and unsubscribe links open on the API itself, so the page a reader
// lands on works even before the frontend grows routes for it.
function page(res, code, heading, note) {
  return res.status(code).type('html').send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width"><title>${heading}</title></head>`
    + `<body style="font-family: system-ui, sans-serif; max-width: 34rem; margin: 4rem auto; line-height: 1.5">`
    + `<h1>${heading}</h1><p>${note}</p></body></html>`
  );
}

router.get('/status', (req, res) => {
  const state = mailer.status();
  return successResponse(res, 200, 'Newsletter status', {
    configured: state.configured,
    reason: state.reason || null,
  });
});

router.post('/subscribe', async (req, res, next) => {
  try {
    const state = mailer.status();
    // Bots fill every field they are given, same trick as the contact form;
    // the answer is the identical success so a crawler cannot learn which
    // field to leave out.
    if (String(req.body?.website || '').trim()) {
      return successResponse(res, 200, 'Subscription recorded', {
        delivered: false, needsConfirmation: true, configured: state.configured,
      });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || email.length > 200 || !EMAIL_SHAPE.test(email)) {
      return errorResponse(res, 400, 'That email address is missing something, so we could not mail it.');
    }

    let subscriber = await NewsletterSubscriber.findOne({ email });
    if (subscriber && subscriber.status === 'confirmed') {
      // Already on the list: no second mail and no pretend "check your inbox".
      return successResponse(res, 200, 'Already on the list', {
        delivered: false, needsConfirmation: false, configured: state.configured,
      });
    }

    // A re-subscribe reactivates the one row this address is allowed to have,
    // with a fresh token - the old link has been superseded anyway.
    const { token, tokenHash } = mailer.mintToken();
    if (subscriber) {
      subscriber.status = 'pending';
      subscriber.confirmTokenHash = tokenHash;
      subscriber.confirmedAt = null;
      subscriber.unsubscribedAt = null;
    } else {
      subscriber = new NewsletterSubscriber({
        email,
        status: 'pending',
        confirmTokenHash: tokenHash,
        source: String(req.body?.source || 'site').slice(0, 60),
      });
    }

    try {
      await subscriber.save();
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Two first subscribes racing on the unique index: the loser updates the
      // row the winner just created instead of failing on the reader.
      subscriber = await NewsletterSubscriber.findOne({ email });
      if (!subscriber) throw error;
      subscriber.status = 'pending';
      subscriber.confirmTokenHash = tokenHash;
      await subscriber.save();
    }

    // The address is on the list the moment this write lands; the confirmation
    // mail is what may take a while. The reader is answered inside a short
    // budget and the mail finishes behind the response, so a relay that is slow
    // today cannot look like a dead newsroom.
    const result = await mailer.answerWithin(
      () => mailer.sendConfirmation(subscriber, token),
      undefined,
      { purpose: 'newsletter-confirm', to: email, subject: 'Confirm your news alerts' },
    );
    return successResponse(res, 200,
      result.delivered ? 'We mailed you a confirmation link'
        : result.queued ? 'We are mailing you a confirmation link'
          : 'Subscription recorded',
      {
        delivered: result.delivered === true,
        queued: result.queued === true,
        needsConfirmation: true,
        configured: state.configured,
      });
  } catch (error) {
    next(error);
  }
});

router.get('/confirm', async (req, res, next) => {
  try {
    const subscriber = await mailer.findByToken(req.query.token);
    if (!subscriber) {
      return page(res, 400, 'That link no longer works',
        'Confirmation links are replaced whenever a new subscription is made. Subscribe again on the site to get a fresh one.');
    }
    if (subscriber.status === 'pending') {
      subscriber.status = 'confirmed';
      subscriber.confirmedAt = new Date();
      await subscriber.save();
      return page(res, 200, 'Your alerts are on',
        'You will get a short email when the newsroom publishes something new. Every mail carries a link to stop them.');
    }
    if (subscriber.status === 'confirmed') {
      // Re-opening an old mail must not touch the document or fake a second
      // confirmation; the answer is simply "already done".
      return page(res, 200, 'Already confirmed', 'This address is already on the alert list.');
    }
    return page(res, 200, 'This address is unsubscribed',
      'Subscribe again from the site if you want the alerts back.');
  } catch (error) {
    next(error);
  }
});

async function resolveUnsubscribe(req) {
  const token = String(req.query.token ?? req.body?.token ?? '');
  return mailer.findByToken(token);
}

router.post('/unsubscribe', async (req, res, next) => {
  try {
    const subscriber = await resolveUnsubscribe(req);
    if (!subscriber) return errorResponse(res, 400, 'That unsubscribe link is not one we recognise.');
    if (subscriber.status !== 'unsubscribed') {
      subscriber.status = 'unsubscribed';
      subscriber.unsubscribedAt = new Date();
      await subscriber.save();
    }
    return successResponse(res, 200, 'Unsubscribed from email alerts', { unsubscribed: true });
  } catch (error) {
    next(error);
  }
});

// The GET version is what the link inside a mail opens, so it answers with the
// page a human clicked through to instead of raw JSON.
router.get('/unsubscribe', async (req, res, next) => {
  try {
    const subscriber = await resolveUnsubscribe(req);
    if (!subscriber) {
      return page(res, 400, 'That link no longer works',
        'Unsubscribe links are replaced with every new alert mail. The newest mail you received has a working one.');
    }
    if (subscriber.status !== 'unsubscribed') {
      subscriber.status = 'unsubscribed';
      subscriber.unsubscribedAt = new Date();
      await subscriber.save();
    }
    return page(res, 200, 'You are unsubscribed', 'No alert emails will be sent to this address again.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
