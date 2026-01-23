import { Router } from 'express';
import { FeaturesController } from '@/controllers/features.controller';
import { authenticate } from '@/middleware/auth';
import { defaultRateLimiter } from '@/middleware/rate-limit';
import { asyncHandler } from '@/middleware/async-handler';
import { validateBody, validateParams } from '@/middleware/validate';
import { cache } from '@/middleware/cache';
import { z } from 'zod';

const router = Router();

// Validation schemas
const setEntitlementSchema = z.object({
  entitlementId: z.string().min(1),
});

const entitlementIdSchema = z.object({
  entitlementId: z.string().min(1),
});

// Routes
router.get(
  '/user',
  authenticate,
  cache({ ttl: 300000 }), // Cache for 5 minutes (features change less frequently)
  defaultRateLimiter,
  asyncHandler(FeaturesController.getUserEntitlement)
);

router.post(
  '/user/entitlement',
  authenticate,
  defaultRateLimiter,
  validateBody(setEntitlementSchema),
  asyncHandler(FeaturesController.setUserEntitlement)
);

router.get(
  '/entitlements',
  authenticate,
  defaultRateLimiter,
  asyncHandler(FeaturesController.listEntitlements)
);

router.get(
  '/entitlements/:entitlementId',
  authenticate,
  defaultRateLimiter,
  validateParams(entitlementIdSchema),
  asyncHandler(FeaturesController.getEntitlement)
);

export default router;
