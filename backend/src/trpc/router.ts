/**
 * Root tRPC application router
 *
 * This is the main router that merges all domain routers.
 * Currently contains only health check - domain routers will be added in subsequent plans.
 */

import { z } from 'zod';
import { router, publicProcedure } from './index.js';

/**
 * Application router
 * Domain routers will be added here:
 * - organizations (Plan 02)
 * - sites, areas, units (Plan 03)
 * - readings, alerts (Plan 04)
 * - etc.
 */
export const appRouter = router({
  /**
   * Health check procedure
   * Public endpoint to verify tRPC infrastructure is working
   */
  health: publicProcedure
    .output(z.object({ status: z.string(), timestamp: z.string() }))
    .query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })),
});

/**
 * Type export for tRPC client
 * This allows frontend to have full type safety
 */
export type AppRouter = typeof appRouter;
