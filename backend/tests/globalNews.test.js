const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFeed } = require('../src/services/globalNewsService');

test('parses RSS headlines, dates and safe HTTPS links with publisher attribution', () => {
  const feed = { url: 'https://example.org/rss.xml', name: 'Example News', region: 'GB', language: 'en' };
  const items = parseFeed('<rss><channel><item><title><![CDATA[World &amp; Africa]]></title><link>https://example.org/story</link><pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>', feed);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'World & Africa');
  assert.equal(items[0].sourceName, 'Example News');
  assert.equal(items[0].region, 'GB');
  assert.ok(items[0].publishedAt instanceof Date);
});

test('rejects insecure and malformed links', () => {
  const feed = { url: 'https://example.org/rss.xml', name: 'Example', region: 'WORLD', language: 'en' };
  const items = parseFeed('<rss><item><title>Bad link</title><link>javascript:alert(1)</link></item><item><title>Good</title><link>https://example.org/good</link></item></rss>', feed);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Good');
});
