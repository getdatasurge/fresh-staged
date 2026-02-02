/**
 * Widget Health Metrics tRPC Router
 *
 * Provides type-safe procedures for widget health metrics operations:
 * - trackHealthChange: Track widget health status changes
 * - getHealthDistribution: Get health status distribution for an org
 * - getFailuresByLayer: Get failure counts by layer for an org
 * - hasCriticalIssues: Check if an org has critical issues
 * - getBufferedEvents: Get buffered events for an org (for debugging)
 * - flushHealthMetrics: Flush buffered events to database
 * - resetOrgCounters: Reset counters for an org (for testing)
 *
 * All procedures use orgProcedure or protectedProcedure to enforce authentication.
 */

import { z } from 'zod';
import { WidgetHealthMetricsService } from '../services/widget-health-metrics.service.js';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';

// Define widget health status enum
const WidgetHealthStatusSchema = z.enum([
  'healthy',
  'degraded',
  'stale',
  'error',
  'no_data',
  'misconfigured',
  'permission_denied',
  'not_configured',
  'loading',
  'empty',
  'offline',
  'mismatch',
  'decoder_error',
  'schema_failed',
  'partial_payload',
  'out_of_order',
]);

// Define failing layer enum
const FailingLayerSchema = z.enum([
  'sensor',
  'gateway',
  'ttn',
  'decoder',
  'webhook',
  'database',
  'external_api',
]);

// Input schema for tracking health changes
const TrackHealthChangeSchema = z.object({
  widgetId: z.string(),
  entityId: z.string().uuid(),
  entityType: z.enum(['unit', 'site']),
  orgId: z.string().uuid(),
  previousStatus: WidgetHealthStatusSchema.nullable(),
  currentStatus: WidgetHealthStatusSchema,
  failingLayer: FailingLayerSchema.nullable(),
  payloadType: z.string().nullable(),
  metadata: z.object({}).catchall(z.any()).optional(),
});

// Input schema for getting health distribution
const GetHealthDistributionSchema = z.object({
  orgId: z.string().uuid(),
});

// Input schema for getting failures by layer
const GetFailuresByLayerSchema = z.object({
  orgId: z.string().uuid(),
});

// Input schema for checking critical issues
const HasCriticalIssuesSchema = z.object({
  orgId: z.string().uuid(),
});

// Input schema for getting buffered events
const GetBufferedEventsSchema = z.object({
  orgId: z.string().uuid(),
});

// Input schema for flushing health metrics
const FlushHealthMetricsSchema = z.object({
  orgId: z.string().uuid(),
});

// Input schema for resetting org counters
const ResetOrgCountersSchema = z.object({
  orgId: z.string().uuid(),
});

export const widgetHealthRouter = router({
  /**
   * Track a widget health status change
   */
  trackHealthChange: orgProcedure
    .input(TrackHealthChangeSchema)
    .mutation(async ({ ctx, input }) => {
      WidgetHealthMetricsService.trackHealthChange({
        ...input,
        orgId: ctx.user.organizationId,
      });
      return { success: true };
    }),

  /**
   * Get current health status distribution for an org
   */
  getHealthDistribution: orgProcedure
    .input(GetHealthDistributionSchema)
    .query(async ({ input }) => {
      return WidgetHealthMetricsService.getHealthDistribution(input.orgId);
    }),

  /**
   * Get failure counts by layer for an org
   */
  getFailuresByLayer: orgProcedure.input(GetFailuresByLayerSchema).query(async ({ input }) => {
    return WidgetHealthMetricsService.getFailuresByLayer(input.orgId);
  }),

  /**
   * Check if an org has critical issues
   */
  hasCriticalIssues: orgProcedure.input(HasCriticalIssuesSchema).query(async ({ input }) => {
    return WidgetHealthMetricsService.hasCriticalIssues(input.orgId);
  }),

  /**
   * Get buffered events for an org (for debugging)
   */
  getBufferedEvents: orgProcedure.input(GetBufferedEventsSchema).query(async ({ input }) => {
    return WidgetHealthMetricsService.getBufferedEvents(input.orgId);
  }),

  /**
   * Flush buffered events to database
   */
  flushHealthMetrics: orgProcedure.input(FlushHealthMetricsSchema).mutation(async ({ ctx }) => {
    await WidgetHealthMetricsService.flushHealthMetrics(ctx.user.organizationId);
    return { success: true };
  }),

  /**
   * Reset counters for an org (for testing)
   */
  resetOrgCounters: orgProcedure.input(ResetOrgCountersSchema).mutation(async ({ ctx }) => {
    WidgetHealthMetricsService.resetOrgCounters(ctx.user.organizationId);
    return { success: true };
  }),
});
