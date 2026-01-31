import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { alerts, units, areas, sites, organizations } from '../db/schema/index.js';

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
 * Grouped alert data for hierarchical email display
 * Alerts are organized by site, then by unit within each site
 */
export interface GroupedDigestData {
  sites: Array<{
    siteId: string;
    siteName: string;
    units: Array<{
      unitId: string;
      unitName: string;
      alerts: DigestAlert[];
    }>;
  }>;
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
    endDate: Date,
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
          lte(alerts.triggeredAt, endDate),
        ),
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

  /**
   * Build grouped digest data for hierarchical email display
   * Alerts are organized by site, then by unit within each site
   * Supports optional site filtering via siteIds parameter
   *
   * @param userId - User requesting the digest
   * @param organizationId - Organization ID
   * @param period - 'daily' or 'weekly'
   * @param startDate - Start of period
   * @param endDate - End of period
   * @param siteIds - Optional array of site IDs to filter (null = all sites)
   */
  async buildGroupedDigestData(
    userId: string,
    organizationId: string,
    period: 'daily' | 'weekly',
    startDate: Date,
    endDate: Date,
    siteIds: string[] | null = null,
  ): Promise<GroupedDigestData> {
    // Build where conditions
    const conditions = [
      eq(sites.organizationId, organizationId),
      gte(alerts.triggeredAt, startDate),
      lte(alerts.triggeredAt, endDate),
    ];

    // Add site filter if provided
    if (siteIds && siteIds.length > 0) {
      conditions.push(inArray(sites.id, siteIds));
    }

    // Query alerts with joins to get unit and site details
    const alertResults = await db
      .select({
        id: alerts.id,
        severity: alerts.severity,
        message: alerts.message,
        triggeredAt: alerts.triggeredAt,
        status: alerts.status,
        unitId: units.id,
        unitName: units.name,
        siteId: sites.id,
        siteName: sites.name,
      })
      .from(alerts)
      .innerJoin(units, eq(alerts.unitId, units.id))
      .innerJoin(areas, eq(units.areaId, areas.id))
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(and(...conditions))
      .orderBy(desc(alerts.triggeredAt))
      .limit(50);

    // Build summary statistics from all alerts
    const summary: DigestSummary = {
      total: alertResults.length,
      critical: alertResults.filter((a) => a.severity === 'critical').length,
      warning: alertResults.filter((a) => a.severity === 'warning').length,
      info: alertResults.filter((a) => a.severity === 'info').length,
      resolved: alertResults.filter((a) => a.status === 'resolved').length,
    };

    // Group alerts by site, then by unit
    const siteMap = new Map<
      string,
      {
        siteId: string;
        siteName: string;
        units: Map<
          string,
          {
            unitId: string;
            unitName: string;
            alerts: DigestAlert[];
          }
        >;
      }
    >();

    for (const row of alertResults) {
      // Get or create site entry
      if (!siteMap.has(row.siteId)) {
        siteMap.set(row.siteId, {
          siteId: row.siteId,
          siteName: row.siteName,
          units: new Map(),
        });
      }
      const site = siteMap.get(row.siteId)!;

      // Get or create unit entry
      if (!site.units.has(row.unitId)) {
        site.units.set(row.unitId, {
          unitId: row.unitId,
          unitName: row.unitName,
          alerts: [],
        });
      }
      const unit = site.units.get(row.unitId)!;

      // Add alert to unit
      unit.alerts.push({
        id: row.id,
        severity: row.severity as 'critical' | 'warning' | 'info',
        message: row.message,
        triggeredAt: row.triggeredAt,
        unitName: row.unitName,
        siteName: row.siteName,
        status: row.status,
      });
    }

    // Convert maps to arrays
    const groupedSites = Array.from(siteMap.values()).map((site) => ({
      siteId: site.siteId,
      siteName: site.siteName,
      units: Array.from(site.units.values()),
    }));

    // Get organization name
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const organizationName = org?.name || 'Your Organization';

    return {
      sites: groupedSites,
      summary,
      organizationName,
      period,
      startDate,
      endDate,
    };
  }
}
