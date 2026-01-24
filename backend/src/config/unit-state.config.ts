/**
 * Unit State Configuration
 *
 * Defines state definitions, timeouts, and calculation rules for
 * refrigeration unit monitoring status.
 *
 * States follow the hierarchy:
 * - offline: No readings received within timeout period
 * - critical: Temperature severely out of range (alarm confirmed)
 * - warning: Temperature excursion detected (not yet confirmed)
 * - normal: Temperature within acceptable range
 */

/**
 * Unit dashboard states for quick status display
 */
export type UnitDashboardState = 'normal' | 'warning' | 'critical' | 'offline';

/**
 * Mapping from database unit status to dashboard state
 */
export const STATUS_TO_DASHBOARD_STATE: Record<string, UnitDashboardState> = {
  ok: 'normal',
  excursion: 'warning',
  alarm_active: 'critical',
  monitoring_interrupted: 'offline',
  manual_required: 'warning',
  restoring: 'normal',
  offline: 'offline',
};

/**
 * State priority for determining worst state (higher = more severe)
 */
export const STATE_PRIORITY: Record<UnitDashboardState, number> = {
  normal: 0,
  warning: 1,
  critical: 2,
  offline: 3,
};

/**
 * Configuration for offline detection
 */
export const OFFLINE_CONFIG = {
  /**
   * Time in milliseconds after which a unit is considered offline
   * if no readings have been received (15 minutes default)
   */
  OFFLINE_TIMEOUT_MS: 15 * 60 * 1000,

  /**
   * Time in milliseconds to check for stale units (5 minutes)
   */
  STALE_CHECK_INTERVAL_MS: 5 * 60 * 1000,

  /**
   * Grace period for newly created units before marking offline (1 hour)
   */
  NEW_UNIT_GRACE_PERIOD_MS: 60 * 60 * 1000,
};

/**
 * Configuration for state caching
 */
export const STATE_CACHE_CONFIG = {
  /**
   * TTL for cached state entries in milliseconds (2 minutes)
   * State is recalculated after TTL expires
   */
  CACHE_TTL_MS: 2 * 60 * 1000,

  /**
   * Maximum number of units to cache in memory
   * Prevents memory issues in large deployments
   */
  MAX_CACHED_UNITS: 10000,

  /**
   * Cleanup interval for expired cache entries (1 minute)
   */
  CLEANUP_INTERVAL_MS: 60 * 1000,
};

/**
 * Dashboard state metadata for UI rendering
 */
export const STATE_METADATA: Record<
  UnitDashboardState,
  {
    label: string;
    severity: 'info' | 'warning' | 'error';
    description: string;
  }
> = {
  normal: {
    label: 'Normal',
    severity: 'info',
    description: 'Temperature within acceptable range',
  },
  warning: {
    label: 'Warning',
    severity: 'warning',
    description: 'Temperature excursion detected - monitoring',
  },
  critical: {
    label: 'Critical',
    severity: 'error',
    description: 'Temperature alarm active - immediate attention required',
  },
  offline: {
    label: 'Offline',
    severity: 'error',
    description: 'No recent readings - check sensor connectivity',
  },
};
