/**
 * Root tRPC application router
 *
 * This is the main router that merges all domain routers.
 * Currently empty - domain routers will be added in subsequent plans.
 */

import { router } from './index.js';

/**
 * Application router
 * Domain routers will be added here:
 * - organizations (Plan 02)
 * - sites, areas, units (Plan 03)
 * - readings, alerts (Plan 04)
 * - etc.
 */
export const appRouter = router({
  // Empty for now - Plan 02 adds organizations router
});

/**
 * Type export for tRPC client
 * This allows frontend to have full type safety
 */
export type AppRouter = typeof appRouter;
