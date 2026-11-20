const crypto = require('crypto');
const nodemailer = require('nodemailer');
const env = require('../config/env');
const NewsletterSubscriber = require('../models/NewsletterSubscriber');

// Email is opt-in the way push is: with no SMTP credentials every route still
// answers, it just reports honestly that nothing will be delivered instead of
// pretending a mail was sent.
function status() {
  if (!env.SMTP_HOST) {
    return { configured: false, reason: 'email alerts are not configured on this server (SMTP_HOST is not set)' };
  }
  if (!env.MAIL_FROM_EMAIL) {
    return { configured: false, reason: 'email alerts are not configured on this server (MAIL_FROM_EMAIL is not set)' };
  }
  return {
    configured: true,
    from: env.MAIL_FROM_NAME ? `${env.MAIL_FROM_NAME} <${env.MAIL_FROM_EMAIL}>` : env.MAIL_FROM_EMAIL,
  };
}

let transport = null;
let transportKey = '';

function getTransport() {
  // Rebuilt when the host changes, so a credential swap needs no restart -
  // and so tests can stub createTransport before the first real call.
  const key = `${env.SMTP_HOST}:${env.SMTP_PORT}`;
  if (!transport || transportKey !== key) {
    transportKey = key;
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transport;
}

// Messages are plain text with a minimal HTML alternative: no images, no
// tracking pixels, nothing that phones home when a reader opens the mail.
async function send({ to, subject, text, html }) {
  const state = status();
  if (!state.configured) return { delivered: false, skipped: 'NOT_CONFIGURED' };
  try {
    await getTransport().sendMail({ from: state.from, to, subject, text, html });
    return { delivered: true };
  } catch (error) {
    // One redacted line: the provider's own failure text, never an address,
    // never the password.
    console.warn('newsletter email send failed:', error.message);
    return { delivered: false, error: 'SEND_FAILED' };
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function mintToken() {
  const token = crypto.randomBytes(24).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

// The lookup is by hash, so the only thing an attacker's timing can measure is
// the index; timingSafeEqual on top stops an operator-bearing query against
// the hash field from being read back as a match.
async function findByToken(token) {
  const raw = String(token || '');
  if (!/^[a-f0-9]{48}$/.test(raw)) return null;
  const hash = hashToken(raw);
  const subscriber = await NewsletterSubscriber.findOne({ confirmTokenHash: hash });
  if (!subscriber) return null;
  const stored = Buffer.from(subscriber.confirmTokenHash || '', 'utf8');
  const wanted = Buffer.from(hash, 'utf8');
  if (stored.length !== wanted.length || !crypto.timingSafeEqual(stored, wanted)) return null;
  return subscriber;
}

// Links point back at the newsletter routes themselves, so a mail works even
// when the frontend has no page for the click yet.
function siteBase() {
  const base = env.PUBLIC_URL || env.CLIENT_URL.split(',')[0].trim();
  return base.replace(/\/$/, '');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

// An email client is not a browser. Styles have to sit on the cells themselves,
// the layout has to be a table, and everything has to read as one clean column
// on the phone screen where the code is going to be typed. No images and no
// external CSS - a mail that phones home when it opens is not something a
// newsroom sends, and a remote stylesheet is the first thing a blocked mail drops.
function shell({ title, preview, body }) {
  const brand = escapeHtml(env.MAIL_FROM_NAME || 'RADAR');
  const site = siteBase();
  const host = escapeHtml(site.replace(/^https?:\/\//, ''));
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title></head>`,
    '<body style="margin:0;padding:0;background:#eff2f6;">',
    // The line an inbox prints under the subject is built from the first words
    // of the mail. A code that only appears after the opening sentence is cut
    // off there, which is exactly what made the number invisible until the
    // reader opened the message - so it goes first, hidden inside the mail
    // itself and visible in the preview.
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;">${escapeHtml(preview)}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff2f6;">',
    '<tr><td align="center" style="padding:20px 10px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
    `<tr><td style="padding:24px 28px 0;font-size:17px;font-weight:800;letter-spacing:2px;color:#1877F2;">${brand}</td></tr>`,
    `<tr><td style="padding:16px 28px 0;font-size:19px;font-weight:700;line-height:1.35;color:#0d1b2a;">${escapeHtml(title)}</td></tr>`,
    `<tr><td style="padding:14px 28px 26px;font-size:15px;line-height:1.65;color:#2d3b4e;">${body}</td></tr>`,
    `<tr><td style="padding:16px 28px;background:#f6f8fb;font-size:12px;line-height:1.6;color:#6b7889;">`
      + `Sent by <a href="${escapeHtml(site)}" style="color:#41608a;text-decoration:none;">${host}</a>. `
      + 'A newsroom never asks for your code by phone, message or reply email.</td></tr>',
    '</table></td></tr></table></body></html>',
  ].join('\n');
}

// The number itself, in a box: large, spaced, monospaced and on a background of
// its own. A six-digit code that has to be picked out of a paragraph is the
// formatting complaint this answers.
function codeCard(code) {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;">',
    '<tr><td align="center" style="padding:18px 10px;background:#f2f7ff;border:2px dashed #1877F2;border-radius:12px;">',
    '<div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#41608a;">Your code</div>',
    `<div style="font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:#0d1b2a;padding-top:10px;text-align:center;">${escapeHtml(code)}</div>`,
    '</td></tr></table>',
  ].join('\n');
}

/**
 * The recovery mail, built here rather than in the route: whoever asks for a
 * code should not also have to decide how it looks.
 *
 * The plain text alternative leads with the number too, because a reader on a
 * client that refuses HTML - or an inbox preview that only shows the first line
 * - still gets the code.
 */
function sendSignInCode({ to, code, subject = 'Your RADAR sign-in code', ttlMinutes = 10, maxAttempts = 5 }) {
  const digits = String(code);
  const text = [
    `Your RADAR sign-in code is ${digits}`,
    '',
    `It expires in ${ttlMinutes} minutes and stops working after ${maxAttempts} wrong tries.`,
    'Type it on the RADAR sign-in screen, then choose a new password.',
    '',
    'RADAR will never ask you for this code by phone, message or email.',
    'If you did not ask for it, ignore this mail and change your password the next time you sign in.',
  ].join('\n');
  const body = [
    '<p style="margin:0 0 14px;">Use this code to finish resetting your password.</p>',
    codeCard(digits),
    `<p style="margin:0 0 12px;"><strong>It expires in ${ttlMinutes} minutes</strong>, and it stops working after ${maxAttempts} wrong tries.</p>`,
    '<p style="margin:0 0 14px;">Type it on the RADAR sign-in screen, then choose a new password.</p>',
    '<p style="margin:0;color:#6b7889;font-size:14px;">If you did not ask for this, ignore the mail - nothing changes until a code is typed into the form.</p>',
  ].join('\n');
  return send({
    to,
    subject,
    text,
    html: shell({ title: 'Your sign-in code', preview: `Your RADAR sign-in code is ${digits}`, body }),
  });
}

function sendConfirmation(subscriber, token) {
  const confirm = `${siteBase()}/api/newsletter/confirm?token=${token}`;
  const off = `${siteBase()}/api/newsletter/unsubscribe?token=${token}`;
  const text = [
    'Confirm your email alerts for the newsroom.',
    `Open this link to confirm: ${confirm}`,
    `Changed your mind? Stop it here: ${off}`,
    'If you did not ask for this, just ignore the mail - nothing is sent until you confirm.',
  ].join('\n\n');
  const body = [
    '<p style="margin:0 0 16px;">One click and the newsroom can send you its alerts. Nothing arrives until you do it.</p>',
    `<p style="margin:0 0 20px;"><a href="${confirm}" style="display:inline-block;background:#1877F2;color:#ffffff;font-weight:700;padding:12px 20px;border-radius:8px;text-decoration:none;">Confirm my email address</a></p>`,
    `<p style="margin:0;color:#6b7889;font-size:14px;">Changed your mind? <a href="${off}" style="color:#41608a;">Stop these alerts</a> before you ever start them.</p>`,
  ].join('\n');
  return send({
    to: subscriber.email,
    subject: 'Confirm your news alerts',
    text,
    html: shell({ title: 'Confirm your news alerts', preview: 'One click and your RADAR alerts are on.', body }),
  });
}

// The publish flow can call this without caring whether email works - the
// return value always says which of the two it was:
//   await announceByEmail('Headline', { text: 'A short intro', html: '<p>...</p>' })
// html is optional; the plain text body is always sent alongside it.
async function announceByEmail(subject, body) {
  const state = status();
  const total = await NewsletterSubscriber.countDocuments({ status: 'confirmed' });
  if (!state.configured) return { delivered: false, skipped: 'NOT_CONFIGURED', sent: 0, failed: 0, total };

  const text = typeof body === 'string' ? body : String((body && body.text) || '');
  const html = (body && body.html) ? String(body.html) : `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

  let sent = 0;
  let failed = 0;
  // Sequential on purpose: a free SMTP relay throttles hard, and a burst of
  // refusals is the fastest way to get the whole newsroom marked as spam.
  for (const subscriber of await NewsletterSubscriber.find({ status: 'confirmed' }).lean()) {
    // A fresh token per mail keeps the unsubscribe link of the newest message
    // live, which is the one a reader actually clicks.
    const { token, tokenHash } = mintToken();
    await NewsletterSubscriber.updateOne({ _id: subscriber._id }, { $set: { confirmTokenHash: tokenHash } });
    const off = `${siteBase()}/api/newsletter/unsubscribe?token=${token}`;
    const result = await send({
      to: subscriber.email,
      subject,
      text: `${text}\n\n--\nStop these alerts: ${off}`,
      html: shell({
        title: subject,
        preview: text.slice(0, 140),
        body: `${html}<hr style="border:none;border-top:1px solid #e3e8ef;margin:22px 0 14px;">`
          + `<p style="margin:0;font-size:14px;"><a href="${off}" style="color:#41608a;">Stop these alerts</a> - one click, no questions asked.</p>`,
      }),
    });
    if (result.delivered) sent += 1;
    else failed += 1;
  }
  return { delivered: sent > 0 && failed === 0, sent, failed, total };
}

// A story, not a press release: the mail carries the headline, the summary the
// newsroom already wrote, one link, and the stop link. Nothing is tracked.
async function announceStory(article) {
  if (!article || !article.title) return { delivered: false, skipped: 'NO_STORY', sent: 0, failed: 0, total: 0 };
  const link = `${siteBase()}/article/${article.slug || article._id}`;
  const summary = String(article.summary || '').trim();
  const text = [summary, `Read it here: ${link}`].filter(Boolean).join('\n\n');
  const html = `<p style="margin:0 0 16px;">${escapeHtml(summary).replace(/\n/g, '<br>')}</p>`
    + `<p style="margin:0;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1877F2;color:#ffffff;font-weight:700;padding:12px 20px;border-radius:8px;text-decoration:none;">Read the story</a></p>`;
  const result = await announceByEmail(String(article.title).slice(0, 200), { text, html });
  return { ...result, link };
}

module.exports = {
  status,
  send,
  mintToken,
  hashToken,
  findByToken,
  sendConfirmation,
  sendSignInCode,
  announceByEmail,
  announceStory,
  siteBase,
};
