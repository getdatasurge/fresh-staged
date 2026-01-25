/**
 * Audit Service
 * Handles event logging and audit trails in the backend.
 * Replaces Supabase 'log_impersonated_action' RPC and frontend direct inserts.
 */
import { db } from "../db/client.js"
import { eventLogs } from "../db/schema/index.js"

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
      eventData: JSON.stringify(eventData || {}),
      // Impersonation columns
      actingUserId: actingAdminId || null,
      impersonationSessionId: impersonationSessionId || null,
      wasImpersonated: !!actingAdminId,
      recordedAt: new Date(),
    });

    return { success: true };
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
