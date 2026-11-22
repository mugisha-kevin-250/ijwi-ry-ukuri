const express = require('express');
const NewsletterSubscriber = require('../models/NewsletterSubscriber');
const User = require('../models/User');
const mailer = require('../services/mailerService');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { protect, optionalAuth } = require('../middleware/auth');
const { cleanList, oneOrNothing } = require('../utils/newsletterPrefs');

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
    languages: mailer.alertLanguages(),
  });
});

/**
 * The address joins the list as pending, and stays pending until the reader
 * opens the mail we just sent them.
 *
 * Nothing else on the site works like this, and it is the point: an address
 * typed into a form is not proof that whoever typed it can read it. The
 * preference choices ride along now because they cost nothing to store and
 * everything to ask for twice - a reader who chose three desks on the home page
 * should not have to choose them again on the account screen.
 */
router.post('/subscribe', optionalAuth, async (req, res, next) => {
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

    const sections = cleanList(req.body?.sections);
    const language = oneOrNothing(req.body?.language, mailer.alertLanguages());
    const accountId = req.user && req.user._id ? req.user._id : null;

    let subscriber = await NewsletterSubscriber.findOne({ email });
    if (subscriber && subscriber.status === 'confirmed') {
      // Already on the list: no second mail and no pretend "check your inbox".
      // The choices still belong to them, so a signed-in reader who arrives here
      // with new preferences has them saved rather than thrown away.
      if (sections || language || accountId) {
        if (sections) subscriber.sections = sections;
        if (language) subscriber.language = language;
        if (accountId && !subscriber.user) subscriber.user = accountId;
        await subscriber.save();
      }
      return successResponse(res, 200, 'Already on the list', {
        delivered: false, needsConfirmation: false, configured: state.configured,
      });
    }

    if (subscriber) {
      // A re-subscribe reactivates the one row this address is allowed to have.
      // The tokens are minted by the mail itself, so nothing here can leave a
      // half-used link pointing at a row that moved on.
      subscriber.status = 'pending';
      subscriber.confirmedAt = null;
      subscriber.unsubscribedAt = null;
    } else {
      subscriber = new NewsletterSubscriber({ email, status: 'pending' });
    }
    if (sections) subscriber.sections = sections;
    if (language) subscriber.language = language;
    if (accountId) subscriber.user = accountId;
    subscriber.source = String(req.body?.source || 'site').slice(0, 60);

    try {
      await subscriber.save();
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Two first subscribes racing on the unique index: the loser updates the
      // row the winner just created instead of failing on the reader.
      subscriber = await NewsletterSubscriber.findOne({ email });
      if (!subscriber) throw error;
      subscriber.status = 'pending';
      await subscriber.save();
    }

    // The address is on the list the moment this write lands; the confirmation
    // mail is what may take a while. The reader is answered inside a short
    // budget and the mail finishes behind the response, so a relay that is slow
    // today cannot look like a dead newsroom.
    const result = await mailer.answerWithin(
      () => mailer.sendConfirmation(subscriber),
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

// An unsubscribe link is only ever an unsubscribe link. The token in it is
// looked up in its own field, so a confirmation link that has not been used yet
// cannot also be read as a request to stop, and vice versa.
async function resolveUnsubscribe(req) {
  const token = String(req.query.token ?? req.body?.token ?? '');
  return mailer.findByToken(token, 'unsubscribeTokenHash');
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

/**
 * The reader's own row, found through their own account.
 *
 * There is no id in this address and no query for another one: the row is found
 * by the account's user link or by the email on the account, and nothing else
 * can be read or written here. A reader who shares a family address is the case
 * that has to keep working - they see the row that address owns, which is the
 * row their alerts come from, and they cannot see anybody else's choices.
 */
async function ownSubscription(req) {
  const account = await User.findById(req.user._id).select('email').lean();
  const email = String(account && account.email ? account.email : '').toLowerCase();
  const rows = await NewsletterSubscriber.find({
    $or: [{ user: req.user._id }, ...(email ? [{ email }] : [])],
  }).sort({ updatedAt: -1 });
  return { account, subscriber: rows[0] || null, addressCount: rows.length };
}

function subscriptionState(subscriber) {
  if (!subscriber) return null;
  return {
    email: subscriber.email,
    status: subscriber.status,
    sections: subscriber.sections || [],
    language: subscriber.language || 'en',
    confirmedAt: subscriber.confirmedAt,
    unsubscribedAt: subscriber.unsubscribedAt,
    source: subscriber.source,
  };
}

router.get('/me', protect, async (req, res, next) => {
  try {
    const { account, subscriber } = await ownSubscription(req);
    return successResponse(res, 200, 'Your email alerts', {
      email: account ? account.email : null,
      subscription: subscriptionState(subscriber),
      languages: mailer.alertLanguages(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * What the reader wants, in what language, and whether they want it at all.
 *
 * `stop` is the account screen's one-click unsubscribe: the same thing the link
 * in a mail does, reached without hunting for the newest message. It is offered
 * here because a reader who is already signed in should not have to own an
 * inbox to leave one.
 */
router.put('/me', protect, async (req, res, next) => {
  try {
    const { account, subscriber } = await ownSubscription(req);
    if (!subscriber) {
      return errorResponse(res, 404, 'That address is not on the alert list yet. Ask for alerts to start them.');
    }

    if (req.body?.sections !== undefined) {
      const sections = cleanList(req.body.sections);
      // An empty list is a choice, not a mistake: it means the whole newsroom.
      subscriber.sections = sections || [];
    }
    if (req.body?.language !== undefined) {
      const language = oneOrNothing(req.body.language, mailer.alertLanguages());
      if (req.body.language && !language) {
        return errorResponse(res, 400, 'We only have alert words in the languages on that list.');
      }
      if (language) subscriber.language = language;
    }

    let mailed = null;
    let askAgain = false;
    if (req.body?.stop === true) {
      subscriber.status = 'unsubscribed';
      subscriber.unsubscribedAt = new Date();
    } else if (req.body?.start === true && subscriber.status !== 'confirmed') {
      subscriber.status = 'pending';
      subscriber.confirmedAt = null;
      subscriber.unsubscribedAt = null;
      askAgain = true;
    }

    await subscriber.save();

    // Only an explicit "start them again" sends a mail. Changing which desks
    // the reader wants is not a request for a third confirmation link.
    if (askAgain) {
      mailed = await mailer.answerWithin(
        () => mailer.sendConfirmation(subscriber),
        undefined,
        { purpose: 'newsletter-confirm', to: subscriber.email, subject: 'Confirm your news alerts' },
      );
    }

    return successResponse(res, 200, subscriber.status === 'unsubscribed'
      ? 'Your email alerts are stopped'
      : 'Your alert choices are saved', {
      subscription: subscriptionState(subscriber),
      confirmationMailed: mailed ? mailed.delivered === true : null,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
