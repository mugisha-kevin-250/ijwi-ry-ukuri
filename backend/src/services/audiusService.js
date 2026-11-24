const RadioStationTrack = require('../models/RadioStationTrack');
const env = require('../config/env');
const API_BASE = 'https://api.audius.co/v1';
const APP_NAME = 'RADAR_Newsroom';
async function request(path) {
  const headers = { Accept: 'application/json' };
  if (env.AUDIUS_API_KEY) headers['x-api-key'] = env.AUDIUS_API_KEY;
  const response = await fetch(`${API_BASE}${path}`, { headers, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Audius returned HTTP ${response.status}`);
  return response;
}
function artworkUrl(artwork) {
  if (typeof artwork === 'string') return artwork;
  if (!artwork || typeof artwork !== 'object') return '';
  return artwork['480x480'] || artwork['150x150'] || artwork['1000x1000'] || '';
}
function normalise(track) {
  if (!track || !track.id || !track.title) return null;
  return { audiusId: String(track.id), title: String(track.title).slice(0, 240),
    artist: String(track.user?.name || track.user?.handle || 'Audius artist').slice(0, 180),
    artwork: artworkUrl(track.artwork), duration: Math.max(0, Number(track.duration) || 0),
    permalink: typeof track.permalink === 'string' ? track.permalink : '' };
}
async function search(query) {
  const term = String(query || '').trim().slice(0, 120);
  if (term.length < 2) return [];
  const response = await request(`/tracks/search?query=${encodeURIComponent(term)}&limit=15&app_name=${APP_NAME}`);
  const payload = await response.json();
  return (Array.isArray(payload.data) ? payload.data : []).map(normalise).filter(Boolean);
}
async function fetchTrack(trackId) {
  const response = await request(`/tracks/${encodeURIComponent(trackId)}?app_name=${APP_NAME}`);
  const payload = await response.json();
  return normalise(payload.data);
}
async function addStationTrack(trackId, addedBy) {
  if (!/^[a-zA-Z0-9_-]{3,100}$/.test(String(trackId))) return { error: 'Invalid Audius track ID' };
  const track = await fetchTrack(trackId);
  if (!track) return { error: 'Audius did not return a public track for that ID' };
  const existing = await RadioStationTrack.findOne({ audiusId: track.audiusId });
  if (existing) { if (!existing.active) { existing.active = true; await existing.save(); } return { track: existing.toObject(), alreadyAdded: true }; }
  const sortOrder = await RadioStationTrack.countDocuments({ active: true });
  const saved = await RadioStationTrack.create({ ...track, addedBy, sortOrder, active: true });
  return { track: saved.toObject(), alreadyAdded: false };
}
async function listStationTracks() { return RadioStationTrack.find({ active: true }).sort({ sortOrder: 1, createdAt: 1 }).lean(); }
async function removeStationTrack(id) {
  return Boolean(await RadioStationTrack.findOneAndUpdate({ audiusId: String(id) }, { $set: { active: false } }, { new: true }));
}
async function openStream(trackId, { range } = {}) {
  const headers = {};
  // Audius redirects stream requests to media hosts. Do not forward our API key
  // to a redirect destination; read-only stream requests work without the key.
  if (range) headers.Range = String(range).slice(0, 100);
  // No short timeout: the response body stays open while a listener is playing.
  return fetch(`${API_BASE}/tracks/${encodeURIComponent(trackId)}/stream?app_name=${APP_NAME}`, { headers, redirect: 'follow' });
}
module.exports = { search, fetchTrack, addStationTrack, listStationTracks, removeStationTrack, openStream };
