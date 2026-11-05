const app = require('./app');
const { connectDatabase } = require('./config/database');
const { seedDefaults } = require('./utils/seedDefaults');
const { seedUploads } = require('./utils/seedUploads');
const env = require('./config/env');

async function connectDatabaseWithRetry() {
  while (true) {
    try {
      await connectDatabase();
      return;
    } catch (error) {
      console.error(`MongoDB unavailable; retrying in 15 seconds: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  }
}

function listenForRequests(port) {
  const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && env.NODE_ENV === 'development' && Number(port) < 65535) {
      const nextPort = Number(port) + 1;
      console.warn(`Port ${port} is in use; trying port ${nextPort}.`);
      listenForRequests(nextPort);
      return;
    }

    console.error(`Failed to start server on port ${port}: ${error.message}`);
    process.exit(1);
  });
}

async function startServer() {
  if (env.NODE_ENV === 'development') {
    listenForRequests(env.PORT);

    connectDatabaseWithRetry()
      .then(seedDefaults)
      .catch((error) => {
        console.error('Failed to initialize database:', error.message);
        process.exit(1);
      });
    return;
  }

  try {
    await connectDatabase();
    await seedDefaults();
    const seeded = seedUploads();
    if (seeded) console.log(`Seeded ${seeded} upload file(s) onto ${env.UPLOAD_DIR}`);
    listenForRequests(env.PORT);
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
