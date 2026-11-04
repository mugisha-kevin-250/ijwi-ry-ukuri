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
  memoryServer = await MongoMemoryServer.create();
  return memoryServer.getUri();
}

async function disconnectDatabase() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
  }
}

module.exports = { connectDatabase, disconnectDatabase };
