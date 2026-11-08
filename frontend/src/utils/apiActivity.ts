// Every API call gets a monotonic id so the route loader can tell apart work
// this navigation started and a background poll that was already in flight when
// the link was clicked - only the first one may keep the bar moving.
let nextId = 1
const active = new Set<number>()

export function beginRequest(): number {
  const id = nextId
  nextId += 1
  active.add(id)
  return id
}

export function endRequest(id: number | undefined): void {
  if (id !== undefined) active.delete(id)
}

export function currentRequestId(): number {
  return nextId
}

export function pendingSince(base: number): number {
  let count = 0
  for (const id of active) {
    if (id >= base) count += 1
  }
  return count
}
