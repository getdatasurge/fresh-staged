import type { EventCategory, EventSeverity } from './eventTypeMapper';
import { createTRPCClientInstance } from './trpc';

export interface ImpersonationContext {
  isImpersonating: boolean;
  sessionId?: string | null;
  actingUserId?: string | null;
}

export interface LogEventParams {
  event_type: string;
  category?: EventCategory;
  severity?: EventSeverity;
  title: string;
  organization_id: string;
  site_id?: string | null;
  area_id?: string | null;
  unit_id?: string | null;
  actor_id?: string | null;
  actor_type?: 'user' | 'system' | 'impersonated';
  event_data?: Record<string, any>;
  /** Optional: Pass impersonation context to use server-side audited logging */
  impersonationContext?: ImpersonationContext;
}

/**
 * Log an event to the event_logs table for audit trail.
 *
 * Uses tRPC to communicate with the backend.
 * Requires accessToken for authentication.
 */
export async function logEvent(
  params: LogEventParams,
  accessToken?: string,
): Promise<{ error: Error | null }> {
  try {
    if (!accessToken) {
      console.warn('logEvent called without accessToken - skipping audit log');
      return { error: new Error('Authentication required for audit logging') };
    }

    const trpc = createTRPCClientInstance(async () => accessToken);

    // Map legacy params to new tRPC input format
    await trpc.audit.logEvent.mutate({
      eventType: params.event_type,
      category: params.category || 'system',
      severity: params.severity || 'info',
      title: params.title,
      organizationId: params.organization_id,
      siteId: params.site_id || null,
      areaId: params.area_id || null,
      unitId: params.unit_id || null,
      eventData: params.event_data,
      impersonationSessionId: params.impersonationContext?.sessionId,
      actingAdminId: params.impersonationContext?.actingUserId,
    });

    return { error: null };
  } catch (err) {
    console.error('Failed to log event:', err);
    return { error: err instanceof Error ? err : new Error('Unknown error') };
  }
}

/**
 * Log an alert lifecycle event
 */
export async function logAlertEvent(
  action: 'created' | 'activated' | 'acknowledged' | 'resolved' | 'escalated',
  alertId: string,
  alertType: string,
  organizationId: string,
  unitId: string,
  siteId?: string | null,
  areaId?: string | null,
  actorId?: string | null,
  additionalData?: Record<string, any>,
): Promise<void> {
  const actionLabels: Record<string, string> = {
    created: 'Alert Created',
    activated: 'Alert Activated',
    acknowledged: 'Alert Acknowledged',
    resolved: 'Alert Resolved',
    escalated: 'Alert Escalated',
  };

  const severityMap: Record<string, EventSeverity> = {
    created: 'warning',
    activated: 'critical',
    acknowledged: 'info',
    resolved: 'success',
    escalated: 'critical',
  };

  await logEvent({
    event_type: `alert_${action}`,
    category: 'alert',
    severity: severityMap[action] || 'info',
    title: actionLabels[action] || `Alert ${action}`,
    organization_id: organizationId,
    site_id: siteId,
    area_id: areaId,
    unit_id: unitId,
    actor_id: actorId,
    actor_type: actorId ? 'user' : 'system',
    event_data: {
      alert_id: alertId,
      alert_type: alertType,
      ...additionalData,
    },
  });
}

/**
 * Log a manual temperature log event
 */
export async function logManualTempEvent(
  temperature: number,
  unitId: string,
  unitName: string,
  organizationId: string,
  siteId?: string | null,
  areaId?: string | null,
  actorId?: string | null,
  isInRange?: boolean,
): Promise<void> {
  await logEvent({
    event_type: 'manual_temp_logged',
    category: 'compliance',
    severity: isInRange === false ? 'warning' : 'success',
    title: `Temperature Logged: ${temperature}°F`,
    organization_id: organizationId,
    site_id: siteId,
    area_id: areaId,
    unit_id: unitId,
    actor_id: actorId,
    actor_type: 'user',
    event_data: {
      temperature,
      unit_name: unitName,
      is_in_range: isInRange,
    },
  });
}

/**
 * Log a settings change event
 */
export async function logSettingsEvent(
  settingsType: 'unit' | 'alert_rules' | 'notification' | 'thresholds',
  organizationId: string,
  actorId: string,
  changes: Record<string, { from: unknown; to: unknown }>,
  unitId?: string | null,
  siteId?: string | null,
  areaId?: string | null,
): Promise<void> {
  const typeLabels: Record<string, string> = {
    unit: 'Unit Settings Updated',
    alert_rules: 'Alert Rules Updated',
    notification: 'Notification Settings Updated',
    thresholds: 'Temperature Thresholds Updated',
  };

  await logEvent({
    event_type: `${settingsType}_settings_updated`,
    category: 'settings',
    severity: 'info',
    title: typeLabels[settingsType] || 'Settings Updated',
    organization_id: organizationId,
    site_id: siteId,
    area_id: areaId,
    unit_id: unitId,
    actor_id: actorId,
    actor_type: 'user',
    event_data: { changes },
  });
}
