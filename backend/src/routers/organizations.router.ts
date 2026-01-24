/**
 * Organizations tRPC Router
 *
 * Provides type-safe procedures for organization management:
 * - get: Retrieve organization details
 * - update: Modify organization settings (owner only)
 * - listMembers: Get organization member list
 * - stats: Get dashboard statistics
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import * as orgService from '../services/organization.service.js';
import { getOrganizationStatsService } from '../services/organization-stats.service.js';
import {
  OrganizationSchema,
  UpdateOrganizationSchema,
  MembersListSchema,
  OrganizationStatsSchema,
} from '../schemas/organizations.js';

/**
 * Input schema for org-scoped procedures
 * Required by orgProcedure middleware
 */
const OrgInput = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Input schema for update with data payload
 */
const UpdateOrgInput = z.object({
  organizationId: z.string().uuid(),
  data: UpdateOrganizationSchema,
});

export const organizationsRouter = router({
  /**
   * Get organization details
   * Equivalent to: GET /api/orgs/:organizationId
   *
   * Returns full organization record for authenticated members.
   */
  get: orgProcedure
    .input(OrgInput)
    .output(OrganizationSchema)
    .query(async ({ ctx }) => {
      // ctx.user.organizationId is set by orgProcedure middleware
      const org = await orgService.getOrganization(ctx.user.organizationId);

      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      return org;
    }),

  /**
   * Update organization settings
   * Equivalent to: PUT /api/orgs/:organizationId
   *
   * Requires owner role. Updates name, timezone, complianceMode, or logoUrl.
   */
  update: orgProcedure
    .input(UpdateOrgInput)
    .output(OrganizationSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - only owners can update organization settings
      if (ctx.user.role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owners can update settings',
        });
      }

      const org = await orgService.updateOrganization(
        ctx.user.organizationId,
        input.data
      );

      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      return org;
    }),

  /**
   * List organization members
   * Equivalent to: GET /api/orgs/:organizationId/members
   *
   * Returns list of users with their roles and join dates.
   */
  listMembers: orgProcedure
    .input(OrgInput)
    .output(MembersListSchema)
    .query(async ({ ctx }) => {
      const members = await orgService.listMembers(ctx.user.organizationId);
      return members;
    }),

  /**
   * Get organization stats for dashboard
   * Equivalent to: GET /api/orgs/:organizationId/stats
   *
   * Returns aggregated stats including:
   * - Unit counts by state (normal, warning, critical, offline)
   * - Alert counts by status (pending, acknowledged, resolved)
   * - Compliance percentage
   * - Worst overall state
   */
  stats: orgProcedure
    .input(OrgInput)
    .output(OrganizationStatsSchema)
    .query(async ({ ctx }) => {
      const statsService = getOrganizationStatsService();

      if (!statsService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Organization stats service not initialized',
        });
      }

      const stats = await statsService.getOrganizationStats(ctx.user.organizationId);
      return stats;
    }),
});
