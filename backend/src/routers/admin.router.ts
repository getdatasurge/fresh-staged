/**
 * Admin tRPC Router
 *
 * Provides administrative endpoints for:
 * - Queue health and status monitoring
 * - System status and diagnostics
 *
 * All procedures require authentication.
 */

import { and, count, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { eventLogs } from '../db/schema/audit.js'
import { sites } from '../db/schema/hierarchy.js'
import { organizations } from '../db/schema/tenancy.js'
import { platformRoles, profiles, userRoles } from '../db/schema/users.js'
import { getQueueService } from '../services/queue.service.js'
import { getOrCreateProfile, getUserPrimaryOrganization } from '../services/user.service.js'
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

  /**
   * List all system organizations with stats
   */
  listOrganizations: protectedProcedure
    .output(z.array(z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      timezone: z.string(),
      complianceMode: z.string(),
      createdAt: z.string(),
      userCount: z.number(),
      siteCount: z.number(),
    })))
    .query(async () => {
      // Get organizations that are not deleted
      const orgs = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          timezone: organizations.timezone,
          complianceMode: organizations.complianceMode,
          createdAt: organizations.createdAt,
        })
        .from(organizations)
        .where(isNull(organizations.deletedAt))
        .orderBy(sql`${organizations.createdAt} DESC`);

      // Enrich with counts
      const stats = await Promise.all(orgs.map(async (org) => {
        const [userCountResult] = await db
          .select({ count: count() })
          .from(userRoles)
          .where(eq(userRoles.organizationId, org.id));
        
        const [siteCountResult] = await db
          .select({ count: count() })
          .from(sites)
          .where(and(
            eq(sites.organizationId, org.id),
            isNull(sites.deletedAt)
          ));

        return {
          ...org,
          createdAt: org.createdAt.toISOString(),
          userCount: Number(userCountResult?.count || 0),
          siteCount: Number(siteCountResult?.count || 0),
        };
      }));

      return stats;
    }),

  /**
   * List all system users with roles and organization context
   */
  listUsers: protectedProcedure
    .output(z.array(z.object({
      userId: z.string(),
      email: z.string(),
      fullName: z.string().nullable(),
      phone: z.string().nullable(),
      organizationId: z.string().nullable(),
      organizationName: z.string().nullable(),
      role: z.string().nullable(),
      isSuperAdmin: z.boolean(),
      createdAt: z.string(),
    })))
    .query(async () => {
      const results = await db
        .select({
          userId: profiles.userId,
          email: profiles.email,
          fullName: profiles.fullName,
          phone: profiles.phone,
          organizationId: profiles.organizationId,
          organizationName: organizations.name,
          role: userRoles.role,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .leftJoin(organizations, eq(profiles.organizationId, organizations.id))
        .leftJoin(userRoles, and(
          eq(profiles.userId, userRoles.userId),
          eq(profiles.organizationId, userRoles.organizationId)
        ))
        .orderBy(sql`${profiles.createdAt} DESC`)
        .limit(200);

      // Get super admins from platform_roles
      const platformSuperAdmins = await db
        .select({ userId: platformRoles.userId })
        .from(platformRoles)
        .where(eq(platformRoles.role, 'SUPER_ADMIN'));

      const superAdminSet = new Set(platformSuperAdmins.map(r => r.userId));

      return results.map(r => ({
        ...r,
        isSuperAdmin: superAdminSet.has(r.userId),
        createdAt: r.createdAt.toISOString(),
        role: r.role || null,
        organizationName: r.organizationName || null,
      }));
    }),

  /**
   * Log a super admin action for platform audit trail
   */
  logSuperAdminAction: protectedProcedure
    .input(z.object({
      action: z.string(),
      targetType: z.string().optional().nullable(),
      targetId: z.string().optional().nullable(),
      targetOrgId: z.string().optional().nullable(),
      impersonatedUserId: z.string().optional().nullable(),
      details: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { action, targetType, targetId, targetOrgId, impersonatedUserId, details } = input;

      const orgContext = targetOrgId
        ? { organizationId: targetOrgId }
        : await getUserPrimaryOrganization(ctx.user.id);

      if (!orgContext?.organizationId) {
        return { success: false, reason: 'no_organization_context' };
      }

      const { id: profileId } = await getOrCreateProfile(
        ctx.user.id,
        orgContext.organizationId,
        ctx.user.email,
        ctx.user.name
      );

      await db.insert(eventLogs).values({
        eventType: action,
        category: 'user_action',
        severity: 'info',
        title: action,
        organizationId: orgContext.organizationId,
        actorId: profileId,
        actorType: 'user',
        eventData: {
          targetType: targetType || null,
          targetId: targetId || null,
          targetOrgId: targetOrgId || null,
          impersonatedUserId: impersonatedUserId || null,
          details: details || {},
        } as any,
        recordedAt: new Date(),
      });

      return { success: true };
    }),

  /**
   * List platform audit log entries
   */
  listSuperAdminAuditLog: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(1000).optional(),
    }))
    .output(z.array(z.object({
      id: z.string(),
      action: z.string(),
      actorEmail: z.string().nullable(),
      actorName: z.string().nullable(),
      impersonatedUserId: z.string().nullable(),
      targetType: z.string().nullable(),
      targetId: z.string().nullable(),
      targetOrgId: z.string().nullable(),
      targetOrgName: z.string().nullable(),
      details: z.record(z.any()).nullable(),
      createdAt: z.string(),
    })))
    .query(async ({ input }) => {
      const limit = input.limit ?? 500;

      const results = await db
        .select({
          id: eventLogs.id,
          action: eventLogs.eventType,
          createdAt: eventLogs.recordedAt,
          actorEmail: profiles.email,
          actorName: profiles.fullName,
          targetOrgName: organizations.name,
          eventData: eventLogs.eventData,
        })
        .from(eventLogs)
        .leftJoin(profiles, eq(eventLogs.actorId, profiles.id))
        .leftJoin(organizations, eq(eventLogs.organizationId, organizations.id))
        .orderBy(desc(eventLogs.recordedAt))
        .limit(limit);

      return results.map((entry) => {
        const eventData = (entry.eventData || {}) as Record<string, unknown>;

        return {
          id: entry.id,
          action: entry.action,
          actorEmail: entry.actorEmail || null,
          actorName: entry.actorName || null,
          impersonatedUserId: typeof eventData.impersonatedUserId === 'string'
            ? eventData.impersonatedUserId
            : null,
          targetType: typeof eventData.targetType === 'string' ? eventData.targetType : null,
          targetId: typeof eventData.targetId === 'string' ? eventData.targetId : null,
          targetOrgId: typeof eventData.targetOrgId === 'string' ? eventData.targetOrgId : null,
          targetOrgName: entry.targetOrgName || null,
          details: (eventData.details as Record<string, unknown>) || null,
          createdAt: entry.createdAt.toISOString(),
        };
      });
    }),

  /**
   * Get detail for an organization (system-wide)
   */
  getOrganization: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const { organizationId } = input;

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!org) {
        throw new Error('Organization not found');
      }

      // Get users
      const members = await db
        .select({
          userId: userRoles.userId,
          role: userRoles.role,
          email: profiles.email,
          fullName: profiles.fullName,
          phone: profiles.phone,
        })
        .from(userRoles)
        .leftJoin(profiles, eq(userRoles.userId, profiles.userId))
        .where(eq(userRoles.organizationId, organizationId));

      // Get sites
      const orgSites = await db
        .select()
        .from(sites)
        .where(and(
          eq(sites.organizationId, organizationId),
          isNull(sites.deletedAt)
        ));

      return {
        ...org,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
        users: members,
        sites: orgSites.map(s => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
      };
    }),

  /**
   * Get detail for a user (system-wide)
   */
  getUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const { userId } = input;

      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);

      if (!profile) {
        throw new Error('User profile not found');
      }

      // Get roles
      const roles = await db
        .select({
          role: userRoles.role,
          organizationId: userRoles.organizationId,
          organizationName: organizations.name,
        })
        .from(userRoles)
        .leftJoin(organizations, eq(userRoles.organizationId, organizations.id))
        .where(eq(userRoles.userId, userId));

      // Check if super admin
      const [platformRole] = await db
        .select()
        .from(platformRoles)
        .where(and(
          eq(platformRoles.userId, userId),
          eq(platformRoles.role, 'SUPER_ADMIN')
        ))
        .limit(1);

      return {
        ...profile,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
        roles,
        isSuperAdmin: !!platformRole,
      };
    }),
});


