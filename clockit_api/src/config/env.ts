import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env.local first, then fall back to .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4001').transform(Number),
  API_BASE_URL: z.string().url().default('http://localhost:4001'),
  FIREBASE_SERVICE_ACCOUNT_B64: z.string().min(1),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => err.path.join('.')).join(', ');
      console.error('\n❌ Environment Configuration Error:');
      console.error(`Missing or invalid variables: ${missingVars}`);
      console.error('\nMake sure you have created .env.local with all required variables.');
      console.error('See .env.example for the template.\n');
      throw new Error(`Missing or invalid environment variables: ${missingVars}`);
    }
    throw error;
  }
};

export const env = parseEnv();
const getAllowedOrigins = () => {
  const allowed_origins_b64 = process.env.ALLOWED_ORIGINS;
  if (!allowed_origins_b64) {return ['http://localhost:3000'];}
  try {
    const decoded = Buffer.from(allowed_origins_b64, 'base64').toString('utf-8');
    return decoded.split(',').map(origin => origin.trim());
  } catch {
    return ['http://localhost:3000'];
  }
};
export const config = {
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  apiBaseUrl: env.API_BASE_URL,
  allowedOrigins: getAllowedOrigins(),
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
  logging: {
    level: env.LOG_LEVEL,
  },
};
