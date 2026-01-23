import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { config } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { defaultRateLimiter } from './middleware/rate-limit';
import { cache } from './middleware/cache';
import routes from './routes';
import { logger } from './utils/logger';

export const createApp = (): Application => {
  const app = express();

  // Trust proxy headers from Cloud Run / reverse proxies
  // This is required for express-rate-limit to correctly identify client IPs
  app.set('trust proxy', true);

  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) {
          callback(null, true);
          return;
        }

        // Normalize origin by removing trailing slash
        const normalizedOrigin = origin.replace(/\/$/, '');
        const normalizedAllowedOrigins = config.allowedOrigins.map(o => o.replace(/\/$/, ''));

        if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
          callback(null, true);
        } else {
          logger.warn(`CORS blocked origin: ${origin}`, {
            allowedOrigins: config.allowedOrigins,
          });
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(compression());

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const morganFormat = config.isDevelopment ? 'dev' : 'combined';
  app.use(
    morgan(morganFormat, {
      stream: {
        write: (message: string) => logger.info(message.trim()),
      },
    })
  );

  app.use(defaultRateLimiter);

  app.use(cache());

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
