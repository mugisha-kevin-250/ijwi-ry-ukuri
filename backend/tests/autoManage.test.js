const test = require('node:test');
const assert = require('node:assert/strict');
const autoManage = require('../src/services/autoManageService');
const lifecycle = require('../src/utils/articleLifecycle');

test('RADAR only accepts real UHD 4K image dimensions', () => {
  assert.equal(autoManage.is4k({ width: 3840, height: 2160 }), true);
  assert.equal(autoManage.is4k({ width: 2160, height: 3840 }), true);
  assert.equal(autoManage.is4k({ width: 4000, height: 2000 }), false);
  assert.equal(autoManage.is4k({ width: 1920, height: 1080 }), false);
  assert.equal(autoManage.is4k(null), false);
});

test('automatic article quality gate requires two full sources from different publishers', () => {
  const paragraph = 'Reporters confirmed the development through public statements and independently gathered details from the event. '.repeat(3);
  const story = {
    title: 'Regional transport authorities announce new cross-border service',
    summary: 'Authorities have announced a new regional service after a series of public consultations and operational preparations.',
    content: Array(5).fill(paragraph).join('\n\n'),
  };
  const sources = {
    topic: 'Regional transport service',
    headlines: [
      { url: 'https://publisher-one.example/story', status: 'extracted', text: 'A'.repeat(600) },
      { url: 'https://publisher-two.example/story', status: 'extracted', text: 'B'.repeat(600) },
    ],
  };
  assert.equal(autoManage.qualityGate(story, sources), '');
  assert.match(autoManage.qualityGate(story, { ...sources, headlines: sources.headlines.slice(0, 1) }), /two distinct HTTPS publishers/);
});

test('all article publishing paths reject stories without a featured image', () => {
  const article = {
    title: 'A complete story title',
    summary: 'A complete summary',
    content: 'A complete article body',
    category: 'category-id',
    author: 'author-id',
  };
  assert.match(lifecycle.publishable(article), /featured image is required/i);
  assert.equal(lifecycle.publishable({ ...article, featuredImage: 'https://images.example/photo.jpg' }), '');
});
