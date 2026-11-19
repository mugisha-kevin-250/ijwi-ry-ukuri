/**
 * What RADAR AI knows about RADAR itself.
 *
 * A reader who asks "how do I write news on RADAR?" is not asking about the
 * news; they are asking about this site, and no published story answers that.
 * Until now the desk had exactly one rule - say nothing that is not in a
 * published story - so the honest reply to a question about our own process was
 * a shrug, which reads to the reader as a broken product.
 *
 * So the process is written down here, once, in the words the newsroom stands
 * behind, and the model is allowed to repeat nothing else. Every line below was
 * read out of the code it describes: the states in `utils/articleLifecycle`,
 * the application route in `routes/writerRoutes`, the pages in the frontend
 * router. When a feature changes, this file is the place that has to change
 * with it, and a step that is not written here is a step the desk has to
 * admit it does not have - which is why the instruction says so.
 *
 * This is deliberately not a scrape of the open web and not a live read of the
 * database: it is the newsroom's own handbook, and it stays true to the rule
 * the owner set - AI explains and drafts, a human decides what is published.
 */

const GUIDE = `RADAR is a Rwandan news site with readers in the region and the diaspora. Everything below is how this site actually works.

WRITING AND PUBLISHING ON RADAR
1. Make an account. Press the person icon or "Sign in", then "Create account" at /register. A Google account works too.
2. Apply to write. Signed in, open /writer/dashboard. An account without writer access is shown the application there: a sentence or two on why you want to write for RADAR, and it goes to the newsroom as "pending" - it does not make anyone a writer.
3. An admin of the newsroom reads the application and approves it. Only then does the account become a writer. There is no self-service publishing and no waiting timer: a person decides. A rejected application can be sent again, and /contact has a "writer access" topic if someone wants to ask about a decision.
4. Write the story. In the dashboard press "Write story". A story needs a headline, a summary, the body, and a section (Rwanda, World, Politics, Business, Tech, Sports, Entertainment, Health, and so on). Pictures can be uploaded or pasted as a link, with the credit that goes under them. Saving keeps it as a draft, which only the author can see.
5. The AI writer in the dashboard can produce a draft from a topic. It is a starting point that sits in the author's drafts: it cannot publish itself and it is not filed as news until a person has read it, corrected it and sent it.
6. Send it for review. From the draft, press "Submit for review". The story becomes "awaiting review".
7. A decision comes back. An editor or an admin either approves it or rejects it with a written note explaining what is missing. A rejected story goes back to the author, who can fix it and send it again.
8. Published means live. An approved story is published and appears on the site, in its section, in the author's page, in search and in the feed. A story cannot go live without a headline, a summary, a body, a section and an author - the site refuses it and says which part is missing.
9. After that: a live story can be taken down (archived) and put back, and a mistake is fixed with a correction that stays visible under the story rather than a silent edit.

The short answer to "how do I write news on RADAR": create an account, apply to write in the writer dashboard, wait for approval, write a draft, submit it for review, and an editor publishes it.

READING RADAR
- Front page: the newest reporting, the top story, and the beats. Sections are under the logo, in the News list at /articles, and on the Categories page.
- Search at /search looks through published stories and the writers who filed them. On a phone there is a Search icon in the bottom bar.
- /authors is the directory of everyone who has published here. A reader can follow a writer and bookmark a story; both need an account.
- Comments are open on stories with moderation, and only signed-in readers can post them. The stories a reader saved are in their library at /library.
- Language: the flag menu in the header switches the whole site, and stories are served translated into the language chosen.
- Weather at /weather, live scores at /live-sports, TV at /live, spoken news on /radio, and the Ask RADAR AI desk itself.
- News alerts: an installed app can be turned on to push new stories to the device, and the newsletter goes out by email.
- Forgot a password: "Forgot your password?" on the sign-in page sends a six-digit code to the address on the account.

ADS, CONTACT AND POLICY
- Advertising: /advertising explains the slots and how to book one; the contact form has an "advertising" topic.
- Corrections and story tips: /contact (topics: correction, story tip, writer access, other). The corrections log is at /corrections.
- How the newsroom works: /about, /editorial-policy, /privacy, /cookies, /terms, /disclaimer.

WHAT TO BE CAREFUL ABOUT
- Never promise a reader that a story will be published, that an application will be approved, or give a time an editor will take. A person decides.
- Never describe a feature that is not in this handbook. If the question is about something not covered here, say the newsroom has not documented it and point to /contact.`;

// Which questions are about this site rather than about the news.
//
// One matched word used to be enough, and it was not: a story whose headline
// contains "language", "editor" or "review" is a news question wearing one of
// our words, and the handbook has nothing to say about it. So a question now
// has to show two things - that it names something the site itself has, and
// that somebody is asking how to do, get or change it - before the help desk
// answers. The exceptions are the handful of phrases that cannot occur in a
// question about the world ("writer access", "forgot my password"), which stand
// on their own.
const SITE_MACHINERY = [
  'radar',
  'this site',
  'this app',
  'this website',
  'the website',
  'your site',
  'your app',
  'your website',
  'writer',
  'journalist here',
  'correspondent',
  'publish',
  'submit',
  'apply',
  'approval',
  'draft',
  'review',
  'editor',
  'newsroom',
  'account',
  'profile',
  'sign up',
  'sign in',
  'register',
  'log in',
  'login',
  'password',
  'follow',
  'bookmark',
  'library',
  'comment',
  'notif',
  'alert',
  'newsletter',
  'subscribe',
  'advertise',
  'advertising',
  'sponsor',
  'correction',
  'contact',
  'earnings',
  'payout',
  'monetis',
  'translation',
  'translate',
  'language menu',
  'language switch',
  'flag menu',
  'install the app',
  'ai writer',
  'radar ai',
];

// The frames that mean "I am trying to do something here", which is what the
// handbook answers. A bare "how" about the world is not enough on its own.
const ASK_FOR_INSTRUCTIONS = [
  'how do i',
  'how do you',
  'how can i',
  'how can you',
  'how to',
  'how does',
  'how do we',
  'i want to',
  'i need to',
  'i would like to',
  'i tried to',
  'i cannot',
  "i can't",
  'can i',
  'could i',
  'am i able',
  'where do i',
  'where can i',
  'what do i do',
  'what is the process',
  'steps to',
  'step by step',
  'guide to',
  'ways to',
  'get access',
  'become a',
  'set up',
  'turn on',
  'turn off',
  'change my',
  'update my',
  'delete my',
  'my account',
  'my password',
  'sign me',
];

// Unambiguous on their own: nothing in a question about the news says these.
const SITE_STANDALONE = [
  'writer access',
  'writer dashboard',
  'become a writer',
  'write for radar',
  'write news on radar',
  'publish on radar',
  'radar account',
  'forgot',
  'reset my password',
  'create an account',
  'signed in',
  'sign out',
  'log out',
  'what is radar',
  'who is radar',
  'about radar',
  'contact radar',
  'advertise on radar',
  'book an ad',
  'ad slot',
  'submit a correction',
  'turn on notifications',
  'push notifications',
  'saved articles',
  'my library',
  'follow a writer',
  'follow an author',
];

// A question that mentions these is about the news, not about the plumbing, and
// the handbook must not answer it: "what did the editor decide about X" is a
// news question wearing an editorial word.
const NEWS_OVERRIDE = [
  'today',
  'yesterday',
  'this week',
  'breaking',
  'news about',
  'what happened',
  'who won',
  'who is',
  'headline',
  'reported',
  'reporting',
  'president',
  'government',
];

function isSiteQuestion(question = '') {
  const text = String(question).toLowerCase();
  if (!text.trim()) return false;
  if (NEWS_OVERRIDE.some((phrase) => text.includes(phrase))) return false;
  if (SITE_STANDALONE.some((phrase) => text.includes(phrase))) return true;
  return (
    SITE_MACHINERY.some((phrase) => text.includes(phrase)) &&
    ASK_FOR_INSTRUCTIONS.some((phrase) => text.includes(phrase))
  );
}

module.exports = { GUIDE, isSiteQuestion };
