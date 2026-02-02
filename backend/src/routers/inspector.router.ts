/**
 * Inspector tRPC Router
 *
 * Provides type-safe procedures for Inspector mode functionality:
 * - validateSession: Validate inspector token for external access
 * - getOrgData: Get organization details and sites
 * - getUnits: Get units for filtering
 * - getInspectionData: Get all inspection data for date range
 *
 * Inspector mode provides read-only access for auditors/inspectors.
 */

import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { alerts, correctiveActions } from '../db/schema/alerts.js';
import { eventLogs } from '../db/schema/audit.js';
import { areas, sites, units } from '../db/schema/hierarchy.js';
import { manualTemperatureLogs, sensorReadings } from '../db/schema/telemetry.js';
import { organizations } from '../db/schema/tenancy.js';
import { profiles, userRoles } from '../db/schema/users.js';
import { router } from '../trpc/index.js';
import { protectedProcedure, orgProcedure } from '../trpc/procedures.js';

/**
 * Validate an inspector session token
 * Returns organization access info if valid
 */
const validateSessionSchema = z.object({
  token: z.string().min(1),
});

/**
 * Get organization data for inspector
 */
const getOrgDataSchema = z.object({
  organizationId: z.string().uuid(),
  allowedSiteIds: z.array(z.string().uuid()).optional(),
});

/**
 * Get units for filtering
 */
const getUnitsSchema = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
});

/**
 * Get inspection data for date range
 */
const getInspectionDataSchema = z.object({
  organizationId: z.string().uuid(),
  unitIds: z.array(z.string().uuid()),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export const inspectorRouter = router({
  /**
   * Validate inspector session token
   * For external (token-based) inspector access
   */
  validateSession: protectedProcedure
    .input(validateSessionSchema)
    .mutation(async ({ ctx, input }) => {
      // Query inspector_sessions table for valid session
      const result = await db.execute(sql`
        SELECT
          organization_id,
          allowed_site_ids,
          expires_at,
          is_active
        FROM inspector_sessions
        WHERE token = ${input.token}
        LIMIT 1
      `);

      const session = result.rows[0] as
        | {
            organization_id: string;
            allowed_site_ids: string[] | null;
            expires_at: string;
            is_active: boolean;
          }
        | undefined;

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invalid inspector token',
        });
      }

      // Verify the authenticated user belongs to this session's organization
      const [membership] = await db
        .select({ id: userRoles.id })
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, ctx.user.id),
            eq(userRoles.organizationId, session.organization_id),
          ),
        )
        .limit(1);

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to access this organization',
        });
      }

      if (!session.is_active) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Inspector session is inactive',
        });
      }

      if (new Date(session.expires_at) < new Date()) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Inspector session has expired',
        });
      }

      // Update last_used_at timestamp
      await db.execute(sql`
        UPDATE inspector_sessions
        SET last_used_at = NOW()
        WHERE token = ${input.token}
      `);

      return {
        organizationId: session.organization_id,
        allowedSiteIds: session.allowed_site_ids,
      };
    }),

  /**
   * Check user's inspector role in organization
   * For authenticated user inspector access
   */
  checkUserAccess: orgProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ ctx }) => {
      // User is already authenticated and has org access via orgProcedure
      // Just verify they have at least viewer role (inspector access)
      const allowedRoles = ['viewer', 'staff', 'manager', 'admin', 'owner'];

      if (!allowedRoles.includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'No access to inspector mode',
        });
      }

      return {
        organizationId: ctx.user.organizationId,
        role: ctx.user.role,
      };
    }),

  /**
   * Get organization data and sites for inspector
   */
  getOrgData: orgProcedure.input(getOrgDataSchema).query(async ({ ctx, input }) => {
    // Get organization info
    const [org] = await db
      .select({
        name: organizations.name,
        timezone: organizations.timezone,
      })
      .from(organizations)
      .where(eq(organizations.id, ctx.user.organizationId))
      .limit(1);

    if (!org) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      });
    }

    // Get sites, optionally filtered by allowedSiteIds
    const sitesQuery = db
      .select({
        id: sites.id,
        name: sites.name,
        timezone: sites.timezone,
      })
      .from(sites)
      .where(and(eq(sites.organizationId, ctx.user.organizationId), eq(sites.isActive, true)));

    const sitesData = await sitesQuery;

    // Filter by allowed site IDs if provided
    const filteredSites =
      input.allowedSiteIds && input.allowedSiteIds.length > 0
        ? sitesData.filter((s) => input.allowedSiteIds!.includes(s.id))
        : sitesData;

    return {
      name: org.name,
      timezone: org.timezone,
      sites: filteredSites,
    };
  }),

  /**
   * Get units for filtering, optionally by site
   */
  getUnits: orgProcedure.input(getUnitsSchema).query(async ({ ctx, input }) => {
    // Query units with area and site joins
    const unitsData = await db
      .select({
        id: units.id,
        name: units.name,
        unitType: units.unitType,
        tempMin: units.tempMin,
        tempMax: units.tempMax,
        areaId: units.areaId,
        areaName: areas.name,
        siteId: sites.id,
      })
      .from(units)
      .innerJoin(areas, eq(units.areaId, areas.id))
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(
        and(
          eq(sites.organizationId, ctx.user.organizationId),
          eq(units.isActive, true),
          input.siteId ? eq(sites.id, input.siteId) : undefined,
        ),
      );

    return unitsData.map((u) => ({
      id: u.id,
      name: u.name,
      unit_type: u.unitType,
      temp_limit_high: u.tempMax,
      temp_limit_low: u.tempMin,
      area: { name: u.areaName },
      site_id: u.siteId,
    }));
  }),

  /**
   * Get all inspection data for date range
   * Returns temperature logs, exceptions, corrective actions, and monitoring gaps
   */
  getInspectionData: orgProcedure.input(getInspectionDataSchema).query(async ({ input }) => {
    if (input.unitIds.length === 0) {
      return {
        temperatureLogs: [],
        exceptions: [],
        correctiveActions: [],
        monitoringGaps: [],
      };
    }

    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    // Load sensor readings
    const sensorData = await db
      .select({
        id: sensorReadings.id,
        unitId: sensorReadings.unitId,
        temperature: sensorReadings.temperature,
        recordedAt: sensorReadings.recordedAt,
      })
      .from(sensorReadings)
      .where(
        and(
          inArray(sensorReadings.unitId, input.unitIds),
          gte(sensorReadings.recordedAt, startDate),
          lte(sensorReadings.recordedAt, endDate),
        ),
      )
      .orderBy(desc(sensorReadings.recordedAt));

    // Load manual logs with profile info
    const manualData = await db
      .select({
        id: manualTemperatureLogs.id,
        unitId: manualTemperatureLogs.unitId,
        temperature: manualTemperatureLogs.temperature,
        recordedAt: manualTemperatureLogs.recordedAt,
        profileId: manualTemperatureLogs.profileId,
        notes: manualTemperatureLogs.notes,
        profileName: profiles.fullName,
        profileEmail: profiles.email,
      })
      .from(manualTemperatureLogs)
      .leftJoin(profiles, eq(manualTemperatureLogs.profileId, profiles.id))
      .where(
        and(
          inArray(manualTemperatureLogs.unitId, input.unitIds),
          gte(manualTemperatureLogs.recordedAt, startDate),
          lte(manualTemperatureLogs.recordedAt, endDate),
        ),
      )
      .orderBy(desc(manualTemperatureLogs.recordedAt));

    // Load alerts as exceptions
    const alertsData = await db
      .select({
        id: alerts.id,
        unitId: alerts.unitId,
        alertType: alerts.alertType,
        message: alerts.message,
        severity: alerts.severity,
        status: alerts.status,
        triggeredAt: alerts.triggeredAt,
        acknowledgedBy: alerts.acknowledgedBy,
        metadata: alerts.metadata,
        acknowledgerName: profiles.fullName,
        acknowledgerEmail: profiles.email,
      })
      .from(alerts)
      .leftJoin(profiles, eq(alerts.acknowledgedBy, profiles.id))
      .where(
        and(
          inArray(alerts.unitId, input.unitIds),
          gte(alerts.triggeredAt, startDate),
          lte(alerts.triggeredAt, endDate),
        ),
      )
      .orderBy(desc(alerts.triggeredAt));

    // Load corrective actions
    const caData = await db
      .select({
        id: correctiveActions.id,
        unitId: correctiveActions.unitId,
        description: correctiveActions.description,
        actionTaken: correctiveActions.actionTaken,
        actionAt: correctiveActions.actionAt,
        profileId: correctiveActions.profileId,
        profileName: profiles.fullName,
        profileEmail: profiles.email,
      })
      .from(correctiveActions)
      .leftJoin(profiles, eq(correctiveActions.profileId, profiles.id))
      .where(
        and(
          inArray(correctiveActions.unitId, input.unitIds),
          gte(correctiveActions.actionAt, startDate),
          lte(correctiveActions.actionAt, endDate),
        ),
      )
      .orderBy(desc(correctiveActions.actionAt));

    // Load monitoring gaps from event logs
    const gapsData = await db
      .select({
        id: eventLogs.id,
        unitId: eventLogs.unitId,
        eventType: eventLogs.eventType,
        eventData: eventLogs.eventData,
        recordedAt: eventLogs.recordedAt,
      })
      .from(eventLogs)
      .where(
        and(
          inArray(eventLogs.unitId, input.unitIds),
          inArray(eventLogs.eventType, ['unit_state_change', 'missed_manual_log']),
          gte(eventLogs.recordedAt, startDate),
          lte(eventLogs.recordedAt, endDate),
        ),
      )
      .orderBy(desc(eventLogs.recordedAt));

    return {
      sensorReadings: sensorData.map((r) => ({
        id: r.id,
        unit_id: r.unitId,
        temperature: parseFloat(r.temperature as string),
        recorded_at: r.recordedAt.toISOString(),
      })),
      manualLogs: manualData.map((m) => ({
        id: m.id,
        unit_id: m.unitId,
        temperature: parseFloat(m.temperature as string),
        logged_at: m.recordedAt.toISOString(),
        logged_by: m.profileName || m.profileEmail || 'Unknown',
        notes: m.notes,
      })),
      alerts: alertsData.map((a) => ({
        id: a.id,
        unit_id: a.unitId,
        alert_type: a.alertType,
        title: a.message || '',
        severity: a.severity,
        status: a.status,
        triggered_at: a.triggeredAt.toISOString(),
        acknowledged_by: a.acknowledgerName || a.acknowledgerEmail,
        acknowledgment_notes: a.metadata
          ? JSON.parse(a.metadata as string)?.acknowledgmentNotes
          : undefined,
      })),
      correctiveActions: caData.map((ca) => ({
        id: ca.id,
        unit_id: ca.unitId,
        action_taken: ca.actionTaken || ca.description,
        root_cause: ca.description,
        completed_at: ca.actionAt.toISOString(),
        created_by: ca.profileName || ca.profileEmail || 'Unknown',
      })),
      monitoringGaps: gapsData
        .filter((g) => {
          const data = g.eventData as Record<string, unknown> | null;
          return (
            data?.to_status === 'offline' ||
            data?.to_status === 'monitoring_interrupted' ||
            g.eventType === 'missed_manual_log'
          );
        })
        .map((g) => {
          const data = g.eventData as Record<string, unknown> | null;
          return {
            id: g.id,
            unit_id: g.unitId || '',
            gap_type:
              g.eventType === 'missed_manual_log'
                ? 'Missed Manual Log'
                : `${data?.from_status} → ${data?.to_status}`,
            start_at: g.recordedAt.toISOString(),
            duration_minutes: (data?.duration_minutes as number) || 0,
          };
        }),
    };
  }),
});
