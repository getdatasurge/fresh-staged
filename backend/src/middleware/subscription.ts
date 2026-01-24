/**
 * Subscription Enforcement Middleware
 *
 * Enforces subscription status and plan limits:
 * - requireActiveSubscription: Blocks access without active/trial subscription
 * - requireSensorCapacity: Prevents adding sensors beyond plan limit
 *
 * Follows the same pattern as rbac.ts middleware.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { db } from '../db/client.js';
import { subscriptions, organizations } from '../db/schema/tenancy.js';
import { devices } from '../db/schema/devices.js';
import { units } from '../db/schema/hierarchy.js';
import { areas } from '../db/schema/hierarchy.js';
import { sites } from '../db/schema/hierarchy.js';
import { eq, and, sql } from 'drizzle-orm';

// Valid subscription statuses that allow access
const ACTIVE_STATUSES = ['active', 'trial'] as const;

/**
 * Require an active or trial subscription to access route
 *
 * Returns 403 SUBSCRIPTION_REQUIRED if:
 * - No subscription exists for the organization
 * - Subscription status is not 'active' or 'trial'
 *
 * @example
 * fastify.get('/protected',
 *   { preHandler: [requireActiveSubscription] },
 *   async (request, reply) => { ... }
 * )
 */
export const requireActiveSubscription: preHandlerHookHandler = async function (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check authentication
  if (!request.user) {
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  const organizationId = request.user.organizationId;
  if (!organizationId) {
    return reply.status(403).send({
      error: {
        code: 'NO_ORGANIZATION',
        message: 'Organization context required',
      },
    });
  }

  // Fetch subscription status
  const [sub] = await db
    .select({
      status: subscriptions.status,
      plan: subscriptions.plan,
    })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  // Check subscription exists and is active
  if (!sub || !ACTIVE_STATUSES.includes(sub.status as typeof ACTIVE_STATUSES[number])) {
    return reply.status(403).send({
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Active subscription required to access this feature',
        status: sub?.status || 'none',
      },
    });
  }

  // Subscription check passed - continue to route handler
};

/**
 * Require capacity to add more sensors
 *
 * Returns 403 SENSOR_LIMIT_REACHED if:
 * - Current active sensor count >= organization's sensor limit
 *
 * Use on routes that create new devices/sensors.
 *
 * @example
 * fastify.post('/devices',
 *   { preHandler: [requireActiveSubscription, requireSensorCapacity] },
 *   async (request, reply) => { ... }
 * )
 */
export const requireSensorCapacity: preHandlerHookHandler = async function (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check authentication
  if (!request.user) {
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  const organizationId = request.user.organizationId;
  if (!organizationId) {
    return reply.status(403).send({
      error: {
        code: 'NO_ORGANIZATION',
        message: 'Organization context required',
      },
    });
  }

  // Get organization's sensor limit
  const [org] = await db
    .select({ sensorLimit: organizations.sensorLimit })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Organization not found',
      },
    });
  }

  // Count active devices through hierarchy:
  // devices -> units -> areas -> sites -> organizations
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(devices)
    .innerJoin(units, eq(devices.unitId, units.id))
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(and(
      eq(sites.organizationId, organizationId),
      eq(devices.isActive, true)
    ));

  const currentCount = Number(countResult[0]?.count ?? 0);
  const limit = org.sensorLimit;

  if (currentCount >= limit) {
    return reply.status(403).send({
      error: {
        code: 'SENSOR_LIMIT_REACHED',
        message: `Sensor limit (${limit}) reached. Upgrade your plan to add more sensors.`,
        currentCount,
        limit,
      },
    });
  }

  // Capacity check passed - continue to route handler
};

/**
 * Get current sensor count for an organization
 * Utility function for use in other services
 */
export async function getActiveSensorCount(organizationId: string): Promise<number> {
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(devices)
    .innerJoin(units, eq(devices.unitId, units.id))
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(and(
      eq(sites.organizationId, organizationId),
      eq(devices.isActive, true)
    ));

  return Number(countResult[0]?.count ?? 0);
}
