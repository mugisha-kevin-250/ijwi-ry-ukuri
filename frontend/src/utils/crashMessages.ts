import { isOffline } from './connection'

/**
 * Whether a route that refused to load did so because the wire is down.
 *
 * Every page here is a lazy chunk, so a reader with no connection who clicks a
 * story does not get an empty article - they get the browser refusing to
 * download the file that holds the article. React reports that as a TypeError
 * out of `import()`, and the message differs per engine. All of them mean the
 * same thing to the reader, and all of them are worth saying plainly instead of
 * showing the raw string.
 */
export function errorLooksOffline(error: unknown): boolean {
  if (isOffline()) return true
  const text = errorText(error)
  return /failed to fetch|error loading dynamically|importing a module script|networkerror|network request failed|load failed|err_(?:internet|connection|incomplete|name_not_resolved|offline|timed_out)/i.test(
    text,
  )
}

/** The shortest honest line we can get out of whatever was thrown. */
export function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return `${error.name} ${error.message}`
  try {
    return JSON.stringify(error) || ''
  } catch {
    return String(error)
  }
}
