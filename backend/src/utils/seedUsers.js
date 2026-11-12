const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const WriterProfile = require('../models/WriterProfile');
const PlatformSetting = require('../models/PlatformSetting');
const env = require('../config/env');

// These four logins exist so a developer can click through every role. They are
// not real people, and a password committed to this repository is a public
// password, so each one now gets a fresh generated secret printed once, at
// creation, and none of them are created on a production server at all.
const DEV_ACCOUNTS = [
  { email: 'kevin@example.com', username: 'kevin', fullName: 'Mugisha Ime Kevin', role: 'ADMIN', writerStatus: 'approved' },
  { email: 'editor@example.com', username: 'editor', fullName: 'Editor User', role: 'EDITOR', writerStatus: 'approved' },
  { email: 'writer@example.com', username: 'writer', fullName: 'Test Writer', role: 'WRITER', writerStatus: 'approved' },
  { email: 'reader@example.com', username: 'reader', fullName: 'Test Reader', role: 'READER' }
];

function generatedPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

async function markBootstrapped() {
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

async function seedUsers() {
  if (env.NODE_ENV !== 'production') {
    for (const account of DEV_ACCOUNTS) {
      const existing = await User.findOne({ $or: [{ email: account.email }, { username: account.username }] });
      if (existing) {
        console.log(`User ${existing.username} already exists`);
        continue;
      }

      const password = generatedPassword();
      const user = await User.create({
        ...account,
        country: 'Rwanda',
        language: 'en',
        password: await bcrypt.hash(password, 10)
      });

      if (account.role === 'WRITER') {
        const profile = await WriterProfile.create({
          user: user._id,
          fullName: account.fullName,
          username: account.username,
          bio: 'Test writer profile',
          country: 'Rwanda',
          language: 'en',
          reasonForWriting: 'Testing',
          status: 'approved'
        });
        user.writerProfile = profile._id;
        await user.save();
      }

      // Printed to this terminal only: it is how the developer signs in, and it
      // never reaches git or the database in readable form.
      console.log(`Created ${account.role.toLowerCase()} login: ${account.username} / ${password}`);
    }
  }

  await bootstrapAdmin();
}

// Runs once per database; afterwards the admin owns their own credentials.
async function bootstrapAdmin() {
  const flag = await PlatformSetting.findOne({ key: 'adminBootstrapped' });
  if (flag) return;

  const wanted = {
    username: process.env.BOOTSTRAP_ADMIN_USERNAME || '',
    email: process.env.BOOTSTRAP_ADMIN_EMAIL || '',
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || ''
  };

  if (!wanted.password) {
    // Locally the role accounts above already contain an ADMIN, so the flag is
    // recorded without touching that generated password.
    if (env.NODE_ENV !== 'production') {
      await markBootstrapped();
      return;
    }
    console.warn('No BOOTSTRAP_ADMIN_PASSWORD in the environment: the first admin was not created. Set BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, restart once, then remove them.');
    return;
  }

  const hashedPassword = await bcrypt.hash(wanted.password, 10);
  let admin = wanted.username ? await User.findOne({ username: wanted.username }) : null;
  if (!admin && wanted.email) admin = await User.findOne({ email: wanted.email });

  if (admin) {
    admin.role = 'ADMIN';
    admin.password = hashedPassword;
    admin.isActive = true;
    await admin.save();
    console.log(`Admin login ready for existing account: ${admin.username}`);
  } else {
    const created = await User.create({
      fullName: wanted.username || 'Site Administrator',
      username: wanted.username || 'admin',
      email: wanted.email || `${wanted.username || 'admin'}@example.com`,
      password: hashedPassword,
      role: 'ADMIN',
      writerStatus: 'approved',
      country: 'Rwanda',
      language: 'en'
    });
    console.log(`Admin login created: ${created.username}`);
  }

  await markBootstrapped();
}

module.exports = { seedUsers, bootstrapAdmin };
