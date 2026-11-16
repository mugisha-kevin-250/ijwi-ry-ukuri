const mongoose = require('mongoose');

/**
 * One city's weather, as WeatherAPI printed it the last time somebody asked.
 *
 * This document exists so that a crowd reads the sky once. WeatherAPI counts
 * calls against a monthly quota per key, so if every reader of the weather page
 * hit it from their own browser the newsroom would be out of quota by Friday and
 * a stranger's address would be the thing that got limited. Instead one request
 * per city per few minutes is made here, and everyone else is answered from
 * these rows.
 *
 * Every number is copied out of the source. Nothing is computed, smoothed or
 * filled in: a day the feed gives no rain chance for is printed without one, and
 * a city the feed does not know is an error the page states, not a temperature
 * invented to keep it company.
 */
const conditionSchema = new mongoose.Schema({
  text: String,
  // WeatherAPI's own numeric code, kept so the page can pick its own symbol
  // instead of trusting the spelling of an English sentence.
  code: Number,
}, { _id: false });

const hourSchema = new mongoose.Schema({
  // The source's own label, "2026-11-16 14:00", in the city's timezone.
  time: String,
  timeEpoch: Number,
  tempC: Number,
  tempF: Number,
  feelsC: Number,
  feelsF: Number,
  isDay: Number,
  condition: conditionSchema,
  chanceOfRain: Number,
  precipMm: Number,
  windKph: Number,
  windDir: String,
  humidity: Number,
  visKm: Number,
  uv: Number,
}, { _id: false });

const daySchema = new mongoose.Schema({
  // The calendar date the source filed this under, in the city's own timezone.
  date: String,
  dateEpoch: Number,
  maxTempC: Number,
  maxTempF: Number,
  minTempC: Number,
  minTempF: Number,
  condition: conditionSchema,
  chanceOfRain: Number,
  willItRain: Number,
  totalPrecipMm: Number,
  maxWindKph: Number,
  avgHumidity: Number,
  uv: Number,
  sunrise: String,
  sunset: String,
  moonrise: String,
  moonset: String,
  moonPhase: String,
  moonIllumination: Number,
  hours: [hourSchema],
}, { _id: false });

const currentSchema = new mongoose.Schema({
  // When the source last measured the place, in the city's timezone, as printed.
  lastUpdated: String,
  lastUpdatedEpoch: Number,
  tempC: Number,
  tempF: Number,
  feelsC: Number,
  feelsF: Number,
  isDay: Number,
  condition: conditionSchema,
  humidity: Number,
  windKph: Number,
  windDir: String,
  pressureMb: Number,
  precipMm: Number,
  visKm: Number,
  uv: Number,
  cloud: Number,
  dewpointC: Number,
  chanceOfRain: Number,
}, { _id: false });

const reportSchema = new mongoose.Schema({
  // The key this city was asked under, lowercased and trimmed: "kigali",
  // "mombasa, kenya". Two spellings of one place must not cost two upstream
  // calls, and must not show a reader two different weathers for one town.
  q: { type: String, required: true, unique: true },
  // What the source understood the query to be, which is the honest answer to
  // "did I get the Kigali I meant".
  location: {
    name: String,
    region: String,
    country: String,
    lat: Number,
    lon: Number,
    tzId: String,
    localtime: String,
    localtimeEpoch: Number,
  },
  current: currentSchema,
  days: [daySchema],
  fetchedAt: Date,
  // Bumped whenever a reader actually looks at this city, so a service that
  // wants to keep tomorrow warm can see what is being read without counting
  // anybody's traffic.
  watchedAt: Date,
  // The failure of the last attempt to refresh, when a fetch did not answer. The
  // page keeps showing the rows that really were measured and says how old they
  // are; it does not pretend the sky is quiet because a request timed out.
  lastError: String,
}, { timestamps: true });

reportSchema.index({ watchedAt: -1 });

module.exports = mongoose.model('WeatherReport', reportSchema);
