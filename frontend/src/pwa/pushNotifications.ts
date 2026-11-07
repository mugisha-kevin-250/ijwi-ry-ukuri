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

  await apiClient.post('/push/subscribe', { subscription: subscription.toJSON() })
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
  await apiClient.post('/push/subscribe', { subscription: subscription.toJSON() }).catch(() => undefined)
}

export async function disablePushNotifications(): Promise<void> {  const registration = await getServiceWorkerRegistration()
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
