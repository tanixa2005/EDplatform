import { createApp } from './app.js';
import { env } from './config/env.config.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 EDplatform Backend listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
  console.log(`📡 Health-check endpoint: http://localhost:${env.PORT}/api/v1/health`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('✅ Server connections closed. Process terminating.');
    process.exit(0);
  });

  // Force close after 10s timeout
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
