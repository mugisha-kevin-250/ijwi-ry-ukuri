/**
 * The weather page's only window on the sky.
 *
 * A reader on /weather talks to RADAR, and RADAR talks to WeatherAPI. That
 * inversion is the whole design: the key stays on this server, the monthly quota
 * is spent once per city per few minutes instead of once per page view, and the
 * numbers a reader sees are the ones this server already has in its own database,
 * which is why the page paints instantly even when the upstream is slow.
 *
 * Four rules hold this file together:
 * - The key is read from the environment and never leaves the process. Without it
 *   the page says plainly that the newsroom has not connected a weather source
 *   yet; it does not show a temperature it did not fetch.
 * - What is stored is what the source printed. `condition.text`, the degree, the
 *   rain chance and the sun times are copied out of the response, not derived.
 *   A field the feed omitted stays absent rather than being guessed at.
 * - A cache miss does not make a reader wait for the world. One request per city
 *   is allowed at a time, the rest are answered from the last real report and
 *   told how old it is.
 * - When the upstream cannot be reached the page keeps the rows that were really
 *   measured, marks them stale and carries the reason.
 */
const env = require('../config/env');
const WeatherReport = require('../models/WeatherReport');

const numberFrom = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const BASE = String(env.WEATHER_BASE_URL || 'https://api.weatherapi.com').replace(/\/+$/, '');
const TIMEOUT_MS = Math.max(3000, numberFrom(env.WEATHER_TIMEOUT_MS, 10000));
const REFRESH_SECONDS = Math.max(60, numberFrom(env.WEATHER_REFRESH_SECONDS, 600));
const FRESH_MS = REFRESH_SECONDS * 1000;
// The free plan answers three days, and three days is what the page shows. Asking
// for more costs the same call and returns an error on this key, so the number is
// not a preference.
const FORECAST_DAYS = 3;
// A city typed into a search box is not a query to run through an API: anything
// longer than this is a paste, and a paste is not somebody's weather.
const MAX_QUERY_LENGTH = 60;
const DEFAULT_CITY = String(env.WEATHER_DEFAULT_CITY || 'Kigali').trim() || 'Kigali';

const isConfigured = () => Boolean(String(env.WEATHERAPI_KEY || '').trim());

/**
 * The spelling a city is filed under.
 *
 * Trimmed, collapsed and lowercased, so "Kigali", "kigali " and "KIGALI" are one
 * row and one upstream call rather than three weathers for one town. The source
 * answer, not this string, is what the page prints as the city's name.
 */
function normalizeQuery(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return { ok: true, q: DEFAULT_CITY.toLowerCase(), defaulted: true };
  if (text.length > MAX_QUERY_LENGTH) return { ok: false, reason: 'QUERY_TOO_LONG' };
  // A bare pair of coordinates is a legitimate thing to ask about and the one
  // form where capitalisation and commas mean nothing.
  return { ok: true, q: text.toLowerCase(), defaulted: false };
}

const round = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : undefined);
const condition = (value) => (value ? { text: value.text, code: value.code } : undefined);

const mapHour = (hour) => ({
  time: hour.time,
  timeEpoch: hour.time_epoch,
  tempC: round(hour.temp_c),
  tempF: round(hour.temp_f),
  feelsC: round(hour.feelslike_c),
  feelsF: round(hour.feelslike_f),
  isDay: hour.is_day,
  condition: condition(hour.condition),
  chanceOfRain: hour.chance_of_rain,
  precipMm: hour.precip_mm,
  windKph: hour.wind_kph,
  windDir: hour.wind_dir,
  humidity: hour.humidity,
  visKm: hour.vis_km,
  uv: round(hour.uv),
});

const mapDay = (day) => ({
  date: day.date,
  dateEpoch: day.date_epoch,
  maxTempC: round(day.day?.maxtemp_c),
  maxTempF: round(day.day?.maxtemp_f),
  minTempC: round(day.day?.mintemp_c),
  minTempF: round(day.day?.mintemp_f),
  condition: condition(day.day?.condition),
  chanceOfRain: day.day?.daily_chance_of_rain,
  willItRain: day.day?.daily_will_it_rain,
  totalPrecipMm: day.day?.totalprecip_mm,
  maxWindKph: day.day?.maxwind_kph,
  avgHumidity: day.day?.avghumidity,
  uv: round(day.day?.uv),
  sunrise: day.astro?.sunrise,
  sunset: day.astro?.sunset,
  moonrise: day.astro?.moonrise,
  moonset: day.astro?.moonset,
  moonPhase: day.astro?.moon_phase,
  moonIllumination: Number.isFinite(Number(day.astro?.moon_illumination))
    ? Number(day.astro?.moon_illumination)
    : undefined,
  hours: (day.hour || []).map(mapHour),
});

/** The part of WeatherAPI's answer this newsroom is willing to print. */
function toReport(json, q) {
  const location = json.location || {};
  const current = json.current || {};
  return {
    q,
    location: {
      name: location.name,
      region: location.region,
      country: location.country,
      lat: location.lat,
      lon: location.lon,
      tzId: location.tz_id,
      localtime: location.localtime,
      localtimeEpoch: location.localtime_epoch,
    },
    current: {
      lastUpdated: current.last_updated,
      lastUpdatedEpoch: current.last_updated_epoch,
      tempC: round(current.temp_c),
      tempF: round(current.temp_f),
      feelsC: round(current.feelslike_c),
      feelsF: round(current.feelslike_f),
      isDay: current.is_day,
      condition: condition(current.condition),
      humidity: current.humidity,
      windKph: current.wind_kph,
      windDir: current.wind_dir,
      pressureMb: current.pressure_mb,
      precipMm: current.precip_mm,
      visKm: current.vis_km,
      uv: round(current.uv),
      cloud: current.cloud,
      dewpointC: round(current.dewpoint_c),
      chanceOfRain: current.chance_of_rain,
    },
    days: (json.forecast?.forecastday || []).map(mapDay),
    fetchedAt: new Date(),
  };
}

/**
 * One conversation with the weather source.
 *
 * The key is attached here and nowhere else, and the answer is checked the way
 * the source expects: a 200 with an `error` object is still a failure, and the
 * code is what tells us whether to blame the network or the city the reader typed.
 */
async function fetchReport(q) {
  const url = `${BASE}/v1/forecast.json?key=${encodeURIComponent(env.WEATHERAPI_KEY)}&q=${encodeURIComponent(q)}&days=${FORECAST_DAYS}&aqi=no&alerts=no`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('TIMEOUT'), { reason: 'TIMEOUT' });
    throw Object.assign(new Error('WEATHER_UNREACHABLE'), { reason: 'UNREACHABLE' });
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok || json?.error) {
    const code = json?.error?.code;
    // 1006 is "no matching location". That is the reader's typo, not our outage,
    // and the page has to be able to tell them which.
    if (code === 1006 || code === 1003) throw Object.assign(new Error('CITY_NOT_FOUND'), { reason: 'CITY_NOT_FOUND' });
    // 2006/2007/2008 are about the key: disabled, wrong, or out of quota. Only
    // the owner can fix those, so the reason is kept for the status endpoint.
    const reason = code === 2008 || code === 403 ? 'QUOTA' : 'UPSTREAM';
    throw Object.assign(new Error(`WEATHER_${reason}_${code ?? response.status}`), { reason });
  }
  return toReport(json, q);
}

// One upstream call per city at a time, however many readers arrive together.
// Without this, a burst of thirty people opening the page from a link is thirty
// calls for the same ten minutes of weather.
const inflight = new Map();

function refresh(q) {
  const existing = inflight.get(q);
  if (existing) return existing;
  const work = (async () => {
    try {
      const report = await fetchReport(q);
      await WeatherReport.updateOne(
        { q },
        { $set: { ...report, lastError: null, watchedAt: new Date() } },
        { upsert: true },
      );
      return report;
    } finally {
      inflight.delete(q);
    }
  })();
  inflight.set(q, work);
  return work;
}

const isFresh = (doc, now) => Boolean(doc?.fetchedAt) && now - new Date(doc.fetchedAt).getTime() < FRESH_MS;

/** What the page is allowed to show from a stored row. */
const fromDocument = (doc) => ({
  q: doc.q,
  location: doc.location,
  current: doc.current,
  days: doc.days,
  fetchedAt: doc.fetchedAt,
  lastError: doc.lastError || null,
});

/**
 * The weather for one city, from our database wherever our database can answer.
 *
 * A fresh row is returned untouched, so the page costs nothing upstream on a
 * re-read. A cold city is fetched once while the people behind that first reader
 * are served whatever was last measured - which on a first ever visit is nothing,
 * and `loading: true` tells the page to say so instead of painting a zero.
 */
async function report({ q, now = Date.now() } = {}) {
  const parsed = normalizeQuery(q);
  if (!parsed.ok) {
    return { ok: false, configured: isConfigured(), reason: parsed.reason };
  }
  const key = parsed.q;

  if (!isConfigured()) {
    const stored = await WeatherReport.findOne({ q: key }).lean().catch(() => null);
    return {
      ok: false,
      configured: false,
      reason: 'NOT_CONFIGURED',
      city: key,
      // Whatever the newsroom measured before the key was taken away is still the
      // truth about an hour ago, so it is kept on the page rather than discarded.
      report: stored ? fromDocument(stored) : null,
    };
  }

  const stored = await WeatherReport.findOne({ q: key }).lean().catch(() => null);
  if (stored && isFresh(stored, now)) {
    await WeatherReport.updateOne({ _id: stored._id }, { $set: { watchedAt: new Date(now) } }).catch(() => {});
    return { ok: true, configured: true, city: key, stale: false, report: fromDocument(stored) };
  }

  let fresh = null;
  try {
    // Nobody else is asking for this city, so this reader is the one who pays for
    // the look-up - for a bounded moment, and then the page is served either way.
    const budget = Math.min(TIMEOUT_MS, 6000);
    fresh = await Promise.race([
      refresh(key),
      new Promise((resolve) => setTimeout(() => resolve(null), budget)),
    ]);
  } catch (error) {
    if (error?.reason === 'CITY_NOT_FOUND') {
      return { ok: false, configured: true, reason: 'CITY_NOT_FOUND', city: key, report: stored ? fromDocument(stored) : null };
    }
    await WeatherReport.updateOne({ q: key }, { $set: { lastError: String(error?.message || error) } }, { upsert: true }).catch(() => {});
    return {
      ok: false,
      configured: true,
      reason: error?.reason || 'UPSTREAM',
      city: key,
      report: stored ? fromDocument(stored) : null,
      stale: Boolean(stored),
    };
  }

  if (fresh) {
    return { ok: true, configured: true, city: key, stale: false, report: fromDocument(fresh) };
  }

  // The fetch is still running on its own clock and will land in the database.
  return {
    ok: Boolean(stored),
    configured: true,
    city: key,
    reason: stored ? undefined : 'LOADING',
    loading: !stored,
    stale: Boolean(stored),
    report: stored ? fromDocument(stored) : null,
  };
}


/**
 * Whether the desk is connected, for the page's own honesty and for the owner.
 *
 * A reader who arrives before `WEATHERAPI_KEY` is in the environment is told that
 * plainly. An `enabled: true` that fetched nothing would be a lie about a sky
 * nobody looked at.
 */
async function status({ now = Date.now() } = {}) {
  const latest = await WeatherReport.findOne().sort({ fetchedAt: -1 }).lean().catch(() => null);
  return {
    configured: isConfigured(),
    source: 'WeatherAPI.com',
    defaultCity: DEFAULT_CITY,
    forecastDays: FORECAST_DAYS,
    refreshSeconds: REFRESH_SECONDS,
    storedCities: latest ? await WeatherReport.estimatedDocumentCount().catch(() => 0) : 0,
    lastFetchAt: latest?.fetchedAt || null,
    lastError: latest?.lastError || null,
    now,
  };
}

module.exports = {
  DEFAULT_CITY,
  FORECAST_DAYS,
  REFRESH_SECONDS,
  isConfigured,
  normalizeQuery,
  toReport,
  report,
  status,
};
