import type { Socket } from 'socket.io-client'
import { ICE_SERVERS } from './liveSocket'

type Signal = { from?: string; data?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }

function closeAll(pcs: Map<string, RTCPeerConnection>) {
  pcs.forEach((pc) => {
    pc.onicecandidate = null
    pc.ontrack = null
    pc.onconnectionstatechange = null
    pc.close()
  })
  pcs.clear()
}

/**
 * The broadcaster keeps one peer connection per viewer, because a single upload
 * can only be negotiated once. Returns a stop() that leaves every call closed so
 * a second broadcast from the same tab starts clean.
 */
export function startBroadcaster(
  socket: Socket,
  stream: MediaStream,
  initialPeers: string[] = [],
): () => void {
  const pcs = new Map<string, RTCPeerConnection>()
  // A viewer's ICE candidates can overtake its answer, and WebRTC rejects them
  // until the remote description is in place.
  const waiting = new Map<string, RTCIceCandidateInit[]>()

  const onViewerJoined = async ({ peerId }: { peerId: string }) => {
    if (pcs.has(peerId)) return
    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcs.set(peerId, pc)
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('live:signal', { to: peerId, data: { candidate: event.candidate } })
    }
    // restartIce() below only does something if an offerer answers the renegotiation
    // it asks for; without this the viewer would stay on a dead call forever.
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('live:signal', { to: peerId, data: { sdp: pc.localDescription } })
      } catch {
        // The connectionstatechange handler already drops dead calls.
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce()
      if (pc.connectionState === 'closed') pcs.delete(peerId)
    }

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('live:signal', { to: peerId, data: { sdp: pc.localDescription } })
    } catch {
      pcs.delete(peerId)
      pc.close()
    }
  }

  const onSignal = async ({ from, data }: Signal) => {
    if (!from || !data) return
    const pc = pcs.get(from)
    if (!pc) return

    if (data.sdp) {
      try {
        await pc.setRemoteDescription(data.sdp)
        const queued = waiting.get(from) || []
        waiting.delete(from)
        for (const candidate of queued) await pc.addIceCandidate(candidate)
      } catch {
        // A stale answer from a viewer that already left is not worth retrying.
      }
      return
    }
    if (data.candidate) {
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(data.candidate) } catch { /* ignore */ }
      } else {
        waiting.set(from, [...(waiting.get(from) || []), data.candidate])
      }
    }
  }

  const onViewerLeft = ({ peerId }: { peerId: string }) => {
    const pc = pcs.get(peerId)
    if (!pc) return
    pcs.delete(peerId)
    pc.close()
  }

  socket.on('live:viewer-joined', onViewerJoined)
  socket.on('live:signal', onSignal)
  socket.on('live:viewer-left', onViewerLeft)

  // Viewers already in the room when the camera finally opens get an offer now.
  initialPeers.forEach((peerId) => { void onViewerJoined({ peerId }) })

  return () => {
    socket.off('live:viewer-joined', onViewerJoined)
    socket.off('live:signal', onSignal)
    socket.off('live:viewer-left', onViewerLeft)
    closeAll(pcs)
    waiting.clear()
  }
}

/**
 * A viewer talks to exactly one peer: the broadcaster's tab.
 */
export function startViewer(
  socket: Socket,
  onStream: (stream: MediaStream) => void,
  onFailed: () => void = () => {},
): () => void {
  let pc: RTCPeerConnection | null = null
  let hostId: string | null = null
  const pending: RTCIceCandidateInit[] = []

  const closePeer = () => {
    if (!pc) return
    pc.onicecandidate = null
    pc.ontrack = null
    pc.onconnectionstatechange = null
    pc.close()
    pc = null
  }

  const onSignal = async ({ from, data }: Signal) => {
    if (!from || !data) return

    if (data.sdp && data.sdp.type === 'offer') {
      hostId = from
      // A reconnect gives the broadcaster a new socket id and a fresh offer. The
      // call to the old id can never recover, so it has to be dropped here.
      closePeer()
      pc = new RTCPeerConnection(ICE_SERVERS)
      pc.onicecandidate = (event) => {
        if (event.candidate && hostId) socket.emit('live:signal', { to: hostId, data: { candidate: event.candidate } })
      }
      // A track that arrives without its stream still has to be shown, otherwise
      // the viewer is left staring at an empty black player.
      pc.ontrack = (event) => onStream(event.streams[0] || new MediaStream([event.track]))
      pc.onconnectionstatechange = () => {
        if (!pc || pc.connectionState !== 'failed') return
        closePeer()
        // The broadcaster only sends an offer when a viewer joins, so a dead call
        // can only come back by asking for it again.
        onFailed()
      }
      try {
        await pc.setRemoteDescription(data.sdp)
        for (const candidate of pending.splice(0)) await pc.addIceCandidate(candidate)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('live:signal', { to: hostId, data: { sdp: pc.localDescription } })
      } catch {
        closePeer()
      }
      return
    }

    if (data.candidate) {
      if (pc?.remoteDescription) {
        try { await pc.addIceCandidate(data.candidate) } catch { /* ignore */ }
      } else {
        pending.push(data.candidate)
      }
    }
  }

  socket.on('live:signal', onSignal)

  return () => {
    socket.off('live:signal', onSignal)
    pending.length = 0
    closePeer()
  }
}

export async function openCamera(constraints: MediaStreamConstraints = { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true }): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot open a camera.')
  }
  return navigator.mediaDevices.getUserMedia(constraints)
}

export function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}
