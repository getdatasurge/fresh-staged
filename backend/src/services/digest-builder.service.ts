import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  alerts,
  units,
  areas,
  sites,
  organizations,
} from '../db/schema/index.js';

/**
 * Alert data for digest emails
 */
export interface DigestAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string | null;
  triggeredAt: Date;
  unitName: string;
  siteName: string;
  status: string;
}

/**
 * Summary statistics for digest
 */
export interface DigestSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  resolved: number;
}

/**
 * Complete digest data package
 */
export interface DigestData {
  alerts: DigestAlert[];
  summary: DigestSummary;
  organizationName: string;
  period: 'daily' | 'weekly';
  startDate: Date;
  endDate: Date;
}

/**
 * Service for building email digest data from alert records
 */
export class DigestBuilderService {
  /**
   * Build digest data for a specific time period
   * Queries alerts within date range, joins with units and sites for context
   * Limits to 50 alerts to prevent huge emails
   */
  async buildDigestData(
    userId: string,
    organizationId: string,
    period: 'daily' | 'weekly',
    startDate: Date,
    endDate: Date
  ): Promise<DigestData> {
    // Query alerts with joins to get unit and site names
    const alertResults = await db
      .select({
        id: alerts.id,
        severity: alerts.severity,
        message: alerts.message,
        triggeredAt: alerts.triggeredAt,
        status: alerts.status,
        unitName: units.name,
        siteName: sites.name,
      })
      .from(alerts)
      .innerJoin(units, eq(alerts.unitId, units.id))
      .innerJoin(areas, eq(units.areaId, areas.id))
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(
        and(
          eq(sites.organizationId, organizationId),
          gte(alerts.triggeredAt, startDate),
          lte(alerts.triggeredAt, endDate)
        )
      )
      .orderBy(desc(alerts.triggeredAt))
      .limit(50);

    // Transform to DigestAlert format
    const digestAlerts: DigestAlert[] = alertResults.map((row) => ({
      id: row.id,
      severity: row.severity as 'critical' | 'warning' | 'info',
      message: row.message,
      triggeredAt: row.triggeredAt,
      unitName: row.unitName,
      siteName: row.siteName,
      status: row.status,
    }));

    // Build summary statistics
    const summary: DigestSummary = {
      total: digestAlerts.length,
      critical: digestAlerts.filter((a) => a.severity === 'critical').length,
      warning: digestAlerts.filter((a) => a.severity === 'warning').length,
      info: digestAlerts.filter((a) => a.severity === 'info').length,
      resolved: digestAlerts.filter((a) => a.status === 'resolved').length,
    };

    // Get organization name
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const organizationName = org?.name || 'Your Organization';

    return {
      alerts: digestAlerts,
      summary,
      organizationName,
      period,
      startDate,
      endDate,
    };
  }
}
