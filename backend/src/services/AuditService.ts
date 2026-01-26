import { and, desc, eq, gte, lte } from "drizzle-orm"
import { db } from "../db/client.js"
import { areas, eventLogs, profiles, sites, units } from "../db/schema/index.js"

export interface LogEventParams {
  eventType: string;
  category?: string; // allow string to match schema
  severity?: string;
  title: string;
  organizationId: string;
  siteId?: string | null;
  areaId?: string | null;
  unitId?: string | null;
  actorId: string;
  actorType?: string;
  eventData?: Record<string, unknown>;
  impersonationSessionId?: string | null;
  actingAdminId?: string | null;
}

export class AuditService {
  /**
   * Log an event to the audit trail
   */
  static async logEvent(params: LogEventParams) {
    const {
      eventType,
      category = 'user_action',
      severity = 'info',
      title,
      organizationId,
      siteId,
      areaId,
      unitId,
      actorId,
      actorType = 'user',
      eventData,
      impersonationSessionId,
      actingAdminId,
    } = params;

    await db.insert(eventLogs).values({
      eventType,
      category,
      severity,
      title,
      organizationId,
      siteId,
      areaId,
      unitId,
      actorId,
      actorType,
      eventData: eventData as any,
      // Impersonation columns
      actingUserId: actingAdminId || null,
      impersonationSessionId: impersonationSessionId || null,
      wasImpersonated: !!actingAdminId,
      recordedAt: new Date(),
    });

    return { success: true };
  }

  /**
   * List event logs with filters
   */
  static async listEvents(params: {
    organizationId: string;
    siteId?: string;
    areaId?: string;
    unitId?: string;
    start?: string;
    end?: string;
    limit?: number;
    offset?: number;
  }) {
    const { organizationId, siteId, areaId, unitId, start, end, limit = 50, offset = 0 } = params;

    const results = await db
      .select({
        id: eventLogs.id,
        eventType: eventLogs.eventType,
        category: eventLogs.category,
        severity: eventLogs.severity,
        title: eventLogs.title,
        recordedAt: eventLogs.recordedAt,
        organizationId: eventLogs.organizationId,
        siteId: eventLogs.siteId,
        areaId: eventLogs.areaId,
        unitId: eventLogs.unitId,
        actorId: eventLogs.actorId,
        actorType: eventLogs.actorType,
        eventData: eventLogs.eventData,
        ipAddress: eventLogs.ipAddress,
        userAgent: eventLogs.userAgent,
        siteName: sites.name,
        areaName: areas.name,
        unitName: units.name,
        actorName: profiles.fullName,
        actorEmail: profiles.email,
      })
      .from(eventLogs)
      .leftJoin(sites, eq(eventLogs.siteId, sites.id))
      .leftJoin(areas, eq(eventLogs.areaId, areas.id))
      .leftJoin(units, eq(eventLogs.unitId, units.id))
      .leftJoin(profiles, eq(eventLogs.actorId, profiles.userId))
      .where(and(
        eq(eventLogs.organizationId, organizationId),
        siteId ? eq(eventLogs.siteId, siteId) : undefined,
        areaId ? eq(eventLogs.areaId, areaId) : undefined,
        unitId ? eq(eventLogs.unitId, unitId) : undefined,
        start ? gte(eventLogs.recordedAt, new Date(start)) : undefined,
        end ? lte(eventLogs.recordedAt, new Date(end)) : undefined,
      ))
      .orderBy(desc(eventLogs.recordedAt))
      .limit(limit)
      .offset(offset);

    return results;
  }

  /**
   * Log an impersonated action (special wrapper for clarity)
   */
  static async logImpersonatedAction(
    params: Omit<LogEventParams, 'actorType'> & { actingAdminId: string }
  ) {
    return this.logEvent({
      ...params,
      actorType: 'user', // The "actor" is the user being impersonated
    });
  }
}

