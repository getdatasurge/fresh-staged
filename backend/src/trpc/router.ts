/**
 * Root tRPC application router
 *
 * This is the main router that merges all domain routers.
 */

import { z } from 'zod';
import { router, publicProcedure } from './index.js';
import { organizationsRouter } from '../routers/organizations.router.js';

/**
 * Application router
 * Domain routers:
 * - organizations: Organization CRUD and member management
 * - sites, areas, units: Coming in Plan 03
 * - readings, alerts: Coming in Plan 04
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

  /**
   * Organizations domain router
   * Procedures: get, update, listMembers, stats
   */
  organizations: organizationsRouter,
});

/**
 * Type export for tRPC client
 * This allows frontend to have full type safety
 */
export type AppRouter = typeof appRouter;
