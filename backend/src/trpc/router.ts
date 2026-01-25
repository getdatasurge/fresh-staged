/**
 * Root tRPC application router
 *
 * This is the main router that merges all domain routers.
 */

import { z } from 'zod';
import { router, publicProcedure } from './index.js';
import { organizationsRouter } from '../routers/organizations.router.js';
import { sitesRouter } from '../routers/sites.router.js';
import { areasRouter } from '../routers/areas.router.js';

/**
 * Application router
 * Domain routers:
 * - organizations: Organization CRUD and member management
 * - sites: Site CRUD operations
 * - areas: Area CRUD operations
 * - units: Coming in Plan 02
 * - readings, alerts: Coming in Plan 03-04
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

  /**
   * Sites domain router
   * Procedures: list, get, create, update, delete
   */
  sites: sitesRouter,

  /**
   * Areas domain router
   * Procedures: list, get, create, update, delete
   */
  areas: areasRouter,
});

/**
 * Type export for tRPC client
 * This allows frontend to have full type safety
 */
export type AppRouter = typeof appRouter;
