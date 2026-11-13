/**
 * Reading of Google's daily trending-search feed.
 *
 * Google publishes it as RSS at https://trends.google.com/trending/rss?geo=XX and
 * gives no key, no JSON and no schema, so the few tags the newsroom needs are
 * taken out here rather than pulling an XML parser into the dependencies for one
 * feed. Everything returned is a value Google printed: a topic, the traffic band
 * Google attached to it and the headlines Google credited it to. Nothing here
 * estimates, scales or invents a number.
 */

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(value) {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** The text inside the first <name>…</name>, unwrapping CDATA and entities. */
function tagValue(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  if (!match) return '';
  const raw = match[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return decode((cdata ? cdata[1] : raw).trim());
}

function everyTag(block, name) {
  const open = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g');
  const found = [];
  let match;
  while ((match = open.exec(block)) !== null) found.push(match[1]);
  return found;
}

/**
 * "200+" is a band, not a count. The number is kept only so the admin can sort
 * the list the way Google orders it; the label is what gets printed.
 */
function trafficBand(value) {
  const digits = String(value).match(/\d[\d,]*/);
  if (!digits) return { approxTraffic: null, trafficLabel: value || '' };
  return { approxTraffic: Number(digits[0].replace(/,/g, '')), trafficLabel: String(value).trim() };
}

function parseItems(xml) {
  return everyTag(xml, 'item');
}

/**
 * @param {string} xml the body of one geo's feed
 * @returns {{ topics: object[], malformed: boolean }}
 */
function parseTrendsFeed(xml) {
  const body = String(xml || '');
  const items = parseItems(body);
  const topics = items.map((item) => {
    const topic = tagValue(item, 'title');
    const band = trafficBand(tagValue(item, 'ht:approx_traffic'));
    const seenAt = tagValue(item, 'pubDate');
    const newsItems = everyTag(item, 'ht:news_item')
      .map((block) => ({
        title: tagValue(block, 'ht:news_item_title'),
        url: tagValue(block, 'ht:news_item_url'),
        source: tagValue(block, 'ht:news_item_source'),
      }))
      .filter((news) => news.url);
    return { topic, ...band, seenAt, newsItems };
  }).filter((topic) => topic.topic);

  // A response with no <item> at all is either a genuinely empty feed or not a
  // feed: the caller has to be able to tell "Google reported nothing" from "we
  // could not read what Google sent".
  return { topics, malformed: items.length === 0 && !/<rss[\s>]/i.test(body) };
}

module.exports = { parseTrendsFeed, decode, trafficBand };
