import { apiClient } from '../services/apiClient'
import { getServiceWorkerRegistration } from './serviceWorker'

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

// The key is also served by the API so a rotated VAPID pair does not require a
// new frontend build.
async function resolveVapidKey(): Promise<string> {
  if (VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY
  try {
    const response = await apiClient.get<{ publicKey: string | null }>('/push/public-key')
    return response.data.data?.publicKey ?? ''
  } catch {
    return ''
  }
}

export type PushState = 'unsupported' | 'unavailable' | 'granted' | 'denied' | 'default'

// The device's own answer to "should an alert make a noise here". It lives on the
// server next to the subscription it describes, and in local storage only so the
// switch on the settings page can show the truth before the network answers.
const QUIET_KEY = 'radar.push.quiet'

export function quietStoredLocally(): boolean {
  try {
    return localStorage.getItem(QUIET_KEY) === '1'
  } catch {
    return false
  }
}

function rememberQuiet(quiet: boolean): void {
  try {
    localStorage.setItem(QUIET_KEY, quiet ? '1' : '0')
  } catch {
    // A private window that will not store a preference is not a reason to fail
    // the request that was actually made.
  }
}

/** The endpoint of this device's subscription, or null when it never subscribed. */
export async function pushEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null
  const registration = await getServiceWorkerRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  return subscription?.endpoint ?? null
}

async function postQuiet(endpoint: string, quiet: boolean): Promise<void> {
  await apiClient.post('/push/quiet', { endpoint, quiet })
}

/**
 * Tell this device to receive its alerts without a sound.
 *
 * The story still arrives; what is switched off is the beep and the vibration.
 * It is deliberately not an account setting - the phone on a desk at work and the
 * same phone on a bedside table want opposite things, and only one of them can be
 * configured from wherever the reader happens to be signed in.
 */
export async function setQuietAlerts(quiet: boolean): Promise<void> {
  const endpoint = await pushEndpoint()
  if (!endpoint) throw new Error('This device is not subscribed to alerts yet.')
  // The server is the record. If it refused, the switch goes back to where it was
  // rather than showing a promise nothing kept.
  await postQuiet(endpoint, quiet)
  rememberQuiet(quiet)
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

function toUint8Array(base64Key: string): Uint8Array<ArrayBuffer> {
  const padded = base64Key.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Key.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * Subscribes this device to news notifications. Call it from a user gesture;
 * both the permission prompt and the install banner are ignored otherwise.
 */
export async function enablePushNotifications(): Promise<PushSubscription> {
  if (!pushSupported()) throw new Error('This browser does not support notifications.')
  const publicKey = await resolveVapidKey()
  if (!publicKey) throw new Error('Notifications are not configured on this deployment.')

  const registration = await getServiceWorkerRegistration()
  if (!registration) throw new Error('The background service could not start.')

  // Waiting for the worker keeps the first push from being dropped on install.
  await navigator.serviceWorker.ready

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toUint8Array(publicKey),
    }))

  await apiClient.post('/push/subscribe', { subscription: subscription.toJSON(), quiet: quietStoredLocally() })
  return subscription
}

// A device that subscribed while signed out has no user attached, so it would
// miss the stories its owner follows. Re-posting the same endpoint on sign-in
// links it to the account.
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported()) return
  const registration = await getServiceWorkerRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await apiClient
    .post('/push/subscribe', { subscription: subscription.toJSON(), quiet: quietStoredLocally() })
    .catch(() => undefined)
}

export async function disablePushNotifications(): Promise<void> {
  const registration = await getServiceWorkerRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  await apiClient.post('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined)
  await subscription.unsubscribe()
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!pushSupported()) return false
  const registration = await getServiceWorkerRegistration()
  return Boolean(await registration?.pushManager.getSubscription())
}
