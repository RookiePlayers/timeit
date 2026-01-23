import { Router } from 'express';
import { StatsController } from '@/controllers/stats.controller';
import { authenticate } from '@/middleware/auth';
import { defaultRateLimiter } from '@/middleware/rate-limit';
import { asyncHandler } from '@/middleware/async-handler';
import { validateBody } from '@/middleware/validate';
import { cache, clearCache } from '@/middleware/cache';
import { idempotent } from '@/middleware/idempotency';
import { z } from 'zod';

const router = Router();

// Validation schemas
const achievementSchema = z.object({
  id: z.string(),
  type: z.string(),
  earnedAt: z.string().optional(),
}).passthrough();

// Routes
router.get(
  '/',
  authenticate,
  cache({ ttl: 60000 }), // Cache for 1 minute
  defaultRateLimiter,
  asyncHandler(StatsController.getStats)
);

router.post(
  '/refresh',
  authenticate,
  defaultRateLimiter,
  clearCache('/api/stats'), // Clear stats cache on refresh
  asyncHandler(StatsController.refreshStats)
);

router.post(
  '/achievements',
  authenticate,
  defaultRateLimiter,
  idempotent({ ttl: 24 * 60 * 60 * 1000 }), // Prevent duplicate achievement saves for 24h
  validateBody(achievementSchema),
  asyncHandler(StatsController.saveAchievement)
);

export default router;
