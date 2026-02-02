/**
 * Unit State Management Service
 *
 * Tracks refrigeration unit states for dashboard display. Provides:
 * - State calculation from recent readings and database status
 * - In-memory caching for fast dashboard access
 * - Real-time state change notifications via Socket.IO
 * - Offline detection for units without recent readings
 *
 * State Hierarchy:
 * - offline: No readings within timeout period
 * - critical: Confirmed temperature alarm (alarm_active status)
 * - warning: Temperature excursion detected (excursion status)
 * - normal: Temperature within range (ok/restoring status)
 *
 * Usage:
 * ```typescript
 * const stateService = new UnitStateService(socketService);
 *
 * // Get current state for dashboard
 * const state = await stateService.getUnitState(unitId);
 *
 * // Update state after reading ingestion
 * await stateService.updateUnitState(unitId, organizationId);
 *
 * // Get all states for a site
 * const states = await stateService.getSiteUnitStates(siteId, organizationId);
 * ```
 */

import { eq, and } from 'drizzle-orm';
import {
  type UnitDashboardState,
  STATUS_TO_DASHBOARD_STATE,
  STATE_PRIORITY,
  OFFLINE_CONFIG,
  STATE_CACHE_CONFIG,
} from '../config/unit-state.config.js';
import { db } from '../db/client.js';
import { units, areas, sites } from '../db/schema/index.js';
import { logger } from '../utils/logger.js';
import type { SocketService } from './socket.service.js';

const log = logger.child({ service: 'unit-state' });

/**
 * Cached unit state entry
 */
interface CachedState {
  state: UnitDashboardState;
  lastReadingAt: Date | null;
  lastTemperature: number | null;
  updatedAt: Date;
  expiresAt: Date;
}

/**
 * Unit state with context for dashboard display
 */
export interface UnitStateInfo {
  unitId: string;
  state: UnitDashboardState;
  lastReadingAt: Date | null;
  lastTemperature: number | null;
  isOnline: boolean;
  dbStatus: string;
}

/**
 * State change event payload for Socket.IO
 */
export interface StateChangeEvent {
  unitId: string;
  previousState: UnitDashboardState;
  newState: UnitDashboardState;
  timestamp: string;
  reason: string;
}

/**
 * UnitStateService class for managing unit states
 */
export class UnitStateService {
  private socketService: SocketService | null;
  private cache: Map<string, CachedState> = new Map();
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(socketService?: SocketService) {
    this.socketService = socketService || null;

    // Start cache cleanup interval
    this.cleanupIntervalId = setInterval(
      () => this.cleanupExpiredCache(),
      STATE_CACHE_CONFIG.CLEANUP_INTERVAL_MS,
    );

    log.info({ cacheTtlMs: STATE_CACHE_CONFIG.CACHE_TTL_MS }, 'Initialized with cache TTL');
  }

  /**
   * Calculate dashboard state from database status and reading timestamp
   *
   * @param dbStatus - Database unit status (ok, excursion, alarm_active, etc.)
   * @param lastReadingAt - Timestamp of last reading
   * @param createdAt - Unit creation timestamp for grace period
   * @returns Dashboard state
   */
  calculateState(
    dbStatus: string,
    lastReadingAt: Date | null,
    createdAt?: Date,
  ): UnitDashboardState {
    const now = Date.now();

    // Check for offline condition first (no readings within timeout)
    if (lastReadingAt) {
      const timeSinceReading = now - lastReadingAt.getTime();
      if (timeSinceReading > OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS) {
        return 'offline';
      }
    } else {
      // No readings ever - check if unit is new (within grace period)
      if (createdAt) {
        const timeSinceCreation = now - createdAt.getTime();
        if (timeSinceCreation > OFFLINE_CONFIG.NEW_UNIT_GRACE_PERIOD_MS) {
          return 'offline';
        }
      } else {
        // No creation date, assume offline
        return 'offline';
      }
    }

    // Map database status to dashboard state
    const dashboardState = STATUS_TO_DASHBOARD_STATE[dbStatus];
    if (dashboardState) {
      return dashboardState;
    }

    // Unknown status defaults to normal
    log.warn({ dbStatus }, 'Unknown unit status, defaulting to normal');
    return 'normal';
  }

  /**
   * Get current state for a single unit
   *
   * Checks cache first, falls back to database if cache miss or expired.
   *
   * @param unitId - Unit UUID
   * @returns Unit state info or null if unit not found
   */
  async getUnitState(unitId: string): Promise<UnitStateInfo | null> {
    // Check cache first
    const cached = this.cache.get(unitId);
    if (cached && cached.expiresAt.getTime() > Date.now()) {
      return {
        unitId,
        state: cached.state,
        lastReadingAt: cached.lastReadingAt,
        lastTemperature: cached.lastTemperature,
        isOnline: cached.state !== 'offline',
        dbStatus: '', // Not available from cache
      };
    }

    // Cache miss or expired - fetch from database
    const [unitData] = await db
      .select({
        id: units.id,
        status: units.status,
        lastReadingAt: units.lastReadingAt,
        lastTemperature: units.lastTemperature,
        createdAt: units.createdAt,
      })
      .from(units)
      .where(eq(units.id, unitId))
      .limit(1);

    if (!unitData) {
      return null;
    }

    const state = this.calculateState(unitData.status, unitData.lastReadingAt, unitData.createdAt);

    // Update cache
    this.setCacheEntry(unitId, {
      state,
      lastReadingAt: unitData.lastReadingAt,
      lastTemperature: unitData.lastTemperature,
    });

    return {
      unitId,
      state,
      lastReadingAt: unitData.lastReadingAt,
      lastTemperature: unitData.lastTemperature,
      isOnline: state !== 'offline',
      dbStatus: unitData.status,
    };
  }

  /**
   * Get states for all units in a site
   *
   * Optimized batch query for dashboard rendering.
   *
   * @param siteId - Site UUID
   * @param organizationId - Organization UUID for access control
   * @returns Array of unit states
   */
  async getSiteUnitStates(siteId: string, organizationId: string): Promise<UnitStateInfo[]> {
    // Verify site belongs to organization and get all units
    const unitData = await db
      .select({
        id: units.id,
        status: units.status,
        lastReadingAt: units.lastReadingAt,
        lastTemperature: units.lastTemperature,
        createdAt: units.createdAt,
      })
      .from(units)
      .innerJoin(areas, eq(units.areaId, areas.id))
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(
        and(
          eq(sites.id, siteId),
          eq(sites.organizationId, organizationId),
          eq(units.isActive, true),
        ),
      );

    return unitData.map((unit) => {
      // Check cache first
      const cached = this.cache.get(unit.id);
      if (cached && cached.expiresAt.getTime() > Date.now()) {
        return {
          unitId: unit.id,
          state: cached.state,
          lastReadingAt: cached.lastReadingAt,
          lastTemperature: cached.lastTemperature,
          isOnline: cached.state !== 'offline',
          dbStatus: unit.status,
        };
      }

      const state = this.calculateState(unit.status, unit.lastReadingAt, unit.createdAt);

      // Update cache
      this.setCacheEntry(unit.id, {
        state,
        lastReadingAt: unit.lastReadingAt,
        lastTemperature: unit.lastTemperature,
      });

      return {
        unitId: unit.id,
        state,
        lastReadingAt: unit.lastReadingAt,
        lastTemperature: unit.lastTemperature,
        isOnline: state !== 'offline',
        dbStatus: unit.status,
      };
    });
  }

  /**
   * Get states for all units in an organization
   *
   * Optimized batch query for organization-wide dashboard.
   *
   * @param organizationId - Organization UUID
   * @returns Array of unit states grouped by site
   */
  async getOrganizationUnitStates(organizationId: string): Promise<Map<string, UnitStateInfo[]>> {
    const unitData = await db
      .select({
        id: units.id,
        status: units.status,
        lastReadingAt: units.lastReadingAt,
        lastTemperature: units.lastTemperature,
        createdAt: units.createdAt,
        siteId: sites.id,
      })
      .from(units)
      .innerJoin(areas, eq(units.areaId, areas.id))
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(and(eq(sites.organizationId, organizationId), eq(units.isActive, true)));

    const statesBySite = new Map<string, UnitStateInfo[]>();

    for (const unit of unitData) {
      const state = this.calculateState(unit.status, unit.lastReadingAt, unit.createdAt);

      // Update cache
      this.setCacheEntry(unit.id, {
        state,
        lastReadingAt: unit.lastReadingAt,
        lastTemperature: unit.lastTemperature,
      });

      const stateInfo: UnitStateInfo = {
        unitId: unit.id,
        state,
        lastReadingAt: unit.lastReadingAt,
        lastTemperature: unit.lastTemperature,
        isOnline: state !== 'offline',
        dbStatus: unit.status,
      };

      if (!statesBySite.has(unit.siteId)) {
        statesBySite.set(unit.siteId, []);
      }
      statesBySite.get(unit.siteId)!.push(stateInfo);
    }

    return statesBySite;
  }

  /**
   * Update unit state after reading ingestion
   *
   * Recalculates state from database and emits change event if state changed.
   *
   * @param unitId - Unit UUID
   * @param organizationId - Organization UUID for Socket.IO room
   * @returns New state info
   */
  async updateUnitState(unitId: string, organizationId: string): Promise<UnitStateInfo | null> {
    // Get previous cached state
    const previousCached = this.cache.get(unitId);
    const previousState = previousCached?.state || 'normal';

    // Fetch current state from database
    const [unitData] = await db
      .select({
        id: units.id,
        status: units.status,
        lastReadingAt: units.lastReadingAt,
        lastTemperature: units.lastTemperature,
        createdAt: units.createdAt,
      })
      .from(units)
      .where(eq(units.id, unitId))
      .limit(1);

    if (!unitData) {
      // Remove from cache if unit was deleted
      this.cache.delete(unitId);
      return null;
    }

    const newState = this.calculateState(
      unitData.status,
      unitData.lastReadingAt,
      unitData.createdAt,
    );

    // Update cache
    this.setCacheEntry(unitId, {
      state: newState,
      lastReadingAt: unitData.lastReadingAt,
      lastTemperature: unitData.lastTemperature,
    });

    // Emit state change event if state changed
    if (previousState !== newState && this.socketService) {
      const changeEvent: StateChangeEvent = {
        unitId,
        previousState,
        newState,
        timestamp: new Date().toISOString(),
        reason: this.getStateChangeReason(previousState, newState, unitData.status),
      };

      this.socketService.emitToOrg(organizationId, 'unit:state:changed', changeEvent);
      this.socketService.emitToUnit(organizationId, unitId, 'unit:state:changed', changeEvent);

      log.info({ unitId, previousState, newState }, 'State change for unit');
    }

    return {
      unitId,
      state: newState,
      lastReadingAt: unitData.lastReadingAt,
      lastTemperature: unitData.lastTemperature,
      isOnline: newState !== 'offline',
      dbStatus: unitData.status,
    };
  }

  /**
   * Batch update states for multiple units
   *
   * Used after bulk reading ingestion.
   *
   * @param unitIds - Array of unit UUIDs
   * @param organizationId - Organization UUID
   * @returns Array of updated state infos
   */
  async updateMultipleUnitStates(
    unitIds: string[],
    organizationId: string,
  ): Promise<UnitStateInfo[]> {
    if (unitIds.length === 0) {
      return [];
    }

    const results: UnitStateInfo[] = [];

    for (const unitId of unitIds) {
      const stateInfo = await this.updateUnitState(unitId, organizationId);
      if (stateInfo) {
        results.push(stateInfo);
      }
    }

    return results;
  }

  /**
   * Check all units for offline status
   *
   * Called periodically to detect units that have gone offline.
   * Updates cache and emits state change events.
   *
   * @param organizationId - Organization UUID to check
   * @returns Number of units marked as offline
   */
  async checkOfflineUnits(organizationId: string): Promise<number> {
    const offlineCutoff = new Date(Date.now() - OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS);

    // Find units that have readings but are stale
    const staleUnits = await db
      .select({
        id: units.id,
        status: units.status,
        lastReadingAt: units.lastReadingAt,
        lastTemperature: units.lastTemperature,
        createdAt: units.createdAt,
      })
      .from(units)
      .innerJoin(areas, eq(units.areaId, areas.id))
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(and(eq(sites.organizationId, organizationId), eq(units.isActive, true)));

    let offlineCount = 0;

    for (const unit of staleUnits) {
      // Check if unit should be offline
      const shouldBeOffline = unit.lastReadingAt && unit.lastReadingAt < offlineCutoff;

      if (!shouldBeOffline) {
        continue;
      }

      // Get previous cached state
      const previousCached = this.cache.get(unit.id);
      const previousState = previousCached?.state;

      // Calculate new state (will be offline due to stale reading)
      const newState = this.calculateState(unit.status, unit.lastReadingAt, unit.createdAt);

      if (newState === 'offline' && previousState !== 'offline') {
        offlineCount++;

        // Update cache
        this.setCacheEntry(unit.id, {
          state: newState,
          lastReadingAt: unit.lastReadingAt,
          lastTemperature: unit.lastTemperature,
        });

        // Emit state change event
        if (this.socketService) {
          const changeEvent: StateChangeEvent = {
            unitId: unit.id,
            previousState: previousState || 'normal',
            newState: 'offline',
            timestamp: new Date().toISOString(),
            reason: 'No readings received within timeout period',
          };

          this.socketService.emitToOrg(organizationId, 'unit:state:changed', changeEvent);
          this.socketService.emitToUnit(organizationId, unit.id, 'unit:state:changed', changeEvent);
        }
      }
    }

    if (offlineCount > 0) {
      log.info({ offlineCount, organizationId }, 'Detected unit(s) went offline');
    }

    return offlineCount;
  }

  /**
   * Get aggregate state summary for a site
   *
   * @param siteId - Site UUID
   * @param organizationId - Organization UUID
   * @returns Summary of unit states
   */
  async getSiteStateSummary(
    siteId: string,
    organizationId: string,
  ): Promise<{
    total: number;
    normal: number;
    warning: number;
    critical: number;
    offline: number;
    worstState: UnitDashboardState;
  }> {
    const states = await this.getSiteUnitStates(siteId, organizationId);

    const summary = {
      total: states.length,
      normal: 0,
      warning: 0,
      critical: 0,
      offline: 0,
      worstState: 'normal' as UnitDashboardState,
    };

    let worstPriority = 0;

    for (const stateInfo of states) {
      summary[stateInfo.state]++;

      const priority = STATE_PRIORITY[stateInfo.state];
      if (priority > worstPriority) {
        worstPriority = priority;
        summary.worstState = stateInfo.state;
      }
    }

    return summary;
  }

  /**
   * Get state change reason for logging/display
   */
  private getStateChangeReason(
    previousState: UnitDashboardState,
    newState: UnitDashboardState,
    dbStatus: string,
  ): string {
    if (newState === 'offline') {
      return 'No readings received within timeout period';
    }

    if (newState === 'critical') {
      return 'Temperature alarm confirmed';
    }

    if (newState === 'warning') {
      return 'Temperature excursion detected';
    }

    if (newState === 'normal' && previousState === 'warning') {
      return 'Temperature returned to normal range';
    }

    if (newState === 'normal' && previousState === 'critical') {
      return 'Alarm resolved - temperature normalized';
    }

    if (newState === 'normal' && previousState === 'offline') {
      return 'Unit came back online';
    }

    return `Status changed to ${dbStatus}`;
  }

  /**
   * Set cache entry with TTL
   */
  private setCacheEntry(unitId: string, data: Omit<CachedState, 'updatedAt' | 'expiresAt'>): void {
    // Enforce max cache size
    if (this.cache.size >= STATE_CACHE_CONFIG.MAX_CACHED_UNITS && !this.cache.has(unitId)) {
      // Evict oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const now = new Date();
    this.cache.set(unitId, {
      ...data,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + STATE_CACHE_CONFIG.CACHE_TTL_MS),
    });
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [unitId, cached] of this.cache.entries()) {
      if (cached.expiresAt.getTime() < now) {
        this.cache.delete(unitId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      log.info({ removedCount }, 'Cleaned up expired cache entries');
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      maxSize: STATE_CACHE_CONFIG.MAX_CACHED_UNITS,
      hitRate: 0, // Would need hit/miss counters for accurate tracking
    };
  }

  /**
   * Clear cache (for testing or forced refresh)
   */
  clearCache(): void {
    this.cache.clear();
    log.info('Cache cleared');
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
    log.info('Stopped and cleaned up');
  }
}

/**
 * Singleton UnitStateService instance
 */
let instance: UnitStateService | null = null;

/**
 * Set the singleton UnitStateService instance
 */
export function setUnitStateService(service: UnitStateService): void {
  instance = service;
}

/**
 * Get the singleton UnitStateService instance
 */
export function getUnitStateService(): UnitStateService | null {
  return instance;
}
