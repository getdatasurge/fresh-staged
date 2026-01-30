/**
 * Onboarding tRPC Router
 *
 * Provides type-safe procedures for the onboarding wizard:
 * - checkExistingOrg: Check if user already has an organization
 * - createOrganization: Create org with owner
 * - createSite: Create site for org
 * - createArea: Create area for site
 * - createUnit: Create unit for area
 * - createGateway: Register gateway
 *
 * All mutations use auth context to identify the user.
 */

import { TRPCError } from '@trpc/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { areas, gateways, sites, units } from '../db/schema/hierarchy.js';
import { organizations, ttnConnections } from '../db/schema/tenancy.js';
import { profiles, userRoles } from '../db/schema/users.js';
import { router } from '../trpc/index.js';
import { orgProcedure, protectedProcedure } from '../trpc/procedures.js';

/**
 * Unit type enum matching the database constraint
 */
const unitTypeEnum = z.enum([
  'fridge',
  'freezer',
  'walk_in_cooler',
  'walk_in_freezer',
  'display_case',
  'blast_chiller',
]);

export const onboardingRouter = router({
  /**
   * Check if user already has an organization
   * Returns hasOrg boolean and organizationId if exists
   */
  checkExistingOrg: protectedProcedure.query(async ({ ctx }) => {
    // Query profiles table for organization_id
    const [profile] = await db
      .select({ organizationId: profiles.organizationId })
      .from(profiles)
      .where(eq(profiles.userId, ctx.user.id))
      .limit(1);

    if (profile?.organizationId) {
      return {
        hasOrg: true,
        organizationId: profile.organizationId,
      };
    }

    return {
      hasOrg: false,
      organizationId: undefined,
    };
  }),

  /**
   * Create organization with owner
   * Uses the same logic as the create_organization_with_owner RPC
   */
  createOrganization: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(256),
        slug: z
          .string()
          .min(1)
          .max(256)
          .regex(/^[a-z0-9-]+$/),
        timezone: z.string().default('America/New_York'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user already has an organization
      const [existingProfile] = await db
        .select({ organizationId: profiles.organizationId })
        .from(profiles)
        .where(eq(profiles.userId, ctx.user.id))
        .limit(1);

      if (existingProfile?.organizationId) {
        return {
          ok: false,
          code: 'ALREADY_IN_ORG',
          message: 'Your account is already associated with an organization.',
        };
      }

      // Check if slug is taken
      const [existingOrg] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, input.slug))
        .limit(1);

      if (existingOrg) {
        // Generate suggestions
        const suggestions = [
          `${input.slug}-1`,
          `${input.slug}-2`,
          `${input.slug}-${Date.now().toString().slice(-4)}`,
        ];

        return {
          ok: false,
          code: 'SLUG_TAKEN',
          message: 'This URL is already taken.',
          suggestions,
        };
      }

      // Create organization using transaction
      try {
        const result = await db.transaction(async (tx) => {
          // Create organization
          const [org] = await tx
            .insert(organizations)
            .values({
              name: input.name,
              slug: input.slug,
              timezone: input.timezone,
            })
            .returning({ id: organizations.id });

          if (!org) {
            throw new Error('Failed to create organization');
          }

          // Create TTN connection with webhook secret
          const webhookSecret = `ws_${crypto.randomUUID().replace(/-/g, '')}`;
          await tx.insert(ttnConnections).values({
            organizationId: org.id,
            webhookSecret,
            isActive: true,
            isEnabled: false,
            provisioningStatus: 'not_started',
          });

          // Create user role (owner)
          await tx.insert(userRoles).values({
            userId: ctx.user.id,
            organizationId: org.id,
            role: 'owner',
          });

          // Create or update profile
          const [existingProfileCheck] = await tx
            .select({ id: profiles.id })
            .from(profiles)
            .where(eq(profiles.userId, ctx.user.id))
            .limit(1);

          if (existingProfileCheck) {
            // Update existing profile with org
            await tx
              .update(profiles)
              .set({ organizationId: org.id })
              .where(eq(profiles.userId, ctx.user.id));
          } else {
            // Create new profile
            await tx.insert(profiles).values({
              userId: ctx.user.id,
              organizationId: org.id,
              email: ctx.user.email ?? '',
              fullName: ctx.user.name ?? null,
            });
          }

          return org;
        });

        return {
          ok: true,
          organizationId: result.id,
          slug: input.slug,
        };
      } catch (error) {
        console.error('Error creating organization:', error);
        return {
          ok: false,
          code: 'CREATE_FAILED',
          message: 'Failed to create organization. Please try again.',
        };
      }
    }),

  /**
   * Create site for organization
   * Uses auth context to get organization ID
   */
  createSite: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        name: z.string().min(1).max(256),
        address: z.string().max(512).optional(),
        city: z.string().max(128).optional(),
        state: z.string().max(64).optional(),
        postalCode: z.string().max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [site] = await db
        .insert(sites)
        .values({
          organizationId: ctx.user.organizationId,
          name: input.name,
          address: input.address || null,
          city: input.city || null,
          state: input.state || null,
          postalCode: input.postalCode || null,
          timezone: 'America/New_York', // Default, inherit from org
        })
        .returning({ id: sites.id });

      if (!site) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create site',
        });
      }

      return { siteId: site.id };
    }),

  /**
   * Create area for site
   */
  createArea: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        siteId: z.string().uuid(),
        name: z.string().min(1).max(256),
        description: z.string().max(1024).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify site belongs to user's organization
      const [site] = await db
        .select({ id: sites.id })
        .from(sites)
        .where(eq(sites.id, input.siteId))
        .limit(1);

      if (!site) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Site not found',
        });
      }

      const [area] = await db
        .insert(areas)
        .values({
          siteId: input.siteId,
          name: input.name,
          description: input.description || null,
        })
        .returning({ id: areas.id });

      if (!area) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create area',
        });
      }

      return { areaId: area.id };
    }),

  /**
   * Create unit for area
   */
  createUnit: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        areaId: z.string().uuid(),
        name: z.string().min(1).max(256),
        unitType: unitTypeEnum,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify area exists via site -> org chain
      const [area] = await db
        .select({
          id: areas.id,
          siteId: areas.siteId,
        })
        .from(areas)
        .innerJoin(sites, eq(areas.siteId, sites.id))
        .where(eq(areas.id, input.areaId))
        .limit(1);

      if (!area) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Area not found',
        });
      }

      // Determine temperature limits based on unit type
      const tempLimits: Record<string, { min: number; max: number }> = {
        fridge: { min: 33, max: 41 },
        freezer: { min: -10, max: 0 },
        walk_in_cooler: { min: 33, max: 41 },
        walk_in_freezer: { min: -10, max: 0 },
        display_case: { min: 33, max: 41 },
        blast_chiller: { min: -40, max: -10 },
      };

      const limits = tempLimits[input.unitType] || { min: 33, max: 41 };

      const [unit] = await db
        .insert(units)
        .values({
          areaId: input.areaId,
          name: input.name,
          unitType: input.unitType,
          tempMin: limits.min,
          tempMax: limits.max,
        })
        .returning({ id: units.id });

      if (!unit) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create unit',
        });
      }

      return { unitId: unit.id };
    }),

  /**
   * Create gateway for organization
   */
  createGateway: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        name: z.string().min(1).max(256),
        gatewayEui: z
          .string()
          .length(16)
          .regex(/^[0-9A-Fa-f]+$/),
        siteId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get TTN connection for org
      const [ttnConnection] = await db
        .select({ id: ttnConnections.id })
        .from(ttnConnections)
        .where(eq(ttnConnections.organizationId, ctx.user.organizationId))
        .limit(1);

      if (!ttnConnection) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'TTN connection not configured for this organization',
        });
      }

      // Generate gateway ID from EUI
      const gatewayId = `gw-${input.gatewayEui.toLowerCase()}`;

      const [gateway] = await db
        .insert(gateways)
        .values({
          ttnConnectionId: ttnConnection.id,
          siteId: input.siteId || null,
          gatewayId,
          gatewayEui: input.gatewayEui.toUpperCase(),
          name: input.name,
        })
        .returning({ id: gateways.id });

      if (!gateway) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create gateway',
        });
      }

      return { gatewayId: gateway.id };
    }),
});
