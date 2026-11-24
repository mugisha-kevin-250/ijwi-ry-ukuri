import type { PermissionName, Role, User } from '../types'

/**
 * Reading the permission list the server sent, and nothing else.
 *
 * The API owns the matrix (`backend/src/config/permissions.js`) and answers
 * every request for itself, whatever this file thinks. What is here exists only
 * so a staff member is not shown a desk that will refuse them: a link to a page
 * that says "Forbidden" is not a permission, it is a dead end. So the rule this
 * module keeps to is that it never re-derives a permission from a role name.
 * Duplicating the matrix here would mean two answers, and the day somebody adds
 * a job to one of them the other quietly starts lying about who can do what.
 *
 * The corollary is how `undefined` is treated. An account whose permissions were
 * never fetched is not an account with no permissions - it is an account this
 * browser has not asked about yet. `can()` answers "no" to be safe, and
 * `permissionsKnown()` is what a gate checks before it decides to wait for the
 * server rather than bounce the reader away from work they are doing.
 */

/** The one question a screen asks: does this account hold this job? */
export function can(user: User | null | undefined, permission: PermissionName): boolean {
  return Array.isArray(user?.permissions) && user.permissions.includes(permission)
}

/** Several jobs, any of which is enough - how a desk that two roles share opens. */
export function canAny(user: User | null | undefined, ...permissions: PermissionName[]): boolean {
  return permissions.some((permission) => can(user, permission))
}

/** False only for a session stored before the API began sending the list. */
export function permissionsKnown(user: User | null | undefined): boolean {
  return Array.isArray(user?.permissions)
}

/**
 * Every role the newsroom can grant, in the order an admin reads the list: the
 * two a reader can arrive at, then the editorial desk, then the desks that hold
 * one job each, then the account that holds all of them.
 *
 * The words beside each role are what it means in this building, not a restated
 * permission list - if the two ever disagree, the server's answer wins and this
 * note is the line that has to be edited.
 */
export const ROLE_OPTIONS: { value: Role; label: string; note: string }[] = [
  { value: 'READER', label: 'Reader', note: 'Reads, comments and follows. Cannot open any desk.' },
  { value: 'WRITER', label: 'Writer', note: 'Files stories of their own, approved by the newsroom.' },
  { value: 'EDITOR', label: 'Editor', note: 'The whole editorial desk, plus settings and payouts.' },
  { value: 'MANAGING_EDITOR', label: 'Managing editor', note: 'The editorial desk, the AI writer and going on air.' },
  { value: 'NEWS_EDITOR', label: 'News editor', note: 'The editorial desk: queue, review, corrections, comments, alerts.' },
  { value: 'SEO_EDITOR', label: 'SEO editor', note: 'Search settings and the section tree. Writes nothing.' },
  { value: 'SOCIAL_MANAGER', label: 'Social manager', note: 'Comments, the newsroom inbox and push alerts.' },
  { value: 'AD_MANAGER', label: 'Ad manager', note: 'The advertising spaces and their creatives. Nothing else.' },
  { value: 'ADMIN', label: 'Administrator', note: 'Everything, including changing other peoples roles.' },
]

const ROLE_LABELS = new Map<string, string>(ROLE_OPTIONS.map((option) => [option.value, option.label]))

/** A role as a human reads it, falling back to the raw value for anything the
 *  site has never been given - a role added on the server before it appears in
 *  this list must show its real name, not a guessed one. */
export function roleLabel(role?: string): string {
  if (!role) return 'Reader'
  return ROLE_LABELS.get(role) ?? role
}

/**
 * The colour a role is shown in, so the people list and one person's page never
 * disagree about what the same job looks like.
 *
 * Grouped by what a role answers for, not by its name: the owner in red, the
 * people who decide what readers see in violet, the people who write in blue,
 * the desks that hold one job each in teal, and a reader in grey. A role the
 * site has never been given falls back to grey rather than to another family's
 * colour - it is unfamiliar, and it should read that way.
 */
export function roleBadge(role?: string): string {
  switch (role) {
    case 'ADMIN': return 'bg-red-50 text-red-700'
    case 'EDITOR':
    case 'MANAGING_EDITOR':
    case 'NEWS_EDITOR': return 'bg-violet-50 text-violet-700'
    case 'WRITER': return 'bg-blue-50 text-blue-700'
    case 'SEO_EDITOR':
    case 'SOCIAL_MANAGER':
    case 'AD_MANAGER': return 'bg-teal-50 text-teal-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

/**
 * Where an account is sent when it is not allowed where it asked to go, or when
 * it signs in at the admin door and has no page to stand on yet.
 *
 * The order is the walk through the building: the newsroom numbers first, then
 * the desks that own something, then the review desk, then a writer's own shelf,
 * then the reader's home. Every staff role therefore lands on a screen it can
 * actually use, and a READER lands on the news.
 */
const HOME_IN_ORDER: { permission: PermissionName; href: string }[] = [
  { permission: 'viewNewsroomDesk', href: '/mugishaimekevin/dashboard' },
  { permission: 'runAiWriter', href: '/mugishaimekevin/ai-writer' },
  { permission: 'managePayouts', href: '/mugishaimekevin/payouts' },
  { permission: 'moderateMessages', href: '/mugishaimekevin/messages' },
  { permission: 'managePlatform', href: '/mugishaimekevin/mail' },
  { permission: 'manageCategories', href: '/mugishaimekevin/categories' },
  { permission: 'manageAds', href: '/mugishaimekevin/advertising' },
  { permission: 'manageMusic', href: '/mugishaimekevin/music' },
  { permission: 'manageSettings', href: '/mugishaimekevin/settings' },
  { permission: 'review', href: '/editor/dashboard' },
  { permission: 'moderateComments', href: '/editor/comments' },
  { permission: 'writeStories', href: '/writer/dashboard' },
]

export function deskHomeFor(user: User | null | undefined): string {
  const open = HOME_IN_ORDER.find((desk) => can(user, desk.permission))
  return open ? open.href : '/'
}

/** True for any account the API would let through the staff door at
 *  `/api/auth/admin-login`. Kept as a role question on purpose: that door asks
 *  "is this a member of staff", which is a different thing from holding a job.
 *  It is not used to decide access to a desk - only whether a signed-in account
 *  belongs at a sign-in screen at all. */
export const STAFF_ROLES: Role[] = ROLE_OPTIONS
  .filter((option) => option.value !== 'READER' && option.value !== 'WRITER')
  .map((option) => option.value)

export function isStaff(user: User | null | undefined): boolean {
  return !!user && STAFF_ROLES.includes(user.role)
}
