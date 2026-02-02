/**
 * Admin tRPC Router
 *
 * Provides administrative endpoints for:
 * - Queue health and status monitoring
 * - System status and diagnostics
 *
 * All procedures require super admin authorization (superAdminProcedure).
 */

import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { eventLogs } from '../db/schema/audit.js';
import { sites } from '../db/schema/hierarchy.js';
import { organizations } from '../db/schema/tenancy.js';
import { platformRoles, profiles, userRoles } from '../db/schema/users.js';
import { getQueueService } from '../services/queue.service.js';
import { getOrCreateProfile, getUserPrimaryOrganization } from '../services/user.service.js';
import { router } from '../trpc/index.js';
import { superAdminProcedure } from '../trpc/procedures.js';

/**
 * Escape special ILIKE/LIKE characters so they are treated as literals.
 * PostgreSQL LIKE/ILIKE treats `%` as any-sequence, `_` as single-char,
 * and `\` as escape prefix.
 */
function escapeIlike(str: string): string {
  return str.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Queue stats schema for response typing
 */
const QueueStatsSchema = z.object({
  name: z.string(),
  counts: z
    .object({
      waiting: z.number(),
      active: z.number(),
      completed: z.number(),
      failed: z.number(),
      delayed: z.number(),
    })
    .optional(),
  error: z.string().optional(),
});

/**
 * Admin router — platform-wide super admin endpoints
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
   * @requires Super Admin (superAdminProcedure)
   */
  queueHealth: superAdminProcedure
    .output(
      z.object({
        redisEnabled: z.boolean(),
        queues: z.array(QueueStatsSchema),
        timestamp: z.string(),
      }),
    )
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
        } catch {
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
   * Get overall system status
   */
  systemStatus: superAdminProcedure
    .output(
      z.object({
        queues: z.object({
          enabled: z.boolean(),
          count: z.number(),
        }),
        timestamp: z.string(),
      }),
    )
    .query(async () => {
      const queueService = getQueueService();

      if (!queueService || !queueService.isRedisEnabled()) {
        return {
          queues: {
            enabled: false,
            count: 0,
          },
          timestamp: new Date().toISOString(),
        };
      }

      const queues = queueService.getAllQueues();

      return {
        queues: {
          enabled: true,
          count: queues.size,
        },
        timestamp: new Date().toISOString(),
      };
    }),

  /**
   * Get system record counts
   */
  systemStats: superAdminProcedure
    .output(
      z.object({
        organizations: z.number(),
        users: z.number(),
        sites: z.number(),
        units: z.number(),
        readings: z.number(),
        alerts: z.number(),
        timestamp: z.string(),
      }),
    )
    .query(async () => {
      // In production, these should be cached or retrieved from a stats table
      const [orgs, profiles, sites, units, readings, alerts] = (await Promise.all([
        db.select({ count: count() }).from(sql`organizations`),
        db.select({ count: count() }).from(sql`profiles`),
        db
          .select({ count: count() })
          .from(sql`sites`)
          .where(sql`deleted_at IS NULL`),
        db
          .select({ count: count() })
          .from(sql`units`)
          .where(sql`deleted_at IS NULL`),
        db.select({ count: count() }).from(sql`sensor_readings`),
        db.select({ count: count() }).from(sql`alerts`),
      ])) as Array<{ count: number }[]>;

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
  ttnConnections: superAdminProcedure
    .output(
      z.array(
        z.object({
          id: z.string(),
          organizationId: z.string(),
          orgName: z.string().optional(),
          applicationId: z.string().nullable(),
          isActive: z.boolean(),
          createdAt: z.string(),
        }),
      ),
    )
    .query(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = (await (db as any)
        .select({
          id: sql`ttn_connections.id`,
          organizationId: sql`ttn_connections.organization_id`,
          orgName: sql`organizations.name`,
          applicationId: sql`ttn_connections.application_id`,
          isActive: sql`ttn_connections.is_active`,
          createdAt: sql`ttn_connections.created_at`,
        })
        .from(sql`ttn_connections`)
        .leftJoin(
          sql`organizations`,
          sql`ttn_connections.organization_id = organizations.id`,
        )) as Record<string, unknown>[];

      return results.map((r) => ({
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
  listOrganizations: superAdminProcedure
    .output(
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          slug: z.string(),
          timezone: z.string(),
          complianceMode: z.string(),
          createdAt: z.string(),
          userCount: z.number(),
          siteCount: z.number(),
        }),
      ),
    )
    .query(async () => {
      // Single query with correlated subqueries instead of N+1
      const result = await db.execute(sql`
        SELECT
          o.id,
          o.name,
          o.slug,
          o.timezone,
          o.compliance_mode AS "complianceMode",
          o.created_at AS "createdAt",
          (SELECT COUNT(*)::int FROM user_roles ur WHERE ur.organization_id = o.id) AS "userCount",
          (SELECT COUNT(*)::int FROM sites s WHERE s.organization_id = o.id AND s.deleted_at IS NULL) AS "siteCount"
        FROM organizations o
        WHERE o.deleted_at IS NULL
        ORDER BY o.created_at DESC
      `);

      return (result.rows as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        slug: String(row.slug),
        timezone: String(row.timezone),
        complianceMode: String(row.complianceMode),
        createdAt: new Date(row.createdAt as string).toISOString(),
        userCount: Number(row.userCount || 0),
        siteCount: Number(row.siteCount || 0),
      }));
    }),

  /**
   * List all system users with roles and organization context
   */
  listUsers: superAdminProcedure
    .output(
      z.array(
        z.object({
          userId: z.string(),
          email: z.string(),
          fullName: z.string().nullable(),
          phone: z.string().nullable(),
          organizationId: z.string().nullable(),
          organizationName: z.string().nullable(),
          role: z.string().nullable(),
          isSuperAdmin: z.boolean(),
          createdAt: z.string(),
        }),
      ),
    )
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
        .leftJoin(
          userRoles,
          and(
            eq(profiles.userId, userRoles.userId),
            eq(profiles.organizationId, userRoles.organizationId),
          ),
        )
        .orderBy(sql`${profiles.createdAt} DESC`)
        .limit(200);

      // Get super admins from platform_roles
      const platformSuperAdmins = await db
        .select({ userId: platformRoles.userId })
        .from(platformRoles)
        .where(eq(platformRoles.role, 'SUPER_ADMIN'));

      const superAdminSet = new Set(platformSuperAdmins.map((r) => r.userId));

      return results.map((r) => ({
        ...r,
        isSuperAdmin: superAdminSet.has(r.userId),
        createdAt: r.createdAt.toISOString(),
        role: r.role || null,
        organizationName: r.organizationName || null,
      }));
    }),

  /**
   * Search users by email or name
   * Used by GlobalUserSearch component for super admin support mode
   */
  searchUsers: superAdminProcedure
    .input(z.object({ query: z.string().min(2) }))
    .output(
      z.array(
        z.object({
          userId: z.string(),
          email: z.string(),
          fullName: z.string().nullable(),
          organizationId: z.string().nullable(),
          organizationName: z.string().nullable(),
          role: z.string().nullable(),
        }),
      ),
    )
    .query(async ({ input }) => {
      const searchPattern = `%${escapeIlike(input.query)}%`;

      const results = await db
        .select({
          userId: profiles.userId,
          email: profiles.email,
          fullName: profiles.fullName,
          organizationId: profiles.organizationId,
          organizationName: organizations.name,
          role: userRoles.role,
        })
        .from(profiles)
        .leftJoin(organizations, eq(profiles.organizationId, organizations.id))
        .leftJoin(
          userRoles,
          and(
            eq(profiles.userId, userRoles.userId),
            eq(profiles.organizationId, userRoles.organizationId),
          ),
        )
        .where(or(ilike(profiles.email, searchPattern), ilike(profiles.fullName, searchPattern)))
        .limit(10);

      return results.map((r) => ({
        userId: r.userId,
        email: r.email,
        fullName: r.fullName,
        organizationId: r.organizationId,
        organizationName: r.organizationName,
        role: r.role,
      }));
    }),

  /**
   * Log a super admin action for platform audit trail
   */
  logSuperAdminAction: superAdminProcedure
    .input(
      z.object({
        action: z.string(),
        targetType: z.string().optional().nullable(),
        targetId: z.string().optional().nullable(),
        targetOrgId: z.string().optional().nullable(),
        impersonatedUserId: z.string().optional().nullable(),
        details: z.object({}).catchall(z.any()).optional(),
      }),
    )
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
        ctx.user.name,
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
        },
        recordedAt: new Date(),
      } as Record<string, unknown>);

      return { success: true };
    }),

  /**
   * List platform audit log entries
   */
  listSuperAdminAuditLog: superAdminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(1000).optional(),
      }),
    )
    .output(
      z.array(
        z.object({
          id: z.string(),
          action: z.string(),
          actorEmail: z.string().nullable(),
          actorName: z.string().nullable(),
          impersonatedUserId: z.string().nullable(),
          targetType: z.string().nullable(),
          targetId: z.string().nullable(),
          targetOrgId: z.string().nullable(),
          targetOrgName: z.string().nullable(),
          details: z.object({}).catchall(z.any()).nullable(),
          createdAt: z.string(),
        }),
      ),
    )
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
          impersonatedUserId:
            typeof eventData.impersonatedUserId === 'string' ? eventData.impersonatedUserId : null,
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
   * Find orphan organizations (organizations with no members)
   */
  findOrphanOrganizations: superAdminProcedure.query(async () => {
    const result = await db.execute(sql`
      SELECT
        o.id AS org_id,
        o.name AS org_name,
        o.slug AS org_slug,
        o.created_at AS org_created_at,
        COUNT(DISTINCT s.id) AS sites_count,
        COUNT(DISTINCT a.id) AS areas_count,
        COUNT(DISTINCT u.id) AS units_count,
        COUNT(DISTINCT sen.id) AS sensors_count,
        COUNT(DISTINCT g.id) AS gateways_count,
        COUNT(DISTINCT al.id) AS alerts_count,
        COUNT(DISTINCT el.id) AS event_logs_count,
        CASE WHEN sub.id IS NOT NULL THEN true ELSE false END AS has_subscription
      FROM organizations o
      LEFT JOIN user_roles ur ON o.id = ur.organization_id
      LEFT JOIN sites s ON o.id = s.organization_id AND s.deleted_at IS NULL
      LEFT JOIN areas a ON s.id = a.site_id AND a.deleted_at IS NULL
      LEFT JOIN units u ON a.id = u.area_id AND u.deleted_at IS NULL
      LEFT JOIN sensors sen ON u.id = sen.unit_id AND sen.deleted_at IS NULL
      LEFT JOIN gateways g ON o.id = g.ttn_connection_id
      LEFT JOIN alerts al ON u.id = al.unit_id
      LEFT JOIN event_logs el ON o.id = el.organization_id
      LEFT JOIN subscriptions sub ON o.id = sub.organization_id
      WHERE ur.id IS NULL
        AND o.deleted_at IS NULL
      GROUP BY o.id, o.name, o.slug, o.created_at, sub.id
      ORDER BY o.created_at DESC
    `);

    return result.rows as Record<string, unknown>[];
  }),

  /**
   * List cleanup jobs
   *
   * TODO: Implement — the DataMaintenance page (src/pages/DataMaintenance.tsx)
   * expects this endpoint to return scheduled/completed org cleanup jobs.
   * Returns an empty array until the cleanup-job scheduling system is built.
   */
  listCleanupJobs: superAdminProcedure.query(async () => {
    return [];
  }),

  /**
   * Get organization details with users and sites
   */
  getOrganization: superAdminProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { organizationId } = input;

      // Fetch organization
      const [org] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          timezone: organizations.timezone,
          complianceMode: organizations.complianceMode,
          sensorLimit: organizations.sensorLimit,
          createdAt: organizations.createdAt,
          deletedAt: organizations.deletedAt,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      // Fetch users, sites, and unit count in parallel (independent queries)
      const [userResults, siteResults, unitsCountResult] = await Promise.all([
        db
          .select({
            userId: profiles.userId,
            email: profiles.email,
            fullName: profiles.fullName,
            phone: profiles.phone,
            role: userRoles.role,
          })
          .from(profiles)
          .leftJoin(
            userRoles,
            and(
              eq(profiles.userId, userRoles.userId),
              eq(profiles.organizationId, userRoles.organizationId),
            ),
          )
          .where(eq(profiles.organizationId, organizationId)),

        db
          .select({
            id: sites.id,
            name: sites.name,
            address: sites.address,
            isActive: sites.isActive,
          })
          .from(sites)
          .where(eq(sites.organizationId, organizationId)),

        db.execute(sql`
          SELECT COUNT(*)::int as count
          FROM units u
          INNER JOIN areas a ON u.area_id = a.id
          INNER JOIN sites s ON a.site_id = s.id
          WHERE s.organization_id = ${organizationId}
            AND u.deleted_at IS NULL
        `),
      ]);
      const unitsCount = (unitsCountResult.rows[0] as Record<string, unknown>)?.count || 0;

      return {
        ...org,
        createdAt: org.createdAt.toISOString(),
        deletedAt: org.deletedAt ? org.deletedAt.toISOString() : null,
        unitsCount,
        users: userResults.map((user) => ({
          userId: user.userId,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
        })),
        sites: siteResults.map((site) => ({
          id: site.id,
          name: site.name,
          address: site.address,
          isActive: site.isActive,
        })),
      };
    }),

  /**
   * Get user profile with roles and super admin status
   */
  getUser: superAdminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { userId } = input;

      // Fetch profile
      const [profile] = await db
        .select({
          userId: profiles.userId,
          email: profiles.email,
          fullName: profiles.fullName,
          phone: profiles.phone,
          organizationId: profiles.organizationId,
          createdAt: profiles.createdAt,
          updatedAt: profiles.updatedAt,
        })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);

      if (!profile) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Fetch user roles and super admin status in parallel (independent queries)
      const [roleResults, [superAdminRole]] = await Promise.all([
        db
          .select({
            organizationId: userRoles.organizationId,
            organizationName: organizations.name,
            role: userRoles.role,
          })
          .from(userRoles)
          .innerJoin(organizations, eq(userRoles.organizationId, organizations.id))
          .where(eq(userRoles.userId, userId)),

        db
          .select({ id: platformRoles.id })
          .from(platformRoles)
          .where(and(eq(platformRoles.userId, userId), eq(platformRoles.role, 'SUPER_ADMIN')))
          .limit(1),
      ]);

      return {
        userId: profile.userId,
        email: profile.email,
        fullName: profile.fullName,
        phone: profile.phone,
        organizationId: profile.organizationId,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
        roles: roleResults.map((r) => ({
          organizationId: r.organizationId,
          organizationName: r.organizationName || null,
          role: r.role,
        })),
        isSuperAdmin: !!superAdminRole,
      };
    }),

  /**
   * Soft delete an organization (sets deletedAt and frees up slug)
   */
  softDeleteOrganization: superAdminProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const { organizationId } = input;

      // Fetch organization first
      const [org] = await db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          deletedAt: organizations.deletedAt,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      if (org.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Organization is already deleted',
        });
      }

      // Soft delete: set deletedAt and append timestamp to slug
      const timestamp = Date.now();
      const newSlug = `${org.slug}_deleted_${timestamp}`;

      await db
        .update(organizations)
        .set({
          deletedAt: new Date(),
          slug: newSlug,
        })
        .where(eq(organizations.id, organizationId));

      return { success: true };
    }),

  /**
   * Hard delete an organization (permanently deletes from database)
   *
   * Safeguards:
   * - Organization must be soft-deleted first (deletedAt must be set)
   * - Caller must confirm by providing the exact organization name
   * - An audit log entry is created before deletion for traceability
   */
  hardDeleteOrganization: superAdminProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        confirmName: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { organizationId, confirmName } = input;

      // Fetch organization with deletion status
      const [org] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          deletedAt: organizations.deletedAt,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      // Require prior soft-delete
      if (!org.deletedAt) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Organization must be soft-deleted before hard deletion',
        });
      }

      // Require name confirmation to prevent accidental deletion
      if (confirmName !== org.name) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Confirmation name does not match organization name',
        });
      }

      // Audit log before irreversible deletion
      await db.insert(eventLogs).values({
        eventType: 'hard_delete_organization',
        category: 'admin_action',
        severity: 'critical',
        title: `Hard deleted organization: ${org.name}`,
        organizationId,
        actorType: 'super_admin',
        eventData: {
          organizationName: org.name,
          deletedBy: ctx.user.id,
          deletedByEmail: ctx.user.email,
        },
        recordedAt: new Date(),
      } as Record<string, unknown>);

      // Hard delete
      await db.delete(organizations).where(eq(organizations.id, organizationId));

      return { success: true };
    }),
});
