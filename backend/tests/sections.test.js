process.env.MONGODB_URI = '';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const Article = require('../src/models/Article');
const Category = require('../src/models/Category');
const User = require('../src/models/User');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { seedSections } = require('../src/utils/seedDefaults');

let author;
let sportsId;
let footballId;

async function publish(title, categoryId) {
  return Article.create({
    title,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    summary: 'A short summary of the story.',
    content: 'One two three four five six seven eight nine ten words of body text.',
    author: author._id,
    category: categoryId,
    status: 'published',
    publishedAt: new Date(),
  });
}

test.before(async () => {
  await connectDatabase();
  await seedSections();
  author = await User.create({ fullName: 'Ada Writer', username: 'ada', email: 'ada@example.com', password: 'Password123!', role: 'WRITER' });

  sportsId = (await Category.findOne({ slug: 'sports' }).select('_id').lean())._id;
  footballId = (await Category.findOne({ slug: 'football' }).select('_id').lean())._id;
  // The copy a writer created years ago under the Kinyarwanda spelling, which
  // nothing renamed and no story was ever moved off.
  const amasport = await Category.create({ name: 'Amasport', slug: 'amasport', isActive: true });

  await publish('Rwanda wins the final', footballId);
  await publish('A club changes its coach', sportsId);
  await publish('An old story tagged in Kinyarwanda', amasport._id);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('the section tree is published with its sub-sections', async () => {
  const response = await request(app).get('/api/sections');
  assert.equal(response.status, 200);

  const sections = response.body.data.sections;
  const world = sections.find((section) => section.slug === 'world');
  const sports = sections.find((section) => section.slug === 'sports');

  assert.deepEqual(world.children.map((child) => child.slug), ['middle-east', 'africa', 'americas', 'europe', 'asia-pacific']);
  assert.equal(world.href, '/world');
  assert.equal(world.children[0].href, '/world/middle-east');
  assert.deepEqual(sports.children.map((child) => child.slug), ['football', 'basketball', 'cricket', 'tennis', 'esports']);
  assert.equal(sections[0].slug, 'trending');
});

test('a sub-section page shows only its own stories', async () => {
  const response = await request(app).get('/api/sections/sports/football');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.total, 1);
  assert.equal(response.body.data.articles[0].title, 'Rwanda wins the final');
  assert.equal(response.body.data.child.slug, 'football');
});

test('a section page shows the stories filed under it and under its sub-sections', async () => {
  const response = await request(app).get('/api/sections/sports');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.total, 3);
  assert.equal(response.body.data.child, null);
});

test('the old spelling of a section still opens it, and says where it moved', async () => {
  const response = await request(app).get('/api/categories/amasport');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.category.slug, 'sports');
  assert.equal(response.body.data.sectionPath, '/sports');
  assert.equal(response.body.data.total, 3);
});

test('a category that is not a section keeps its own page', async () => {
  const other = await Category.create({ name: 'Campus', slug: 'campus', isActive: true });
  await publish('A university opens a lab', other._id);

  const response = await request(app).get('/api/categories/campus');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.category.slug, 'campus');
  assert.equal(response.body.data.sectionPath, null);
  assert.equal(response.body.data.total, 1);
});

test('seeding twice does not add a second copy of a section', async () => {
  await seedSections();
  const sports = await Category.find({ slug: 'sports' }).lean();
  const football = await Category.find({ slug: 'football' }).lean();
  assert.equal(sports.length, 1);
  assert.equal(football.length, 1);
  assert.equal(String(football[0].parent), String(sportsId));
});
