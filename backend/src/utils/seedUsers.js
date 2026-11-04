const bcrypt = require('bcryptjs');
const User = require('../models/User');
const WriterProfile = require('../models/WriterProfile');
const PlatformSetting = require('../models/PlatformSetting');
const env = require('../config/env');

async function seedUsers() {
  const users = [
    {
      email: 'kevin@example.com',
      username: 'kevin',
      fullName: 'Mugisha Ime Kevin',
      password: 'eeettt123',
      role: 'ADMIN',
      writerStatus: 'approved',
      country: 'Rwanda',
      language: 'en'
    },
    {
      email: 'editor@example.com',
      username: 'editor',
      fullName: 'Editor User',
      password: 'EditorPass123!',
      role: 'EDITOR',
      writerStatus: 'approved',
      country: 'Rwanda',
      language: 'en'
    },
    {
      email: 'writer@example.com',
      username: 'writer',
      fullName: 'Test Writer',
      password: 'WriterPass123!',
      role: 'WRITER',
      writerStatus: 'approved',
      country: 'Rwanda',
      language: 'en'
    },
    {
      email: 'reader@example.com',
      username: 'reader',
      fullName: 'Test Reader',
      password: 'ReaderPass123!',
      role: 'READER',
      country: 'Rwanda',
      language: 'en'
    }
  ];

  for (const userData of users) {
    const existing = await User.findOne({ $or: [{ email: userData.email }, { username: userData.username }] });
    if (existing) {
      console.log(`User ${existing.username} already exists`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = await User.create({
      ...userData,
      password: hashedPassword
    });

    if (userData.role === 'WRITER') {
      await WriterProfile.create({
        user: user._id,
        fullName: userData.fullName,
        username: userData.username,
        bio: 'Test writer profile',
        country: userData.country,
        language: userData.language,
        reasonForWriting: 'Testing',
        status: 'approved'
      });
      user.writerProfile = (await WriterProfile.findOne({ user: user._id }))._id;
      await user.save();
    }

    console.log(`Created user: ${userData.email} (${userData.role})`);
  }

  await bootstrapAdmin();
}

// Runs once per database; afterwards the admin owns their own credentials.
async function bootstrapAdmin() {
  const flag = await PlatformSetting.findOne({ key: 'adminBootstrapped' });
  if (flag) return;

  const hashedPassword = await bcrypt.hash('eeettt123', 10);
  let admin = await User.findOne({ username: 'kevin' }).then((found) => found || User.findOne({ email: 'kevin@example.com' }));

  if (admin) {
    admin.role = 'ADMIN';
    admin.password = hashedPassword;
    admin.isActive = true;
    await admin.save();
    console.log(`Admin login ready for existing account: ${admin.username}`);
  } else {
    await User.create({
      fullName: 'Mugisha Ime Kevin',
      username: 'kevin',
      email: 'kevin@example.com',
      password: hashedPassword,
      role: 'ADMIN',
      writerStatus: 'approved',
      country: 'Rwanda',
      language: 'en'
    });
    console.log('Admin login created: kevin');
  }

  await PlatformSetting.findOneAndUpdate(
    { key: 'adminBootstrapped' },
    {
      $set: {
        key: 'adminBootstrapped',
        value: new Date().toISOString(),
        description: 'Admin credentials seeded once; later changes belong to the admin'
      }
    },
    { upsert: true, new: true }
  );
}

module.exports = { seedUsers, bootstrapAdmin };