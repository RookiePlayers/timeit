import { createApp } from './app';
import { config } from './config/env';
import { initializeFirebase } from './config/firebase-admin';
import { logger } from './utils/logger';

const startServer = async () => {
  try {
    initializeFirebase();
    logger.info('Firebase Admin SDK initialized');

    const app = createApp();

    logger.info(`Starting server on port ${config.port}...`);
    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info(`Server running on port ${config.port} in ${process.env.NODE_ENV} mode`);
      logger.info(`API available at ${config.apiBaseUrl}/api/v1`);
      logger.info(`Listening on http://0.0.0.0:${config.port}`);
    });

    const gracefulShutdown = (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled Rejection', { reason });
    });

    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception', { error });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

startServer();
