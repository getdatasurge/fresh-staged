/**
 * Units tRPC Router
 *
 * Provides type-safe procedures for unit management:
 * - list: List all units in an area
 * - get: Retrieve unit details
 * - create: Create a new unit (manager/admin/owner only)
 * - update: Modify unit settings (manager/admin/owner only)
 * - delete: Soft delete a unit (manager/admin/owner only)
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 * Units are nested under areas in the hierarchy: org -> site -> area -> unit.
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  CreateUnitSchema,
  UnitSchema,
  UnitsListSchema,
  UnitWithHierarchySchema,
  UpdateUnitSchema,
} from '../schemas/units.js';
import * as unitService from '../services/unit.service.js';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';

/**
 * Input schema for area-scoped procedures (listing units)
 * Required by orgProcedure middleware
 */
const AreaInput = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid(),
  areaId: z.string().uuid(),
});

/**
 * Input schema for unit-specific operations
 */
const UnitInput = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid(),
  areaId: z.string().uuid(),
  unitId: z.string().uuid(),
});

/**
 * Input schema for create with data payload
 */
const CreateUnitInput = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid(),
  areaId: z.string().uuid(),
  data: CreateUnitSchema,
});

/**
 * Input schema for update with data payload
 */
const UpdateUnitInput = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid(),
  areaId: z.string().uuid(),
  unitId: z.string().uuid(),
  data: UpdateUnitSchema,
});

export const unitsRouter = router({
  /**
   * List all units in area
   * Equivalent to: GET /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units
   *
   * Returns all active units for the area.
   */
  list: orgProcedure
    .input(AreaInput)
    .output(UnitsListSchema)
    .query(async ({ ctx, input }) => {
      const units = await unitService.listUnits(
        input.areaId,
        input.siteId,
        ctx.user.organizationId,
      );

      if (units === null) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Area not found',
        });
      }

      return units;
    }),

  /**
   * Get unit by ID
   * Equivalent to: GET /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId
   *
   * Returns full unit record for authenticated members.
   */
  get: orgProcedure
    .input(UnitInput)
    .output(UnitSchema)
    .query(async ({ ctx, input }) => {
      const unit = await unitService.getUnit(
        input.unitId,
        input.areaId,
        input.siteId,
        ctx.user.organizationId,
      );

      if (!unit) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Unit not found',
        });
      }

      return unit;
    }),

  /**
   * Create a new unit
   * Equivalent to: POST /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units
   *
   * Requires manager, admin, or owner role.
   */
  create: orgProcedure
    .input(CreateUnitInput)
    .output(UnitSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - only managers, admins, and owners can create units
      if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers, admins, and owners can create units',
        });
      }

      const unit = await unitService.createUnit(
        input.areaId,
        input.siteId,
        ctx.user.organizationId,
        input.data,
      );

      if (!unit) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Area not found',
        });
      }

      return unit;
    }),

  /**
   * Update an existing unit
   * Equivalent to: PUT /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId
   *
   * Requires manager, admin, or owner role.
   */
  update: orgProcedure
    .input(UpdateUnitInput)
    .output(UnitSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - only managers, admins, and owners can update units
      if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers, admins, and owners can update units',
        });
      }

      const unit = await unitService.updateUnit(
        input.unitId,
        input.areaId,
        input.siteId,
        ctx.user.organizationId,
        input.data,
      );

      if (!unit) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Unit not found',
        });
      }

      return unit;
    }),

  /**
   * Delete a unit (soft delete)
   * Equivalent to: DELETE /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId
   *
   * Requires manager, admin, or owner role. Sets isActive = false.
   */
  delete: orgProcedure
    .input(UnitInput)
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      // Role check - only managers, admins, and owners can delete units
      if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers, admins, and owners can delete units',
        });
      }

      const unit = await unitService.deleteUnit(
        input.unitId,
        input.areaId,
        input.siteId,
        ctx.user.organizationId,
      );

      if (!unit) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Unit not found',
        });
      }
    }),

  /**
   * Restore a soft-deleted unit
   * Equivalent to: POST /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId/restore
   *
   * Requires manager, admin, or owner role. Sets isActive = true.
   */
  restore: orgProcedure
    .input(UnitInput)
    .output(UnitSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - only managers, admins, and owners can restore units
      if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers, admins, and owners can restore units',
        });
      }

      const unit = await unitService.restoreUnit(
        input.unitId,
        input.areaId,
        input.siteId,
        ctx.user.organizationId,
      );

      if (!unit) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Unit not found',
        });
      }

      return unit;
    }),

  /**
   * Permanently delete a unit
   * Equivalent to: DELETE /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId/permanent
   *
   * Requires manager, admin, or owner role. Permanently removes from database.
   */
  permanentlyDelete: orgProcedure
    .input(UnitInput)
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      // Role check - only managers, admins, and owners can permanently delete units
      if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers, admins, and owners can permanently delete units',
        });
      }

      const unit = await unitService.permanentlyDeleteUnit(
        input.unitId,
        input.areaId,
        input.siteId,
        ctx.user.organizationId,
      );

      if (!unit) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Unit not found',
        });
      }
    }),

  /**
   * List all units in organization with hierarchy info
   * Equivalent to: GET /api/orgs/:organizationId/units
   *
   * Returns all active units for the entire organization.
   */
  listByOrg: orgProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .output(z.array(UnitWithHierarchySchema))
    .query(async ({ ctx }) => {
      // Use listUnitsByOrg service
      const units = await unitService.listUnitsByOrg(ctx.user.organizationId);
      return units;
    }),

  /**
   * Get unit by ID with hierarchy info
   */
  getWithHierarchy: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        unitId: z.string().uuid(),
      }),
    )
    .output(UnitWithHierarchySchema)
    .query(async ({ ctx, input }) => {
      const unit = await unitService.getUnitWithHierarchy(input.unitId, ctx.user.organizationId);

      if (!unit) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Unit not found',
        });
      }

      return unit;
    }),
});
