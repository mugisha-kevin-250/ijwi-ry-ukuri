const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Live = require('../models/Live');
const LiveComment = require('../models/LiveComment');
const env = require('../config/env');

const ROOM = (liveId) => `live:${liveId}`;

function socketUser(socket) {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return null;
    const decoded = jwt.verify(token, env.JWT_SECRET);
    return { id: String(decoded.id) };
  } catch {
    return null;
  }
}

// Routes run in the same process as the socket server, so they can tell viewers
// a broadcast stopped without reaching back into server.js.
let controller = { endLive() {} };

module.exports = function attachLiveSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_URL.split(',').map((item) => item.trim()).filter(Boolean),
      methods: ['GET', 'POST']
    }
  });

  // Which socket is holding the camera, per broadcast.
  const hosts = new Map();

  // The room is the audience count; the database copy only exists so the number
  // survives a page refresh and shows up on the watch page for everyone.
  async function refreshStats(liveId) {
    const room = io.sockets.adapter.rooms.get(ROOM(liveId));
    const hostSocketId = hosts.get(String(liveId));
    // The broadcaster's own tab is in the room to relay video, not to watch it.
    const viewers = room ? room.size - (hostSocketId && room.has(hostSocketId) ? 1 : 0) : 0;
    const live = await Live.findOneAndUpdate(
      { _id: liveId },
      { $set: { viewers }, $max: { peakViewers: viewers } },
      { new: true }
    );
    if (!live) return null;
    io.to(ROOM(liveId)).emit('live:stats', {
      viewers,
      views: live.views,
      peakViewers: live.peakViewers,
      status: live.status
    });
    return live;
  }

  io.on('connection', (socket) => {
    const user = socketUser(socket);
    let liveId = null;

    socket.on('live:watch', async (payload, ack) => {
      try {
        const live = await Live.findOne({ _id: String(payload && payload.liveId), status: 'active' });
        if (!live) return ack && ack({ error: 'no-live' });

        if (liveId) socket.leave(ROOM(liveId));
        liveId = String(live._id);
        socket.join(ROOM(liveId));

        await Live.updateOne({ _id: liveId }, { $inc: { views: 1 } });
        const history = await LiveComment.find({ live: liveId }).sort({ createdAt: -1 }).limit(50).lean();

        const isHost = hosts.get(liveId) === socket.id;
        if (!isHost && hosts.has(liveId)) {
          socket.to(hosts.get(liveId)).emit('live:viewer-joined', { peerId: socket.id });
        }
        await refreshStats(liveId);
        ack && ack({
          ok: true,
          isHost,
          hostSocketId: hosts.get(liveId) || null,
          comments: history.reverse(),
        });
      } catch (error) {
        ack && ack({ error: 'watch-failed' });
      }
    });

    // The broadcaster announces itself so viewers can be pointed at its camera.
    socket.on('live:host', async (payload, ack) => {
      try {
        const live = await Live.findOne({ _id: String(payload && payload.liveId), status: 'active' });
        if (!live) return ack && ack({ error: 'no-live' });
        if (!user || String(live.host) !== user.id) return ack && ack({ error: 'not-host' });

        if (liveId) socket.leave(ROOM(liveId));
        liveId = String(live._id);
        socket.join(ROOM(liveId));
        hosts.set(liveId, socket.id);
        // Viewers that joined a moment before the camera came up still need the
        // broadcaster's socket id to send their answers to.
        socket.to(ROOM(liveId)).emit('live:host-joined', { peerId: socket.id });
        // ...and the broadcaster needs the viewers that are already waiting, or no
        // offer is ever sent to them.
        const waiting = io.sockets.adapter.rooms.get(ROOM(liveId));
        const peerIds = waiting ? Array.from(waiting).filter((id) => id !== socket.id) : [];
        await refreshStats(liveId);
        ack && ack({ ok: true, peerIds });
      } catch (error) {
        ack && ack({ error: 'host-failed' });
      }
    });

    // WebRTC offers, answers and ICE candidates pass through untouched; the media
    // itself goes straight between the broadcaster and each viewer.
    socket.on('live:signal', (payload) => {
      const target = payload && payload.to;
      if (!target || !io.sockets.sockets.has(target)) return;
      io.to(target).emit('live:signal', { from: socket.id, data: payload.data });
    });

    socket.on('live:chat', async (payload, ack) => {
      const text = String((payload && payload.text) || '').trim();
      if (!liveId || !text || !user) return ack && ack({ error: 'not-allowed' });
      try {
        const saved = await LiveComment.create({ live: liveId, user: user.id, name: payload.name || 'Mushyitsi', text: text.slice(0, 300) });
        io.to(ROOM(liveId)).emit('live:chat', saved);
        ack && ack({ ok: true });
      } catch (error) {
        ack && ack({ error: 'chat-failed' });
      }
    });

    socket.on('live:leave', async () => {
      if (!liveId) return;
      const leaving = liveId;
      liveId = null;
      socket.leave(ROOM(leaving));
      if (hosts.get(leaving) === socket.id) hosts.delete(leaving);
      const hostSocketId = hosts.get(leaving);
      if (hostSocketId) socket.to(hostSocketId).emit('live:viewer-left', { peerId: socket.id });
      await refreshStats(leaving);
    });

    socket.on('disconnect', async () => {
      if (!liveId) return;
      const left = liveId;
      if (hosts.get(left) === socket.id) hosts.delete(left);
      const hostSocketId = hosts.get(left);
      if (hostSocketId) io.to(hostSocketId).emit('live:viewer-left', { peerId: socket.id });
      await refreshStats(left);
    });
  });

  controller = {
    endLive(liveId) {
      const id = String(liveId);
      io.in(ROOM(id)).emit('live:ended', { liveId: id });
      io.socketsLeave(ROOM(id));
      hosts.delete(id);
    }
  };

  return controller;
}

module.exports.notifyLiveEnded = function notifyLiveEnded(liveId) {
  controller.endLive(liveId);
};
