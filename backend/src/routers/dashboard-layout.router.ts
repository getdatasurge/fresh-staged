/**
 * Dashboard Layout tRPC Router
 *
 * Provides type-safe procedures for managing entity dashboard layouts:
 * - list: Get all layouts for a specific entity
 * - create: Create a new dashboard layout
 * - update: Update an existing dashboard layout
 * - delete: Delete a dashboard layout
 * - setDefault: Set a layout as the user's default
 *
 * All procedures use orgProcedure to enforce authentication and org membership.
 */

import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  entityDashboardLayouts,
  type InsertEntityDashboardLayout,
} from '../db/schema/telemetry.js';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';

// --- Schemas ---

const EntityTypeSchema = z.enum(['unit', 'site']);

const LayoutSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  userId: z.string(),
  slotNumber: z.number().int().min(1).max(3),
  name: z.string().min(1).max(256),
  isUserDefault: z.boolean(),
  layoutJson: z.any(),
  widgetPrefsJson: z.any().optional(),
  timelineStateJson: z.any().optional(),
  layoutVersion: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CreateLayoutSchema = z.object({
  organizationId: z.string().uuid(),
  entityType: EntityTypeSchema,
  entityId: z.string().uuid(),
  slotNumber: z.number().int().min(1).max(3),
  name: z.string().min(1).max(256),
  layoutJson: z.any().optional(),
  widgetPrefsJson: z.any().optional(),
  timelineStateJson: z.any().optional(),
});

const UpdateLayoutSchema = z.object({
  organizationId: z.string().uuid(),
  layoutId: z.string().uuid(),
  name: z.string().min(1).max(256).optional(),
  layoutJson: z.any().optional(),
  widgetPrefsJson: z.any().optional(),
  timelineStateJson: z.any().optional(),
});

const DeleteLayoutSchema = z.object({
  organizationId: z.string().uuid(),
  layoutId: z.string().uuid(),
});

const SetDefaultLayoutSchema = z.object({
  organizationId: z.string().uuid(),
  layoutId: z.string().uuid(),
});

export const dashboardLayoutRouter = router({
  /**
   * List all dashboard layouts for a specific entity
   */
  list: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        entityType: EntityTypeSchema,
        entityId: z.string().uuid(),
      }),
    )
    .output(z.array(LayoutSchema))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const organizationId = ctx.user.organizationId;

      const layouts = await db
        .select()
        .from(entityDashboardLayouts)
        .where(
          and(
            eq(entityDashboardLayouts.organizationId, organizationId),
            eq(entityDashboardLayouts.entityType, input.entityType),
            eq(entityDashboardLayouts.entityId, input.entityId),
            eq(entityDashboardLayouts.userId, userId),
          ),
        )
        .orderBy(entityDashboardLayouts.slotNumber);

      return layouts.map((layout) => ({
        ...layout,
        organizationId: layout.organizationId.toString(),
        entityId: layout.entityId.toString(),
        userId: layout.userId.toString(),
        createdAt: layout.createdAt.toISOString(),
        updatedAt: layout.updatedAt.toISOString(),
      }));
    }),

  /**
   * Create a new dashboard layout
   */
  create: orgProcedure
    .input(CreateLayoutSchema)
    .output(LayoutSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const organizationId = ctx.user.organizationId;

      // Check if user already has maximum 3 layouts for this entity
      const existingLayouts = await db
        .select()
        .from(entityDashboardLayouts)
        .where(
          and(
            eq(entityDashboardLayouts.organizationId, organizationId),
            eq(entityDashboardLayouts.entityType, input.entityType),
            eq(entityDashboardLayouts.entityId, input.entityId),
            eq(entityDashboardLayouts.userId, userId),
          ),
        );

      if (existingLayouts.length >= 3) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Maximum 3 layouts per entity allowed',
        });
      }

      const [newLayout] = await db
        .insert(entityDashboardLayouts)
        .values({
          organizationId,
          entityType: input.entityType,
          entityId: input.entityId,
          userId: userId,
          slotNumber: input.slotNumber,
          name: input.name,
          isUserDefault: false,
          layoutJson: input.layoutJson || {},
          widgetPrefsJson: input.widgetPrefsJson || {},
          timelineStateJson: input.timelineStateJson,
          layoutVersion: 1,
        } satisfies InsertEntityDashboardLayout)
        .returning();

      if (!newLayout) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create layout',
        });
      }

      return {
        ...newLayout,
        organizationId: newLayout.organizationId.toString(),
        entityId: newLayout.entityId.toString(),
        userId: newLayout.userId.toString(),
        createdAt: newLayout.createdAt.toISOString(),
        updatedAt: newLayout.updatedAt.toISOString(),
      };
    }),

  /**
   * Update an existing dashboard layout
   */
  update: orgProcedure
    .input(UpdateLayoutSchema)
    .output(LayoutSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const organizationId = ctx.user.organizationId;

      // Build update object
      const updates: Partial<InsertEntityDashboardLayout> & { updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updates.name = input.name;
      if (input.layoutJson !== undefined) updates.layoutJson = input.layoutJson;
      if (input.widgetPrefsJson !== undefined) updates.widgetPrefsJson = input.widgetPrefsJson;
      if (input.timelineStateJson !== undefined)
        updates.timelineStateJson = input.timelineStateJson;

      const [updatedLayout] = await db
        .update(entityDashboardLayouts)
        .set(updates)
        .where(
          and(
            eq(entityDashboardLayouts.id, input.layoutId),
            eq(entityDashboardLayouts.organizationId, organizationId),
            eq(entityDashboardLayouts.userId, userId),
          ),
        )
        .returning();

      if (!updatedLayout) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Layout not found or not authorized to update',
        });
      }

      return {
        ...updatedLayout,
        organizationId: updatedLayout.organizationId.toString(),
        entityId: updatedLayout.entityId.toString(),
        userId: updatedLayout.userId.toString(),
        createdAt: updatedLayout.createdAt.toISOString(),
        updatedAt: updatedLayout.updatedAt.toISOString(),
      };
    }),

  /**
   * Delete a dashboard layout
   */
  remove: orgProcedure
    .input(DeleteLayoutSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const organizationId = ctx.user.organizationId;

      await db
        .delete(entityDashboardLayouts)
        .where(
          and(
            eq(entityDashboardLayouts.id, input.layoutId),
            eq(entityDashboardLayouts.organizationId, organizationId),
            eq(entityDashboardLayouts.userId, userId),
          ),
        );

      return { success: true };
    }),

  /**
   * Set a layout as the user's default
   */
  setDefault: orgProcedure
    .input(SetDefaultLayoutSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const organizationId = ctx.user.organizationId;

      // First, find the layout and verify ownership
      const entityLayouts = await db
        .select()
        .from(entityDashboardLayouts)
        .where(
          and(
            eq(entityDashboardLayouts.id, input.layoutId),
            eq(entityDashboardLayouts.organizationId, organizationId),
            eq(entityDashboardLayouts.userId, userId),
          ),
        );

      if (entityLayouts.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Layout not found or not authorized',
        });
      }

      const [layoutToSetDefault] = entityLayouts;

      // Unset all other layouts as default for this entity
      await db
        .update(entityDashboardLayouts)
        .set({ isUserDefault: false })
        .where(
          and(
            eq(entityDashboardLayouts.organizationId, organizationId),
            eq(entityDashboardLayouts.entityType, layoutToSetDefault.entityType),
            eq(entityDashboardLayouts.entityId, layoutToSetDefault.entityId),
            eq(entityDashboardLayouts.userId, userId),
          ),
        );

      // Set the selected layout as default (with org scoping)
      await db
        .update(entityDashboardLayouts)
        .set({ isUserDefault: true })
        .where(
          and(
            eq(entityDashboardLayouts.id, input.layoutId),
            eq(entityDashboardLayouts.organizationId, organizationId),
          ),
        );

      return { success: true };
    }),
});
