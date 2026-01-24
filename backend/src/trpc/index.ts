/**
 * tRPC instance initialization
 *
 * This is the core tRPC setup that creates the router factory and base procedures.
 * All domain routers use these exports to build their routes.
 */

import { initTRPC } from '@trpc/server';
import type { Context } from './context.js';

/**
 * Initialize tRPC with context type
 * This creates the base instance that all routers and procedures use
 */
export const t = initTRPC.context<Context>().create();

/**
 * Router factory for creating tRPC routers
 * Use this to create domain routers that get merged into the app router
 */
export const router = t.router;

/**
 * Public procedure (no authentication required)
 * Use for endpoints like health checks, public data, etc.
 */
export const publicProcedure = t.procedure;

/**
 * Middleware factory for creating custom middleware
 * Used by procedures.ts to create auth middleware
 */
export const middleware = t.middleware;

/**
 * Caller factory for server-side tRPC calls
 * Useful for testing and server-to-server calls
 */
export const createCallerFactory = t.createCallerFactory;
