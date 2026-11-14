const mongoose = require('mongoose');
const env = require('./env');

let memoryServer;

async function connectDatabase() {
  try {
    let uri = env.MONGODB_URI;
    if (!uri) {
      if (env.NODE_ENV !== 'development') {
        throw new Error('MONGODB_URI is required outside development');
      }
      uri = await startMemoryDatabase();
    }
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log(`MongoDB connected: ${mongoose.connection.host}`);
    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
}

async function startMemoryDatabase() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  // Port 0 asks for any free port. The default, 27017, is the port a developer
  // already has a real database on, and the test run would fail to start rather
  // than say so.
  memoryServer = await MongoMemoryServer.create({ instance: { port: 0 } });
  return memoryServer.getUri();
}

async function disconnectDatabase() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
  }
}

module.exports = { connectDatabase, disconnectDatabase };
