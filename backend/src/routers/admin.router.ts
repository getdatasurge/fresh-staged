/**
 * Admin tRPC Router
 *
 * Provides administrative endpoints for:
 * - Queue health and status monitoring
 * - System status and diagnostics
 *
 * All procedures require authentication.
 */

import { z } from 'zod'
import { getQueueService } from '../services/queue.service.js'
import { router } from '../trpc/index.js'
import { protectedProcedure } from '../trpc/procedures.js'

/**
 * Queue stats schema for response typing
 */
const QueueStatsSchema = z.object({
  name: z.string(),
  counts: z.object({
    waiting: z.number(),
    active: z.number(),
    completed: z.number(),
    failed: z.number(),
    delayed: z.number(),
  }).optional(),
  error: z.string().optional(),
});

/**
 * Admin router
 *
 * Procedures:
 * - queueHealth: Get health status of all registered queues
 * - systemStatus: Get overall system status
 */
export const adminRouter = router({
  /**
   * Get queue health status
   *
   * Returns health status of all registered queues including:
   * - Queue names
   * - Job counts by status (waiting, active, completed, failed, delayed)
   * - Redis connection status
   *
   * @requires Authentication (protectedProcedure)
   */
  queueHealth: protectedProcedure
    .output(z.object({
      redisEnabled: z.boolean(),
      queues: z.array(QueueStatsSchema),
      timestamp: z.string(),
    }))
    .query(async () => {
      const queueService = getQueueService();

      if (!queueService || !queueService.isRedisEnabled()) {
        return {
          redisEnabled: false,
          queues: [],
          timestamp: new Date().toISOString(),
        };
      }

      // Get all queues and their stats
      const queues = queueService.getAllQueues();
      const queueStats: z.infer<typeof QueueStatsSchema>[] = [];

      for (const [name, queue] of queues.entries()) {
        try {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
          ]);

          queueStats.push({
            name,
            counts: {
              waiting,
              active,
              completed,
              failed,
              delayed,
            },
          });
        } catch (error) {
          queueStats.push({
            name,
            error: 'Failed to get queue stats',
          });
        }
      }

      return {
        redisEnabled: true,
        queues: queueStats,
        timestamp: new Date().toISOString(),
      };
    }),

  /**
   * Get system record counts
   */
  systemStats: protectedProcedure
    .output(z.object({
      organizations: z.number(),
      users: z.number(),
      sites: z.number(),
      units: z.number(),
      readings: z.number(),
      alerts: z.number(),
      timestamp: z.string(),
    }))
    .query(async () => {
      // In production, these should be cached or retrieved from a stats table
      const [orgs, profiles, sites, units, readings, alerts] = await Promise.all([
        db.select({ count: count() }).from(sql`organizations`),
        db.select({ count: count() }).from(sql`profiles`),
        db.select({ count: count() }).from(sql`sites`).where(sql`deleted_at IS NULL`),
        db.select({ count: count() }).from(sql`units`).where(sql`deleted_at IS NULL`),
        db.select({ count: count() }).from(sql`sensor_readings`),
        db.select({ count: count() }).from(sql`alerts`),
      ]);

      return {
        organizations: Number(orgs[0]?.count || 0),
        users: Number(profiles[0]?.count || 0),
        sites: Number(sites[0]?.count || 0),
        units: Number(units[0]?.count || 0),
        readings: Number(readings[0]?.count || 0),
        alerts: Number(alerts[0]?.count || 0),
        timestamp: new Date().toISOString(),
      };
    }),

  /**
   * List all TTN connections across all organizations
   */
  ttnConnections: protectedProcedure
    .output(z.array(z.object({
      id: z.string(),
      organizationId: z.string(),
      orgName: z.string().optional(),
      applicationId: z.string().nullable(),
      isActive: z.boolean(),
      createdAt: z.string(),
    })))
    .query(async () => {
      const results = await db
        .select({
          id: sql`ttn_connections.id`,
          organizationId: sql`ttn_connections.organization_id`,
          orgName: sql`organizations.name`,
          applicationId: sql`ttn_connections.application_id`,
          isActive: sql`ttn_connections.is_active`,
          createdAt: sql`ttn_connections.created_at`,
        } as any)
        .from(sql`ttn_connections`)
        .leftJoin(sql`organizations`, sql`ttn_connections.organization_id = organizations.id`);

      return results.map((r: any) => ({
        id: r.id,
        organizationId: r.organizationId,
        orgName: r.orgName,
        applicationId: r.applicationId,
        isActive: r.isActive,
        createdAt: new Date(r.createdAt).toISOString(),
      }));
    }),
});
