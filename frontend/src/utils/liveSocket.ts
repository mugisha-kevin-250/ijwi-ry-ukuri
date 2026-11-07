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
// forward media, so a viewer behind a symmetric-NAT mobile network may still
// fail to connect until a TURN credential is added here.
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
}
