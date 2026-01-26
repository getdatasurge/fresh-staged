/**
 * Organization Stats Service
 *
 * Aggregates organization-level statistics for dashboard display. Provides:
 * - Unit counts by state (normal, warning, critical, offline)
 * - Compliance percentage based on temperature readings
 * - Alert counts by status (pending, acknowledged, resolved)
 * - In-memory caching with configurable TTL
 *
 * Usage:
 * ```typescript
 * const statsService = new OrganizationStatsService(unitStateService);
 *
 * // Get organization stats for dashboard
 * const stats = await statsService.getOrganizationStats(organizationId);
 *
 * // Force refresh (bypasses cache)
 * const freshStats = await statsService.getOrganizationStats(organizationId, true);
 * ```
 */

import { and, count, eq, gte, sql } from 'drizzle-orm'
import type { UnitDashboardState } from '../config/unit-state.config.js'
import { db } from '../db/client.js'
import { alerts, areas, sensorReadings, sites, units } from '../db/schema/index.js'
import type { UnitStateService } from './unit-state.service.js'

/**
 * Configuration for organization stats caching
 */
export const ORG_STATS_CACHE_CONFIG = {
  /**
   * TTL for cached stats in milliseconds (30 seconds)
   * Short TTL ensures dashboard shows near-real-time data
   */
  CACHE_TTL_MS: 30 * 1000,

  /**
   * Maximum number of organizations to cache
   */
  MAX_CACHED_ORGS: 1000,

  /**
   * Cleanup interval for expired cache entries (15 seconds)
   */
  CLEANUP_INTERVAL_MS: 15 * 1000,

  /**
   * Time window for compliance calculation (24 hours)
   */
  COMPLIANCE_WINDOW_MS: 24 * 60 * 60 * 1000,
};

/**
 * Unit counts by dashboard state
 */
export interface UnitStateCounts {
  total: number;
  normal: number;
  warning: number;
  critical: number;
  offline: number;
}

/**
 * Alert counts by status
 */
export interface AlertStatusCounts {
  pending: number;
  acknowledged: number;
  resolved: number;
  total: number;
}

/**
 * Complete organization statistics
 */
export interface OrganizationStats {
  organizationId: string;
  unitCounts: UnitStateCounts;
  alertCounts: AlertStatusCounts;
  compliancePercentage: number;
  memberCount: number;
  siteCount: number;
  worstState: UnitDashboardState;
  lastUpdated: Date;
}

/**
 * Cached stats entry
 */
interface CachedStats {
  stats: OrganizationStats;
  expiresAt: Date;
}

/**
 * OrganizationStatsService class for aggregating organization-level stats
 */
export class OrganizationStatsService {
  private unitStateService: UnitStateService | null;
  private cache: Map<string, CachedStats> = new Map();
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(unitStateService?: UnitStateService) {
    this.unitStateService = unitStateService || null;

    // Start cache cleanup interval
    this.cleanupIntervalId = setInterval(
      () => this.cleanupExpiredCache(),
      ORG_STATS_CACHE_CONFIG.CLEANUP_INTERVAL_MS
    );

    console.log(
      '[OrganizationStatsService] Initialized with cache TTL:',
      ORG_STATS_CACHE_CONFIG.CACHE_TTL_MS,
      'ms'
    );
  }

  /**
   * Get aggregated stats for an organization
   *
   * @param organizationId - Organization UUID
   * @param forceRefresh - Bypass cache and fetch fresh data
   * @returns Organization stats
   */
  async getOrganizationStats(
    organizationId: string,
    forceRefresh = false
  ): Promise<OrganizationStats> {
    // Check cache unless forcing refresh
    if (!forceRefresh) {
      const cached = this.cache.get(organizationId);
      if (cached && cached.expiresAt.getTime() > Date.now()) {
        return cached.stats;
      }
    }

    // Fetch fresh data
    const [unitCounts, alertCounts, compliancePercentage, memberCount, siteCount] = await Promise.all([
      this.calculateUnitCounts(organizationId),
      this.calculateAlertCounts(organizationId),
      this.calculateCompliancePercentage(organizationId),
      this.calculateMemberCount(organizationId),
      this.calculateSiteCount(organizationId),
    ]);

    const worstState = this.determineWorstState(unitCounts);

    const stats: OrganizationStats = {
      organizationId,
      unitCounts,
      alertCounts,
      compliancePercentage,
      memberCount,
      siteCount,
      worstState,
      lastUpdated: new Date(),
    };

    // Update cache
    this.setCacheEntry(organizationId, stats);

    return stats;
  }

  /**
   * Calculate total site count for the organization
   */
  async calculateSiteCount(organizationId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(sql`sites`)
      .where(and(sql`organization_id = ${organizationId}`, sql`is_active = true`));
    
    return Number(result?.count || 0);
  }

  /**
   * Calculate total member count for the organization
   */
  async calculateMemberCount(organizationId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(sql`user_roles`)
      .where(sql`organization_id = ${organizationId}`);
    
    return Number(result?.count || 0);
  }

  /**
   * Calculate unit counts by dashboard state
   *
   * Uses UnitStateService for accurate state calculation including offline detection.
   */
  async calculateUnitCounts(organizationId: string): Promise<UnitStateCounts> {
    // If UnitStateService is available, use it for accurate state calculation
    if (this.unitStateService) {
      const statesByStie = await this.unitStateService.getOrganizationUnitStates(organizationId);

      const counts: UnitStateCounts = {
        total: 0,
        normal: 0,
        warning: 0,
        critical: 0,
        offline: 0,
      };

      for (const unitStates of statesByStie.values()) {
        for (const unitState of unitStates) {
          counts.total++;
          counts[unitState.state]++;
        }
      }

      return counts;
    }

    // Fallback: Query database directly without offline detection
    const unitData = await db
      .select({
        status: units.status,
        count: count(),
      })
      .from(units)
      .innerJoin(areas, eq(units.areaId, areas.id))
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(
        and(
          eq(sites.organizationId, organizationId),
          eq(units.isActive, true)
        )
      )
      .groupBy(units.status);

    const counts: UnitStateCounts = {
      total: 0,
      normal: 0,
      warning: 0,
      critical: 0,
      offline: 0,
    };

    // Map database status to dashboard state
    const STATUS_MAP: Record<string, keyof UnitStateCounts> = {
      ok: 'normal',
      restoring: 'normal',
      excursion: 'warning',
      manual_required: 'warning',
      alarm_active: 'critical',
      monitoring_interrupted: 'offline',
      offline: 'offline',
    };

    for (const row of unitData) {
      const dashboardState = STATUS_MAP[row.status] || 'normal';
      const countValue = Number(row.count);
      counts[dashboardState] += countValue;
      counts.total += countValue;
    }

    return counts;
  }

  /**
   * Calculate alert counts by status
   *
   * Groups alerts into pending (active), acknowledged, and resolved.
   */
  async calculateAlertCounts(organizationId: string): Promise<AlertStatusCounts> {
    // Get alerts for units in this organization
    const alertData = await db
      .select({
        status: alerts.status,
        count: count(),
      })
      .from(alerts)
      .innerJoin(units, eq(alerts.unitId, units.id))
      .innerJoin(areas, eq(units.areaId, areas.id))
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(eq(sites.organizationId, organizationId))
      .groupBy(alerts.status);

    const counts: AlertStatusCounts = {
      pending: 0,
      acknowledged: 0,
      resolved: 0,
      total: 0,
    };

    // Map alert statuses to summary categories
    for (const row of alertData) {
      const countValue = Number(row.count);
      counts.total += countValue;

      switch (row.status) {
        case 'active':
        case 'escalated':
          counts.pending += countValue;
          break;
        case 'acknowledged':
          counts.acknowledged += countValue;
          break;
        case 'resolved':
          counts.resolved += countValue;
          break;
      }
    }

    return counts;
  }

  /**
   * Calculate compliance percentage
   *
   * Compliance = percentage of readings within threshold in the last 24 hours.
   * 100% if no readings exist (new organization).
   */
  async calculateCompliancePercentage(organizationId: string): Promise<number> {
    const windowStart = new Date(Date.now() - ORG_STATS_CACHE_CONFIG.COMPLIANCE_WINDOW_MS);

    // Count total readings and in-range readings for the organization
    const [result] = await db
      .select({
        totalReadings: count(),
        inRangeReadings: sql<number>`
          COUNT(CASE
            WHEN ${sensorReadings.temperature} >= ${units.tempMin}
            AND ${sensorReadings.temperature} <= ${units.tempMax}
            THEN 1
          END)
        `.mapWith(Number),
      })
      .from(sensorReadings)
      .innerJoin(units, eq(sensorReadings.unitId, units.id))
      .innerJoin(areas, eq(units.areaId, areas.id))
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(
        and(
          eq(sites.organizationId, organizationId),
          gte(sensorReadings.recordedAt, windowStart)
        )
      );

    if (!result || Number(result.totalReadings) === 0) {
      // No readings in the window - assume 100% compliance (new organization)
      return 100;
    }

    const totalReadings = Number(result.totalReadings);
    const inRangeReadings = result.inRangeReadings;

    // Calculate percentage rounded to 1 decimal place
    const percentage = (inRangeReadings / totalReadings) * 100;
    return Math.round(percentage * 10) / 10;
  }

  /**
   * Determine the worst state across all units
   *
   * Higher priority = worse state. Used for organization health indicator.
   */
  determineWorstState(counts: UnitStateCounts): UnitDashboardState {
    if (counts.offline > 0) return 'offline';
    if (counts.critical > 0) return 'critical';
    if (counts.warning > 0) return 'warning';
    return 'normal';
  }

  /**
   * Invalidate cached stats for an organization
   *
   * Call this after events that change stats (new readings, alerts, etc.)
   */
  invalidateCache(organizationId: string): void {
    this.cache.delete(organizationId);
    console.log(`[OrganizationStatsService] Cache invalidated for org ${organizationId}`);
  }

  /**
   * Invalidate all cached stats
   */
  invalidateAllCaches(): void {
    this.cache.clear();
    console.log('[OrganizationStatsService] All caches invalidated');
  }

  /**
   * Set cache entry with TTL
   */
  private setCacheEntry(organizationId: string, stats: OrganizationStats): void {
    // Enforce max cache size
    if (
      this.cache.size >= ORG_STATS_CACHE_CONFIG.MAX_CACHED_ORGS &&
      !this.cache.has(organizationId)
    ) {
      // Evict oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(organizationId, {
      stats,
      expiresAt: new Date(Date.now() + ORG_STATS_CACHE_CONFIG.CACHE_TTL_MS),
    });
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [orgId, cached] of this.cache.entries()) {
      if (cached.expiresAt.getTime() < now) {
        this.cache.delete(orgId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[OrganizationStatsService] Cleaned up ${removedCount} expired cache entries`);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
  } {
    return {
      size: this.cache.size,
      maxSize: ORG_STATS_CACHE_CONFIG.MAX_CACHED_ORGS,
    };
  }

  /**
   * Stop the service and cleanup resources
   */
  stop(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.cache.clear();
    console.log('[OrganizationStatsService] Stopped and cleaned up');
  }
}

/**
 * Singleton OrganizationStatsService instance
 */
let instance: OrganizationStatsService | null = null;

/**
 * Set the singleton OrganizationStatsService instance
 */
export function setOrganizationStatsService(service: OrganizationStatsService): void {
  instance = service;
}

/**
 * Get the singleton OrganizationStatsService instance
 */
export function getOrganizationStatsService(): OrganizationStatsService | null {
  return instance;
}
