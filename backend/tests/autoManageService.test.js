const test = require('node:test');
const assert = require('node:assert/strict');
const { qualityGate, is4k, isPublishableImage } = require('../src/services/autoManageService');

const paragraph = 'The report describes the confirmed development and attributes the information to the named publisher. '.repeat(3);
const story = {
  title: 'Regional transport authority announces a new public service plan',
  summary: 'The authority has outlined a new service plan and published details for residents and transport operators.',
  paragraphs: [paragraph, paragraph, paragraph, paragraph, paragraph],
  content: [paragraph, paragraph, paragraph, paragraph, paragraph].join('\n\n'),
};
const evidence = {
  topic: 'Regional transport service plan',
  headlines: [
    { title: 'Publisher one report', url: 'https://one.example/news', source: 'Publisher One', status: 'extracted', text: 'Verified extracted article body. '.repeat(20) },
    { title: 'Publisher two report', url: 'https://two.example/news', source: 'Publisher Two', status: 'extracted', text: 'Second extracted article body. '.repeat(20) },
  ],
};

test('RADAR quality gate accepts a sufficiently sourced complete low-risk article', () => {
  assert.equal(qualityGate(story, evidence), '');
});

test('RADAR quality gate holds articles with only one publisher domain', () => {
  const onePublisher = { ...evidence, headlines: evidence.headlines.map((item) => ({ ...item, url: 'https://one.example/' + item.title })) };
  assert.match(qualityGate(story, onePublisher), /two distinct HTTPS publishers/);
});


test('RADAR quality gate refuses headline-only evidence for automatic publication', () => {
  const headlinesOnly = { ...evidence, headlines: evidence.headlines.map(({ title, url, source }) => ({ title, url, source })) };
  assert.match(qualityGate(story, headlinesOnly), /two distinct HTTPS publishers/);
});

test('RADAR quality gate holds high-impact topics for human editorial review', () => {
  assert.match(qualityGate(story, { ...evidence, topic: 'National election update' }), /human editorial review/);
});

test('RADAR quality gate holds short generated copy', () => {
  const short = { ...story, paragraphs: ['A short paragraph.'], content: 'A short paragraph.' };
  assert.match(qualityGate(short, evidence), /too short/);
});


test('RADAR accepts a verified high-resolution image without requiring UHD', () => {
  const photo = { url: 'https://images.example/photo.jpg', width: 1600, height: 1000 };
  assert.equal(isPublishableImage(photo), true);
  assert.equal(is4k(photo), false);
});

test('RADAR prefers real UHD dimensions but never treats a thumbnail as publishable', () => {
  assert.equal(isPublishableImage({ url: 'https://images.example/uhd.jpg', width: 3840, height: 2160 }), true);
  assert.equal(is4k({ url: 'https://images.example/uhd.jpg', width: 3840, height: 2160 }), true);
  assert.equal(isPublishableImage({ url: 'https://images.example/thumb.jpg', width: 640, height: 480 }), false);
  assert.equal(isPublishableImage({ url: 'http://images.example/photo.jpg', width: 1600, height: 1000 }), false);
  assert.equal(isPublishableImage({ url: 'https://images.example/photo.jpg', width: 1600, height: 0 }), false);
});
