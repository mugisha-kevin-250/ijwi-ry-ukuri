import { io, type Socket } from 'socket.io-client'
import { API_ORIGIN } from '../services/apiClient'

// The live broadcast is peer-to-peer video: only offers, answers, ICE candidates
// and chat travel through the server, so a page mount owns one socket and tears
// it down again. Keeping it per-mount also means the auth token a viewer signed
// in with is never reused by the next broadcast page.
export function connectLiveSocket(token?: string | null): Socket {
  return io(API_ORIGIN || '/', {
    path: '/socket.io',
    auth: { token: token || null },
    transports: ['websocket', 'polling'],
  })
}

// Google's public STUN box only tells peers about their own address; it cannot
// forward media. A viewer on a mobile network (or behind a symmetric NAT) has no
// address in common with the broadcaster, so without a relay the call never
// connects - which is exactly what "connecting to live video" forever means.
//
// The free public relays have all been shut down, so the relay has to be your
// own: set VITE_TURN_URLS, VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL in
// `frontend/.env.production` and rebuild (Metered, mangleward, OpenVoX or your
// own coturn all work). Until then live only reaches readers on Wi-Fi networks
// that are not behind carrier-grade NAT, and `relayConfigured` says so.
const TURN_URLS = ((import.meta.env.VITE_TURN_URLS as string | undefined) ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

export const relayConfigured = TURN_URLS.length > 0

const relay = relayConfigured
  ? [{
      urls: TURN_URLS,
      username: (import.meta.env.VITE_TURN_USERNAME as string | undefined) ?? '',
      credential: (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) ?? '',
    }]
  : []

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ...relay,
  ],
  // Gathering the relay candidate up front is what shaves seconds off the join.
  iceCandidatePoolSize: relayConfigured ? 4 : 0,
}
