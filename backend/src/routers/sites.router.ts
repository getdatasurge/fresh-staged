/**
 * Sites tRPC Router
 *
 * Provides type-safe procedures for site management:
 * - list: List all sites in an organization
 * - get: Retrieve site details
 * - create: Create a new site (admin/owner only)
 * - update: Modify site settings (admin/owner only)
 * - delete: Soft delete a site (admin/owner only)
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  CreateSiteSchema,
  SiteSchema,
  SitesListSchema,
  UpdateSiteSchema,
} from '../schemas/sites.js'
import { AuditService } from '../services/AuditService.js'
import * as siteService from '../services/site.service.js'
import { router } from '../trpc/index.js'
import { orgProcedure } from '../trpc/procedures.js'

/**
 * Input schema for org-scoped procedures
 * Required by orgProcedure middleware
 */
const OrgInput = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Input schema for site-specific operations
 */
const SiteInput = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid(),
});

/**
 * Input schema for create with data payload
 */
const CreateSiteInput = z.object({
  organizationId: z.string().uuid(),
  data: CreateSiteSchema,
});

/**
 * Input schema for update with data payload
 */
const UpdateSiteInput = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid(),
  data: UpdateSiteSchema,
});

export const sitesRouter = router({
  /**
   * List all sites in organization
   * Equivalent to: GET /api/orgs/:organizationId/sites
   *
   * Returns all active sites for the organization.
   */
  list: orgProcedure
    .input(OrgInput)
    .output(SitesListSchema)
    .query(async ({ ctx }) => {
      const sites = await siteService.listSites(ctx.user.organizationId);
      return sites;
    }),

  /**
   * Get site by ID
   * Equivalent to: GET /api/orgs/:organizationId/sites/:siteId
   *
   * Returns full site record for authenticated members.
   */
  get: orgProcedure
    .input(SiteInput)
    .output(SiteSchema)
    .query(async ({ ctx, input }) => {
      const site = await siteService.getSite(input.siteId, ctx.user.organizationId);

      if (!site) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Site not found',
        });
      }

      return site;
    }),

  /**
   * Create a new site
   * Equivalent to: POST /api/orgs/:organizationId/sites
   *
   * Requires admin or owner role.
   */
  create: orgProcedure
    .input(CreateSiteInput)
    .output(SiteSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - only admins and owners can create sites
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins and owners can create sites',
        });
      }

      const site = await siteService.createSite(ctx.user.organizationId, input.data);
      return site;
    }),

  /**
   * Update an existing site
   * Equivalent to: PUT /api/orgs/:organizationId/sites/:siteId
   *
   * Requires admin or owner role.
   */
  update: orgProcedure
    .input(UpdateSiteInput)
    .output(SiteSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - only admins and owners can update sites
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins and owners can update sites',
        });
      }

      const site = await siteService.updateSite(
        input.siteId,
        ctx.user.organizationId,
        input.data
      );

      if (!site) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Site not found',
        });
      }

      // Log audit event
      await AuditService.logEvent({
        eventType: 'site_updated',
        category: 'settings',
        title: `Site Updated: ${site.name}`,
        organizationId: ctx.user.organizationId,
        siteId: site.id,
        actorId: ctx.user.id,
        actorType: 'user',
        eventData: { changes: input.data }
      });

      return site;
    }),

  /**
   * Delete a site (soft delete)
   * Equivalent to: DELETE /api/orgs/:organizationId/sites/:siteId
   *
   * Requires admin or owner role. Sets isActive = false.
   */
  delete: orgProcedure
    .input(SiteInput)
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      // Role check - only admins and owners can delete sites
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins and owners can delete sites',
        });
      }

      const site = await siteService.deleteSite(input.siteId, ctx.user.organizationId);

      if (!site) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Site not found',
        });
      }
    }),
});
