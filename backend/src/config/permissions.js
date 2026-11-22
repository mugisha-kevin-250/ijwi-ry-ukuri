/**
 * Who is allowed to do what, in one place.
 *
 * Before this file the answer was scattered across `authorize('ADMIN', 'EDITOR')
 *` calls and the odd `['EDITOR','ADMIN'].includes(req.user.role)` inside a
 * handler. Each of those named a role, not a job, so adding a staff member who
 * does one thing - the person who only runs the ads, the person who only answers
 * comments - meant touching every route they might ever need and hoping none of
 * them had been missed.
 *
 * The rule this file follows is that a role is a bundle of named permissions and
 * nothing else. A route asks for a permission; the matrix says which roles hold
 * it. The four roles the site shipped with are mapped onto it exactly as they
 * behaved before, so no existing account can suddenly do more than it did - the
 * new staff roles are carved out of the same list, each holding a smaller set.
 *
 * `ADMIN` is the only role that can hold everything. Nothing here makes a
 * permission reachable from the public site; every route that asks for one is
 * already behind `protect`.
 */

const PERMISSIONS = {
  // The writing desk: filing a story, and the dashboards that show it.
  writeStories: 'writeStories',
  // Deciding that a story goes in front of readers, or comes back out.
  publish: 'publish',
  // The review queue: reading what is pending and moving it through.
  review: 'review',
  // Corrections, credits, captions, sponsored labels - editing a live story.
  correct: 'correct',
  moderateComments: 'moderateComments',
  // The newsroom inbox (contact form), which is not the same desk as comments.
  moderateMessages: 'moderateMessages',
  sendPushAlerts: 'sendPushAlerts',
  // Read-only reach into the newsroom numbers: dashboard, users, lists.
  viewNewsroomDesk: 'viewNewsroomDesk',
  managePayouts: 'managePayouts',
  manageSettings: 'manageSettings',
  // Changing somebody else's role or deactivating them. Deliberately the
  // scarcest permission on the list: a staff role that cannot grant ADMIN
  // cannot promote itself into owning the site.
  manageUsers: 'manageUsers',
  manageCategories: 'manageCategories',
  manageAds: 'manageAds',
  manageSeo: 'manageSeo',
  // Going on air: the TV/broadcast controls.
  manageBroadcast: 'manageBroadcast',
  runAiWriter: 'runAiWriter',
  // The machinery: mail desk, job runner, radio timetable, deleting records.
  managePlatform: 'managePlatform',
};

const ALL = Object.values(PERMISSIONS);

// The editorial desk: what a person who decides what readers see holds. This is
// what an EDITOR already could do, read off the `authorize()` calls and the
// mount-level guard in adminRoutes that this file replaces.
const NEWSROOM_DESK = [
  PERMISSIONS.writeStories,
  PERMISSIONS.publish,
  PERMISSIONS.review,
  PERMISSIONS.correct,
  PERMISSIONS.moderateComments,
  PERMISSIONS.moderateMessages,
  PERMISSIONS.sendPushAlerts,
  PERMISSIONS.viewNewsroomDesk,
];

// Money and the site's own settings stayed with the owner's staff room, but the
// account that says "Editor" today reaches both through that shared guard, so it
// keeps both. The new staff desks are cut from NEWSROOM_DESK and do not.
const MONEY_AND_SWITCHES = [PERMISSIONS.managePayouts, PERMISSIONS.manageSettings];

const ROLE_PERMISSIONS = {
  READER: [],
  WRITER: [PERMISSIONS.writeStories],
  EDITOR: [...NEWSROOM_DESK, ...MONEY_AND_SWITCHES],
  ADMIN: ALL,

  // Runs the newsroom day to day: everything editorial, the AI writer, going on
  // air. Not users, not payouts, not the machinery - those stay with the owner.
  MANAGING_EDITOR: [...NEWSROOM_DESK, PERMISSIONS.runAiWriter, PERMISSIONS.manageBroadcast],
  // Decides what readers see. Same editorial desk, without the AI writer or the
  // broadcast kit.
  NEWS_EDITOR: [...NEWSROOM_DESK],
  // The growth desk: the section tree and the search/trend pages.
  SEO_EDITOR: [PERMISSIONS.manageSeo, PERMISSIONS.manageCategories],
  // Answers readers. The only role that has to be able to reach a comment
  // without reaching a story.
  SOCIAL_MANAGER: [PERMISSIONS.moderateComments, PERMISSIONS.moderateMessages, PERMISSIONS.sendPushAlerts],
  // Buys, builds and places the advertising space and nothing else.
  AD_MANAGER: [PERMISSIONS.manageAds],
};

const STAFF_ROLES = ['EDITOR', 'MANAGING_EDITOR', 'NEWS_EDITOR', 'SEO_EDITOR', 'SOCIAL_MANAGER', 'AD_MANAGER', 'ADMIN'];

// The newsroom's own doors - the admin sign-in, the "is this a staff account"
// answer a service gives when it refuses to delete somebody who runs the site.
// A WRITER is not staff however long they have been writing, and a plain READER
// certainly is not: staff means the role holds something beyond its own desk.
const DESK_ROLES = STAFF_ROLES;

/** The list a role holds; an unknown or missing role holds nothing. */
function permissionsFor(role) {
  return ROLE_PERMISSIONS[String(role || '').toUpperCase()] || [];
}

/** Does this role hold this permission. */
function roleCan(role, permission) {
  return permissionsFor(role).includes(permission);
}

/** Same question asked of a loaded user document. */
function can(user, permission) {
  return !!user && roleCan(user.role, permission);
}

/** Every permission a role holds, as a plain array for a JSON payload. */
function permissionsOf(user) {
  return permissionsFor(user && user.role);
}

/** Is this one of the newsroom's own roles - the ones that may use a staff door. */
function isStaffRole(role) {
  return DESK_ROLES.includes(String(role || '').toUpperCase());
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  ALL,
  permissionsFor,
  roleCan,
  can,
  permissionsOf,
  isStaffRole,
};
