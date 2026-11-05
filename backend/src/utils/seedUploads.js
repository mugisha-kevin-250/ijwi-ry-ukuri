const fs = require('fs');
const path = require('path');
const env = require('../config/env');

// Render mounts a fresh empty disk at UPLOAD_DIR on the first deploy, while the
// database still points at files from before. Copies those in without ever
// overwriting what production has already written.
function seedUploads() {
  const seedDir = env.SEED_UPLOADS_DIR;
  if (!seedDir || !fs.existsSync(seedDir)) return 0;

  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(seedDir)) {
    const source = path.join(seedDir, entry);
    if (!fs.statSync(source).isFile()) continue;
    const target = path.join(env.UPLOAD_DIR, entry);
    if (fs.existsSync(target)) continue;
    fs.copyFileSync(source, target);
    copied += 1;
  }
  return copied;
}

module.exports = { seedUploads };
