import type { Socket } from 'socket.io-client'
import { ICE_SERVERS } from './liveSocket'

type Signal = { from?: string; data?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }

function closeAll(pcs: Map<string, RTCPeerConnection>) {
  pcs.forEach((pc) => {
    pc.onicecandidate = null
    pc.ontrack = null
    pc.onconnectionstatechange = null
    pc.onnegotiationneeded = null
    pc.close()
  })
  pcs.clear()
}

/**
 * One offer at a time per call. Chrome fires `onnegotiationneeded` by itself as
 * soon as a track is added, so an offer sent by hand next to it produces two:
 * the viewer answers the second one while this side still expects the answer to
 * the first, `setRemoteDescription` throws, and the call never connects.
 */
function negotiator(socket: Socket, pc: RTCPeerConnection, peerId: string) {
  let running = false
  let queued = false

  const send = async () => {
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('live:signal', { to: peerId, data: { sdp: pc.localDescription } })
    } catch {
      // The connectionstatechange handler already drops calls that are beyond help.
    } finally {
      running = false
      if (queued) {
        queued = false
        void send()
      }
    }
  }

  return send
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

    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('live:signal', { to: peerId, data: { candidate: event.candidate } })
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce()
      if (pc.connectionState === 'closed') pcs.delete(peerId)
    }

    // Adding the tracks is what asks Chrome for the first offer; restartIce()
    // asks for the later ones. Both leave through the same handler.
    const negotiate = negotiator(socket, pc, peerId)
    pc.onnegotiationneeded = () => void negotiate()
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))
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
  onState: (state: RTCPeerConnectionState) => void = () => {},
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

  const buildPeer = () => {
    pc = new RTCPeerConnection(ICE_SERVERS)
    pc.onicecandidate = (event) => {
      if (event.candidate && hostId) socket.emit('live:signal', { to: hostId, data: { candidate: event.candidate } })
    }
    // A track that arrives without its stream still has to be shown, otherwise
    // the viewer is left staring at an empty black player.
    pc.ontrack = (event) => onStream(event.streams[0] || new MediaStream([event.track]))
    pc.onconnectionstatechange = () => {
      if (!pc) return
      onState(pc.connectionState)
      if (pc.connectionState !== 'failed') return
      closePeer()
      // The broadcaster only sends an offer when a viewer joins, so a dead call
      // can only come back by asking for it again.
      onFailed()
    }
    onState(pc.connectionState)
  }

  const onSignal = async ({ from, data }: Signal) => {
    if (!from || !data) return

    if (data.sdp && data.sdp.type === 'offer') {
      // A second offer from the same broadcaster is a renegotiation (an ICE
      // restart after a dead call), so it belongs on the live peer. Only a
      // different socket id means the camera moved to another tab.
      if (pc && hostId === from) {
        try {
          await pc.setRemoteDescription(data.sdp)
          for (const candidate of pending.splice(0)) await pc.addIceCandidate(candidate)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('live:signal', { to: from, data: { sdp: pc.localDescription } })
        } catch {
          closePeer()
        }
        return
      }

      hostId = from
      closePeer()
      buildPeer()
      try {
        await pc!.setRemoteDescription(data.sdp)
        for (const candidate of pending.splice(0)) await pc!.addIceCandidate(candidate)
        const answer = await pc!.createAnswer()
        await pc!.setLocalDescription(answer)
        socket.emit('live:signal', { to: hostId, data: { sdp: pc!.localDescription } })
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
