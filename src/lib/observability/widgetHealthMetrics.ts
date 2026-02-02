/**
 * Widget Health Metrics
 *
 * Observability counters and event tracking for widget health states.
 * Tracks failures per org for diagnostics and alerting.
 */

import type {
  FailingLayer,
  WidgetHealthStatus,
} from '@/features/dashboard-layout/types/widgetState';

/**
 * Widget health change event
 */
export interface WidgetHealthEvent {
  eventType: 'widget_health_change';
  widgetId: string;
  entityId: string;
  entityType: 'unit' | 'site';
  orgId: string;
  previousStatus: WidgetHealthStatus | null;
  currentStatus: WidgetHealthStatus;
  failingLayer: FailingLayer | null;
  payloadType: string | null;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const CRITICAL_STATUSES: ReadonlySet<WidgetHealthStatus> = new Set(['error', 'offline']);

const DEFAULT_HEALTH_COUNTERS: Record<WidgetHealthStatus, number> = {
  healthy: 0,
  degraded: 0,
  stale: 0,
  error: 0,
  no_data: 0,
  misconfigured: 0,
  permission_denied: 0,
  not_configured: 0,
  loading: 0,
  empty: 0,
  offline: 0,
  mismatch: 0,
  decoder_error: 0,
  schema_failed: 0,
  partial_payload: 0,
  out_of_order: 0,
};

const DEFAULT_LAYER_COUNTERS: Record<FailingLayer, number> = {
  sensor: 0,
  gateway: 0,
  ttn: 0,
  decoder: 0,
  webhook: 0,
  database: 0,
  external_api: 0,
};

// Per-org state
const orgHealthCounters = new Map<string, Record<WidgetHealthStatus, number>>();
const orgLayerCounters = new Map<string, Record<FailingLayer, number>>();
const orgEventBuffers = new Map<string, WidgetHealthEvent[]>();

function getOrCreateHealthCounters(orgId: string): Record<WidgetHealthStatus, number> {
  let counters = orgHealthCounters.get(orgId);
  if (!counters) {
    counters = { ...DEFAULT_HEALTH_COUNTERS };
    orgHealthCounters.set(orgId, counters);
  }
  return counters;
}

function getOrCreateLayerCounters(orgId: string): Record<FailingLayer, number> {
  let counters = orgLayerCounters.get(orgId);
  if (!counters) {
    counters = { ...DEFAULT_LAYER_COUNTERS };
    orgLayerCounters.set(orgId, counters);
  }
  return counters;
}

export function trackHealthChange(event: Omit<WidgetHealthEvent, 'eventType' | 'timestamp'>): void {
  const counters = getOrCreateHealthCounters(event.orgId);

  // Decrement previous status
  if (event.previousStatus && counters[event.previousStatus] > 0) {
    counters[event.previousStatus]--;
  }

  // Increment current status
  counters[event.currentStatus]++;

  // Track failing layer
  if (event.failingLayer) {
    const layerCounters = getOrCreateLayerCounters(event.orgId);
    layerCounters[event.failingLayer]++;
  }

  // Buffer the event
  const fullEvent: WidgetHealthEvent = {
    ...event,
    eventType: 'widget_health_change',
    timestamp: new Date().toISOString(),
  };

  let buffer = orgEventBuffers.get(event.orgId);
  if (!buffer) {
    buffer = [];
    orgEventBuffers.set(event.orgId, buffer);
  }
  buffer.push(fullEvent);
}

export function getHealthDistribution(orgId: string): Record<WidgetHealthStatus, number> {
  return { ...(orgHealthCounters.get(orgId) ?? DEFAULT_HEALTH_COUNTERS) };
}

export function getBufferedEvents(orgId: string): WidgetHealthEvent[] {
  return [...(orgEventBuffers.get(orgId) ?? [])];
}

export async function flushHealthMetrics(orgId: string): Promise<void> {
  orgEventBuffers.delete(orgId);
}

export function getFailuresByLayer(orgId: string): Record<FailingLayer, number> {
  return { ...(orgLayerCounters.get(orgId) ?? DEFAULT_LAYER_COUNTERS) };
}

export function hasCriticalIssues(orgId: string): boolean {
  const counters = orgHealthCounters.get(orgId);
  if (!counters) return false;
  for (const status of CRITICAL_STATUSES) {
    if (counters[status] > 0) return true;
  }
  return false;
}

export function resetOrgCounters(orgId: string): void {
  orgHealthCounters.delete(orgId);
  orgLayerCounters.delete(orgId);
  orgEventBuffers.delete(orgId);
}

export function clearAllCounters(): void {
  orgHealthCounters.clear();
  orgLayerCounters.clear();
  orgEventBuffers.clear();
}
