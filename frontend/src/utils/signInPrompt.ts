type Listener = (open: boolean) => void

let open = false
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener(open)
}

export function requestSignIn() {
  open = true
  notify()
}

export function dismissSignIn() {
  if (!open) return
  open = false
  notify()
}

export function isSignInOpen() {
  return open
}

export function subscribeSignIn(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
