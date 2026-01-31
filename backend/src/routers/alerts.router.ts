/**
 * Alerts tRPC Router
 *
 * Provides type-safe procedures for alert management:
 * - list: List alerts with filtering and pagination
 * - get: Retrieve alert details
 * - acknowledge: Acknowledge an alert (staff/manager/admin/owner only)
 * - resolve: Resolve an alert with resolution notes (staff/manager/admin/owner only)
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  AlertSchema,
  AlertSeveritySchema,
  AlertsListSchema,
  AlertStatusSchema,
  AlertsWithHierarchyListSchema,
} from '../schemas/alerts.js';
import * as alertService from '../services/alert.service.js';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';

/**
 * Input schema for org-scoped procedures
 */
const OrgInput = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Input schema for alert-specific operations
 */
const AlertInput = z.object({
  organizationId: z.string().uuid(),
  alertId: z.string().uuid(),
});

/**
 * Input schema for listing alerts with filters
 */
const AlertListInput = z.object({
  organizationId: z.string().uuid(),
  status: AlertStatusSchema.optional(),
  severity: AlertSeveritySchema.optional(),
  unitId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
});

/**
 * Input schema for acknowledging an alert
 */
const AlertAcknowledgeInput = z.object({
  organizationId: z.string().uuid(),
  alertId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
});

/**
 * Input schema for resolving an alert
 */
const AlertResolveInput = z.object({
  organizationId: z.string().uuid(),
  alertId: z.string().uuid(),
  resolution: z.string().min(1).max(2000),
  correctiveAction: z.string().max(2000).optional(),
});

export const alertsRouter = router({
  /**
   * List alerts for organization
   * Equivalent to: GET /api/orgs/:organizationId/alerts
   *
   * Returns alerts matching filters, ordered by triggeredAt descending.
   */
  list: orgProcedure
    .input(AlertListInput)
    .output(AlertsListSchema)
    .query(async ({ ctx, input }) => {
      // Convert page to offset for service call
      const limit = input.limit ?? 100;
      const offset = input.page ? (input.page - 1) * limit : 0;

      const alerts = await alertService.listAlerts(ctx.user.organizationId, {
        status: input.status,
        severity: input.severity,
        unitId: input.unitId,
        start: input.start,
        end: input.end,
        limit,
        offset,
      });

      return alerts;
    }),

  /**
   * Get alert by ID
   * Equivalent to: GET /api/orgs/:organizationId/alerts/:alertId
   *
   * Returns full alert record for authenticated members.
   */
  get: orgProcedure
    .input(AlertInput)
    .output(AlertSchema)
    .query(async ({ ctx, input }) => {
      const alert = await alertService.getAlert(input.alertId, ctx.user.organizationId);

      if (!alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Alert not found',
        });
      }

      return alert;
    }),

  /**
   * Acknowledge an alert
   * Equivalent to: POST /api/orgs/:organizationId/alerts/:alertId/acknowledge
   *
   * Requires staff, manager, admin, or owner role.
   */
  acknowledge: orgProcedure
    .input(AlertAcknowledgeInput)
    .output(AlertSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - staff and above can acknowledge alerts
      if (!['staff', 'manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only staff, managers, admins, and owners can acknowledge alerts',
        });
      }

      const result = await alertService.acknowledgeAlert(
        input.alertId,
        ctx.user.organizationId,
        ctx.user.profileId,
        input.notes,
      );

      if (result === null) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Alert not found',
        });
      }

      if (result === 'already_acknowledged') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Alert is already acknowledged',
        });
      }

      return result;
    }),

  /**
   * Resolve an alert
   * Equivalent to: POST /api/orgs/:organizationId/alerts/:alertId/resolve
   *
   * Requires staff, manager, admin, or owner role.
   */
  resolve: orgProcedure
    .input(AlertResolveInput)
    .output(AlertSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - staff and above can resolve alerts
      if (!['staff', 'manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only staff, managers, admins, and owners can resolve alerts',
        });
      }

      const alert = await alertService.resolveAlert(
        input.alertId,
        ctx.user.organizationId,
        ctx.user.profileId,
        input.resolution,
        input.correctiveAction,
      );

      if (!alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Alert not found',
        });
      }

      return alert;
    }),

  /**
   * List alerts with hierarchy info
   */
  listByOrg: orgProcedure
    .input(
      AlertListInput.extend({
        status: z.union([AlertStatusSchema, z.array(AlertStatusSchema)]).optional(),
        severity: z.union([AlertSeveritySchema, z.array(AlertSeveritySchema)]).optional(),
      }),
    )
    .output(AlertsWithHierarchyListSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 100;
      const offset = input.page ? (input.page - 1) * limit : 0;

      const alerts = await alertService.listAlertsWithHierarchy(ctx.user.organizationId, {
        status: input.status,
        severity: input.severity,
        unitId: input.unitId,
        siteId: input.siteId,
        start: input.start,
        end: input.end,
        limit,
        offset,
      });

      return alerts;
    }),
});
