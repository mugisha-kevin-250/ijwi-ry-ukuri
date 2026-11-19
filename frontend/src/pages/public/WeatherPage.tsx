import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Crosshair,
  Droplets,
  Gauge,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
  Wind,
} from 'lucide-react'
import { weatherAPI, type WeatherDay, type WeatherRead, type WeatherStatus } from '../../services/api'
import { serverMessage } from '../../services/apiClient'
import { holdProgress } from '../../utils/apiActivity'
import { useI18n } from '../../context/I18nContext'
import { useSeo } from '../../utils/useSeo'
import { cn } from '../../utils/cn'

/**
 * RADAR Weather.
 *
 * A page of the newsroom, so it is drawn in the newsroom's blue rather than in a
 * weather app's gradients-and-glass, and every figure on it was measured
 * somewhere. The browser asks RADAR for a city; RADAR asks the weather service
 * once every few minutes and keeps the answer. So the key that costs money never
 * reaches a phone, a crowd reading Kigali is one upstream call rather than ten
 * thousand, and the page paints from our own database even while the service is
 * having a bad minute.
 *
 * What the source did not say is not shown. A missing rain chance is an absent
 * line, not zero percent - and zero percent is a prediction nobody made.
 *
 * A reader's own sky is one tap away."My location" asks the browser where the
 * phone is, and the answer is sent to the same lookup a typed city goes through,
 * so nobody has to spell their town. The position is used for that one request:
 * it is not stored, not sent to any other desk, and not kept when the page
 * closes. Saying no to the browser's question costs nothing - the search box and
 * the city chips work exactly as before.
 *
 * Waiting is the blue bar across the top of every page, here as everywhere else
 * on RADAR. A city asked for opens that bar and holds it until the reading is on
 * the screen; this page draws no spinner of its own.
 */

/** The symbol we draw for a condition, in our own strokes. */
type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder'

// WeatherAPI's own codes. Kept as a table rather than guessed from the English
// sentence, because the sentence is translated for the reader and the code is not.
const SKY_BY_CODE: Record<number, Sky> = {
  1000: 'clear', 1002: 'clear', 1003: 'partly', 1006: 'cloudy', 1009: 'cloudy',
  1030: 'fog', 1135: 'fog', 1147: 'fog',
  1063: 'drizzle', 1150: 'drizzle', 1153: 'drizzle', 1168: 'drizzle', 1171: 'drizzle',
  1066: 'snow', 1114: 'snow', 1210: 'snow', 1216: 'snow', 1219: 'snow', 1222: 'snow',
  1225: 'snow', 1255: 'snow', 1258: 'snow', 1261: 'snow', 1264: 'snow', 1273: 'snow',
  1276: 'snow', 1279: 'snow', 1282: 'snow', 1237: 'snow', 1204: 'snow', 1207: 'snow',
  1087: 'thunder', 2000: 'thunder', 2001: 'thunder', 2002: 'thunder', 2003: 'thunder',
  2004: 'thunder', 2005: 'thunder', 2006: 'thunder', 2007: 'thunder',
  1180: 'rain', 1183: 'rain', 1186: 'rain', 1189: 'rain', 1192: 'rain', 1195: 'rain',
  1201: 'rain', 1240: 'rain', 1243: 'rain', 1246: 'rain', 1249: 'rain', 1252: 'rain',
  1260: 'rain',
}

function skyFor(code: number | null, text: string): Sky {
  if (code !== null && SKY_BY_CODE[code]) return SKY_BY_CODE[code]
  const words = String(text || '').toLowerCase()
  if (words.includes('thunder')) return 'thunder'
  if (words.includes('snow') || words.includes('sleet') || words.includes('hail') || words.includes('ice')) return 'snow'
  if (words.includes('drizzle')) return 'drizzle'
  if (words.includes('rain') || words.includes('shower')) return 'rain'
  if (words.includes('fog') || words.includes('mist') || words.includes('haze')) return 'fog'
  if (words.includes('partly')) return 'partly'
  if (words.includes('cloud') || words.includes('overcast')) return 'cloudy'
  if (words.includes('sunny') || words.includes('clear')) return 'clear'
  return 'cloudy'
}

/**
 * The sky, drawn here instead of loaded from the weather company's picture
 * server. A third-party image host is one more origin the content policy has to
 * trust, one more thing that can be down when a reader is deciding whether to
 * carry an umbrella, and a night-time temperature should not depend on somebody
 * else's CDN.
 */
function WeatherGlyph({ sky, isDay = true, className }: { sky: Sky; isDay?: boolean; className?: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  const cloud = <path d="M6.6 18.5h10.2a3.4 3.4 0 0 0 .4-6.8 4.9 4.9 0 0 0-9.3-1.3 3.9 3.9 0 0 0-1.3 8.1z" {...common} />
  const sun = (
    <g {...common}>
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 3.2v1.9M12 18.9v1.9M3.2 12h1.9M18.9 12h1.9M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4" />
    </g>
  )
  const moon = <path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.6 8.6 0 1 0 10.6 10.6z" {...common} />
  const drops = (d: string) => <path d={d} {...common} />

  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-hidden="true">
      {sky === 'clear' && (isDay ? sun : moon)}
      {sky === 'partly' && (
        <g>
          {isDay
            ? <g {...common}><circle cx="8.6" cy="8" r="3" /><path d="M8.6 2.6v1.3M3.2 8h1.3M5 4.4l.9.9M12.2 4.4l-.9.9" /></g>
            : <path d="M12.6 8.4A4.4 4.4 0 0 1 8.2 4a4.4 4.4 0 1 0 4.4 4.4z" {...common} />}
          <g transform="translate(2.6 3.4) scale(0.82)">{cloud}</g>
        </g>
      )}
      {sky === 'cloudy' && cloud}
      {sky === 'fog' && (
        <g>
          <g transform="translate(0 -2.4) scale(0.92)">{cloud}</g>
          {drops('M4.6 16.4h11M7 19.2h10')}
        </g>
      )}
      {sky === 'drizzle' && (
        <g>
          <g transform="translate(0 -2.2) scale(0.92)">{cloud}</g>
          {drops('M9 16.6v1.2M12.4 17.4v1.2M15.8 16.6v1.2')}
        </g>
      )}
      {sky === 'rain' && (
        <g>
          <g transform="translate(0 -2.6) scale(0.92)">{cloud}</g>
          {drops('M8.6 15.8l-1 3.4M12.4 15.4l-1.2 4M16.2 15.8l-1 3.4')}
        </g>
      )}
      {sky === 'snow' && (
        <g>
          <g transform="translate(0 -2.6) scale(0.92)">{cloud}</g>
          {drops('M8.8 16.2v3M7.4 17.7h3M12.6 15.6v3.6M10.8 17.4h3.6M16.2 16.2v3M14.8 17.7h3')}
        </g>
      )}
      {sky === 'thunder' && (
        <g>
          <g transform="translate(0 -2.8) scale(0.9)">{cloud}</g>
          <path d="M13.4 14.4l-3.6 4.4h2.6l-1 3.4 3.8-4.6h-2.6z" {...common} />
        </g>
      )}
    </svg>
  )
}

/**
 * The cities a reader can reach with one tap, in the order the owner set.
 *
 * `label` is what the chip says; `q` is what is sent to be looked up, and is only
 * given when the two differ. That is not decoration: the weather source files
 * these places under their own spellings, so"São Paulo" is asked for as
 *"Sao Paulo" and"New York City" as"New York". Print a name you did not
 * resolve and the page ends up quoting one town under another town's heading,
 * which is worse than a chip that admits it found nothing.
 */
const NEARBY_CITIES: { label: string; q?: string }[] = [
  { label: 'Kigali' },
  { label: 'New York City', q: 'New York' },
  { label: 'London' },
  { label: 'Tokyo' },
  { label: 'Delhi' },
  { label: 'Paris' },
  { label: 'Mumbai' },
  { label: 'Los Angeles' },
  { label: 'Chicago' },
  { label: 'Dubai' },
  { label: 'Singapore' },
  { label: 'Seoul' },
  { label: 'São Paulo', q: 'Sao Paulo' },
  { label: 'Toronto' },
  { label: 'Sydney' },
  { label: 'Istanbul' },
  { label: 'Mexico City' },
]

const CITY_STORE_KEY = 'radar.weather.city'
const UNIT_STORE_KEY = 'radar.weather.unit'

const readStored = (key: string): string => {
  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    // A browser that refuses storage still gets the newsroom's own city.
    return ''
  }
}

const store = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* Nothing on this page depends on remembering it. */
  }
}

const shown = (value: number | null): string => (value === null ? '' : String(Math.round(value)))

/**
 * The same rounding the weather desk files a coordinate answer under.
 *
 * A browser answers with six decimals and the server keeps two, because two is
 * about a kilometre - finer than one weather station's report can honestly be -
 * and a neighbourhood should cost one reading rather than a thousand. Asking in
 * the shape the answer is stored in is what makes a second tap on"My location"
 * a re-read of the sky instead of a fresh lookup.
 */
const coordinateKey = (lat: number, lon: number): string => `${lat.toFixed(2)},${lon.toFixed(2)}`

/** Whether the place on screen was found by coordinates rather than by a name. */
const isCoordinate = (value: string): boolean => /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(value)

/**"in 12 min" /"3 h ago", said plainly, because the age of a reading is the reading. */
function ageLabel(ms: number, t: (key: string) => string): string {
  const minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes < 1) return t('weather.justNow')
  if (minutes < 60) return `${minutes} ${t('weather.minutesAgo')}`
  const hours = Math.round(minutes / 60)
  return `${hours} ${hours === 1 ? t('weather.hourAgo') : t('weather.hoursAgo')}`
}

/** `2026-11-16` as a date on the reader's calendar, never shifted by a timezone. */
function dayDate(value: string): Date | null {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length !== 8) return null
  const date = new Date(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)) - 1, Number(digits.slice(6, 8)))
  return Number.isNaN(date.getTime()) ? null : date
}

/**"7:00 PM" from the source's own"2026-11-16 19:00", in the city's clock. */
function hourLabel(time: string): string {
  const hhmm = String(time || '').slice(11)
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return time
  const hour = Number(hhmm.slice(0, 2))
  const suffix = hour < 12 ? 'AM' : 'PM'
  const face = hour % 12 === 0 ? 12 : hour % 12
  return `${face}:${hhmm.slice(3)} ${suffix}`
}

export default function WeatherPage() {
  const { t, lang } = useI18n()
  const [city, setCity] = useState(() => readStored(CITY_STORE_KEY) || '')
  const [draft, setDraft] = useState('')
  const [unit, setUnit] = useState<'C' | 'F'>(() => (readStored(UNIT_STORE_KEY) === 'F' ? 'F' : 'C'))
  const [status, setStatus] = useState<WeatherStatus | null>(null)
  const [read, setRead] = useState<WeatherRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [locating, setLocating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const retryTimer = useRef<number | null>(null)
  const weatherHold = useRef<(() => void) | null>(null)

  const report = read?.report || null

  useSeo({
    // The tab says"Weather | RADAR" the way every other page does, while the
    // heading on the page itself carries the desk's own name.
    title: t('weather.taglineShort'),
    description: t('weather.metaDescription'),
    path: '/weather',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: t('weather.title'),
      description: t('weather.tagline'),
      isPartOf: { '@type': 'WebSite', name: 'RADAR' },
    },
  })

  const load = useCallback(async (wanted: string, quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setNotice(null)
    // The bar across the top of the site is the only thing on this page that
    // says"hold on", and a city asked for is exactly the waiting it is for. The
    // hold opens once per search and closes when a reading - or a plain refusal -
    // is on the screen, so the retry below does not blink the bar twice.
    if (!weatherHold.current) weatherHold.current = holdProgress()
    let willRetry = false
    try {
      const result = await weatherAPI.report(wanted)
      setRead(result)
      if (result.reason === 'CITY_NOT_FOUND') setNotice(t('weather.cityNotFound'))
      else if (result.reason === 'NOT_CONFIGURED') setNotice(t('weather.notConfigured'))
      else if (result.ok === false && result.reason) setNotice(t('weather.unreachable'))
      // The first reader for a city paid for the look-up and got nothing yet.
      // One quiet retry, because the answer is already on its way to the database.
      if (result.loading && retryTimer.current === null) {
        willRetry = true
        retryTimer.current = window.setTimeout(() => {
          retryTimer.current = null
          void load(wanted, true)
        }, 2500)
      }
    } catch (error) {
      setNotice(serverMessage(error, t('weather.unreachable')))
    } finally {
      if (!willRetry) {
        weatherHold.current?.()
        weatherHold.current = null
      }
      setLoading(false)
      setRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    void weatherAPI.status().then(setStatus).catch(() => setStatus(null))
    return () => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current)
      // Leaving the page must not leave the whole site waiting on a bar for a
      // reading this page no longer exists to print.
      weatherHold.current?.()
      weatherHold.current = null
    }
  }, [])

  useEffect(() => {
    void load(city)
    // Only when the reader picks a new city - not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city])

  const temp = useCallback(
    (celsius: number | null, fahrenheit: number | null) => {
      if (unit === 'F') return fahrenheit ?? (celsius === null ? null : Math.round((celsius * 9) / 5 + 32))
      return celsius ?? (fahrenheit === null ? null : Math.round(((fahrenheit - 32) * 5) / 9))
    },
    [unit],
  )

  const weekday = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(lang, { weekday: 'short' })
    } catch {
      return new Intl.DateTimeFormat('en', { weekday: 'short' })
    }
  }, [lang])

  const nowInCity = report?.location.localtimeEpoch ? report.location.localtimeEpoch * 1000 : Date.now()
  const hours = useMemo(() => {
    const day: WeatherDay | undefined = report?.days[0]
    if (!day?.hours?.length) return []
    const upcoming = day.hours.filter((hour) => (hour.timeEpoch ?? 0) + 45 * 60000 >= nowInCity)
    // Late in the evening there are hardly any hours left in today, and a strip of
    // two boxes is not a forecast. Carry on into tomorrow rather than leave a gap.
    if (upcoming.length >= 6) return upcoming.slice(0, 12)
    const next = report?.days[1]?.hours || []
    return [...upcoming, ...next].slice(0, 12)
  }, [report, nowInCity])

  const today = report?.days[0]
  const ahead = (report?.days || []).slice(1)
  const range = useMemo(() => {
    const values = (report?.days || []).flatMap((day) => [day.maxTempC, day.minTempC].filter((v): v is number => v !== null))
    if (!values.length) return null
    return { min: Math.min(...values), max: Math.max(...values) }
  }, [report])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const wanted = draft.trim()
    if (!wanted) return
    setDraft('')
    setCity(wanted)
    store(CITY_STORE_KEY, wanted)
  }

  const choose = (wanted: string) => {
    setCity(wanted)
    store(CITY_STORE_KEY, wanted)
  }

  /**
   * The reader's own weather, without typing a thing.
   *
   * The browser is asked once for a position, and the numbers answer the same
   * lookup a typed city goes through: they travel to RADAR's server, which asks
   * the weather service and keeps the reading for the next person standing in
   * the same neighbourhood. The position itself is not stored and not sent
   * anywhere else on this site.
   *
   * A reader who says no, or whose phone cannot find them, keeps whatever was
   * already on the screen. Being refused is not an error the page should punish
   * by going blank.
   */
  const askMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setNotice(t('weather.locationUnsupported'))
      return
    }
    setLocating(true)
    setNotice(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const wanted = coordinateKey(position.coords.latitude, position.coords.longitude)
        // Already reading this patch of sky? Then the tap means"look again", and
        // picking the same city would set nothing off, because no part of the
        // page changed.
        if (wanted.toLowerCase() === city.toLowerCase()) {
          void load(wanted, true)
          return
        }
        choose(wanted)
      },
      (error) => {
        setLocating(false)
        // Refusing the question and failing to answer it are different things
        // worth different sentences: one is the reader's call, the other is
        // usually a building, a battery saver or a GPS that has not found you.
        setNotice(error.code === error.PERMISSION_DENIED ? t('weather.locationDenied') : t('weather.locationFailed'))
      },
      // Ten minutes of staleness is free to keep and is well inside the age of a
      // weather reading; asking the phone for a precise fix costs battery and
      // buys nothing a weather station can report.
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    )
  }

  const notConfigured = status ? !status.configured : read?.configured === false

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/*
        The masthead of the desk. Blue because it is RADAR's blue, and the numbers
        are the largest thing on the page because they are the only reason anybody
        opens a weather page.
      */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-600 text-white shadow-lg">
        <div className="flex flex-col gap-4 border-b border-white/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{t('weather.desk')}</p>
            <h1 className="text-2xl font-extrabold leading-tight">{t('weather.title')}</h1>
          </div>
          <form onSubmit={submit} className="flex w-full items-center gap-2 sm:w-auto">
            <label className="sr-only" htmlFor="weather-city">{t('weather.search')}</label>
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" aria-hidden="true" />
              <input
                id="weather-city"
                type="search"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('weather.searchPlaceholder')}
                className="w-full rounded-lg border border-white/25 bg-white/10 py-2 pl-9 pr-3 text-sm font-medium text-white placeholder:text-white/60 focus:border-white/60 focus:bg-white/15 focus:outline-none"
              />
            </div>
            <button type="submit" className="rounded-lg bg-white/95 px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-white">
              {t('weather.go')}
            </button>
            {/* One icon on a phone, a word on a screen wide enough for it: the
                chips below repeat this at full size for anyone who prefers a
                button they can read. */}
            <button
              type="button"
              onClick={askMyLocation}
              disabled={locating}
              aria-label={t('weather.myLocation')}
              title={t('weather.myLocation')}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg border border-white/25 px-2.5 py-2 text-xs font-bold text-white transition hover:bg-white/15',
                locating && 'opacity-75',
              )}
            >
              <Crosshair className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">{locating ? t('weather.locating') : t('weather.myLocation')}</span>
            </button>
            <div role="group" aria-label={t('weather.units')} className="flex shrink-0 overflow-hidden rounded-lg border border-white/25">
              {(['C', 'F'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => { setUnit(option); store(UNIT_STORE_KEY, option) }}
                  aria-pressed={unit === option}
                  className={cn(
                    'px-2.5 py-2 text-xs font-bold transition',
                    unit === option ? 'bg-white text-blue-700' : 'text-white/80 hover:bg-white/15',
                  )}
                >
                  °{option}
                </button>
              ))}
            </div>
          </form>
        </div>

        <div className="px-5 py-6">
          {loading && !report ? (
            // No spinner here: the bar across the top of every page is what says
            // the reading is on its way, and this line only tells the reader
            // which of their own questions that bar is answering.
            <p className="py-8 text-sm font-semibold text-white/90">{t('weather.loading')}</p>
          ) : notConfigured && !report ? (
            <div className="py-6">
              <p className="text-lg font-bold">{t('weather.notConfigured')}</p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/85">{t('weather.notConfiguredHint')}</p>
            </div>
          ) : report ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="text-lg font-bold">
                    {report.location.name || (isCoordinate(city) ? t('weather.myLocation') : city) || status?.defaultCity}
                    {report.location.region && report.location.region !== report.location.name ? `, ${report.location.region}` : ''}
                    {report.location.country ? `, ${report.location.country}` : ''}
                  </p>
                  {report.location.localtime && (
                    <p className="mt-0.5 text-xs font-medium text-white/75">
                      {t('weather.localTime')} {report.location.localtime}
                    </p>
                  )}
                  <div className="mt-4 flex items-end gap-4">
                    <p className="text-6xl font-extrabold leading-none tracking-tight">
                      {shown(temp(report.current.tempC, report.current.tempF))}
                      <span className="align-top text-2xl font-bold">°{unit}</span>
                    </p>
                    <WeatherGlyph
                      sky={skyFor(report.current.condition.code, report.current.condition.text)}
                      isDay={report.current.isDay}
                      className="h-16 w-16 text-white/95"
                    />
                  </div>
                  <p className="mt-2 text-sm font-bold">{report.current.condition.text}</p>
                  <p className="mt-1 text-sm text-white/85">
                    {t('weather.feelsLike')} {shown(temp(report.current.feelsC, report.current.feelsF))}°{unit}
                    {today && (
                      <>
                        {' · '}
                        {t('weather.high')} {shown(temp(today.maxTempC, today.maxTempF))}°
                        {' / '}
                        {t('weather.low')} {shown(temp(today.minTempC, today.minTempF))}°
                      </>
                    )}
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  {[
                    { icon: Droplets, label: t('weather.humidity'), value: report.current.humidity === null ? null : `${report.current.humidity}%` },
                    { icon: Wind, label: t('weather.wind'), value: report.current.windKph === null ? null : `${report.current.windKph} km/h ${report.current.windDir}` },
                    { icon: Umbrella, label: t('weather.rainChance'), value: report.current.chanceOfRain === null ? null : `${report.current.chanceOfRain}%` },
                    { icon: Gauge, label: t('weather.pressure'), value: report.current.pressureMb === null ? null : `${report.current.pressureMb} hPa` },
                    { icon: Sun, label: t('weather.uv'), value: report.current.uv === null ? null : String(report.current.uv) },
                    { icon: Thermometer, label: t('weather.dewPoint'), value: report.current.dewpointC === null ? null : `${shown(report.current.dewpointC)}°C` },
                  ].map((tile) => (
                    <div key={tile.label}>
                      <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/70">
                        <tile.icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {tile.label}
                      </dt>
                      <dd className="mt-0.5 text-base font-bold">{tile.value ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/75">
                <span>
                  {t('weather.measuredAt')} {report.current.lastUpdated || report.location.localtime || '—'}
                </span>
                {read?.stale && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('weather.stale')} {report.fetchedAt ? `(${ageLabel(Date.now() - new Date(report.fetchedAt).getTime(), t)})` : ''}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void load(city || report.q, true)}
                  disabled={refreshing}
                  aria-busy={refreshing}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-2.5 py-1 font-semibold transition hover:bg-white/15 disabled:opacity-70"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  {refreshing ? t('weather.refreshing') : t('weather.refresh')}
                </button>
                <span className="ml-auto">{t('weather.poweredBy')} {status?.source || 'WeatherAPI.com'}</span>
              </div>
            </>
          ) : (
            <div className="py-6">
              <p className="text-lg font-bold">{t('weather.nothing')}</p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/85">{notice || t('weather.unreachable')}</p>
            </div>
          )}
        </div>
      </section>

      {/* Only when the page has something to show: without a reading, the hero
          above is already saying what went wrong in the same words, and a
          sentence printed twice reads as a malfunction rather than as news. */}
      {notice && report && (
        <p role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {notice}
        </p>
      )}

      {report && hours.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm dark:bg-[var(--color-bg)]">
          <h2 className="text-base font-extrabold text-[var(--color-text)]">{t('weather.hourByHour')}</h2>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {hours.map((hour) => (
              <div
                key={`${hour.timeEpoch}-${hour.time}`}
                className="flex w-[74px] shrink-0 flex-col items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface,#f8fafc)] px-2 py-3 text-center dark:bg-white/5"
              >
                <span className="text-[11px] font-bold text-[var(--color-text-muted)]">{hourLabel(hour.time)}</span>
                <WeatherGlyph sky={skyFor(hour.condition.code, hour.condition.text)} isDay={hour.isDay} className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-extrabold text-[var(--color-text)]">{shown(temp(hour.tempC, hour.tempF))}°</span>
                <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  {hour.chanceOfRain === null ? '' : `${hour.chanceOfRain}%`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {report && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr,1fr]">
          <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm dark:bg-[var(--color-bg)]">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[var(--color-text)]">
              <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              {t('weather.daysAhead')}
            </h2>
            <ul className="mt-3 divide-y divide-[var(--color-border)]">
              {(report.days || []).map((day, index) => {
                const date = dayDate(day.date)
                const high = temp(day.maxTempC, day.maxTempF)
                const low = temp(day.minTempC, day.minTempF)
                const span = range && range.max > range.min && high !== null && low !== null && range.min !== null
                  ? { left: ((low - range.min) / (range.max - range.min)) * 100, width: ((high - low) / (range.max - range.min)) * 100 }
                  : null
                return (
                  <li key={day.date} className="flex items-center gap-3 py-3">
                    <span className="w-12 shrink-0 text-sm font-bold text-[var(--color-text)]">
                      {index === 0 ? t('weather.today') : date ? weekday.format(date) : day.date}
                    </span>
                    <WeatherGlyph sky={skyFor(day.condition.code, day.condition.text)} className="h-6 w-6 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span className="hidden w-28 shrink-0 truncate text-xs font-medium text-[var(--color-text-muted)] sm:block">
                      {day.condition.text}
                    </span>
                    <span className="w-10 shrink-0 text-right text-xs font-semibold text-[var(--color-text-muted)]">
                      {day.chanceOfRain === null ? '' : `${day.chanceOfRain}%`}
                    </span>
                    <span className="w-9 shrink-0 text-right text-sm font-bold text-[var(--color-text)]">{shown(high)}°</span>
                    <span className="relative hidden h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-white/10 sm:block">
                      {span && (
                        <span
                          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-400 to-blue-600"
                          style={{ left: `${span.left}%`, width: `${Math.max(span.width, 6)}%` }}
                        />
                      )}
                    </span>
                    <span className="w-9 shrink-0 text-right text-sm font-semibold text-[var(--color-text-muted)]">{shown(low)}°</span>
                  </li>
                )
              })}
            </ul>
            {ahead.length === 0 && <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('weather.noDaysAhead')}</p>}
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm dark:bg-[var(--color-bg)]">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[var(--color-text)]">
              <Moon className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              {t('weather.sunAndMoon')}
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              {[
                { icon: Sunrise, label: t('weather.sunrise'), value: today?.sunrise },
                { icon: Sunset, label: t('weather.sunset'), value: today?.sunset },
                { icon: Moon, label: t('weather.moonrise'), value: today?.moonrise },
                { icon: Moon, label: t('weather.moonset'), value: today?.moonset },
                { icon: Sun, label: t('weather.moonPhase'), value: today?.moonPhase },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                  <dt className="flex items-center gap-2 font-medium text-[var(--color-text-muted)]">
                    <row.icon className="h-4 w-4" aria-hidden="true" />
                    {row.label}
                  </dt>
                  <dd className="font-bold text-[var(--color-text)]">
                    {row.value || '—'}
                    {row.label === t('weather.moonPhase') && today?.moonIllumination !== null && today?.moonIllumination !== undefined
                      ? ` · ${today.moonIllumination}%`
                      : ''}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 rounded-xl bg-[var(--color-surface,#f8fafc)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-text-muted)] dark:bg-white/5">
              {t('weather.howItWorks')} {status?.refreshSeconds ? Math.round(status.refreshSeconds / 60) : 10} {t('weather.minutesUnit')}.
            </p>
          </section>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm dark:bg-[var(--color-bg)]">
        <h2 className="text-base font-extrabold text-[var(--color-text)]">{t('weather.otherCities')}</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('weather.otherCitiesHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {/* First, because for most readers it is the only one they need: the
              weather where they are standing, without typing a name. */}
          <button
            type="button"
            onClick={askMyLocation}
            disabled={locating}
            aria-pressed={isCoordinate(city)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition',
              isCoordinate(city)
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-dashed border-blue-500/70 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10',
              locating && 'opacity-70',
            )}
          >
            <Crosshair className="h-4 w-4" aria-hidden="true" />
            {locating ? t('weather.locating') : t('weather.myLocation')}
          </button>
          {NEARBY_CITIES.map((option) => {
            const wanted = option.q || option.label
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => choose(wanted)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-semibold transition',
                  wanted.toLowerCase() === (report?.q || city).toLowerCase()
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-blue-500 hover:text-blue-700 dark:hover:text-blue-300',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">{t('weather.locationHint')}</p>
      </section>
    </div>
  )
}
