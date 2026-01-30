/**
 * Preferences tRPC Router
 *
 * Provides type-safe procedures for user preferences management:
 * - getDigest: Retrieve user's digest email preferences
 * - updateDigest: Modify digest preferences and sync schedulers
 * - disableAllDigests: Disable all digest emails and remove schedulers
 *
 * All procedures use protectedProcedure which enforces authentication.
 */

import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { profiles } from '../db/schema/users.js';
import {
  removeUserDigestSchedulers,
  syncUserDigestSchedulers,
} from '../jobs/schedulers/digest-schedulers.js';
import { router } from '../trpc/index.js';
import { protectedProcedure } from '../trpc/procedures.js';

// --- Schemas ---

/**
 * Response schema for digest preferences
 */
const DigestPreferencesSchema = z.object({
  digestDaily: z.boolean(),
  digestWeekly: z.boolean(),
  digestDailyTime: z.string(),
  digestSiteIds: z.array(z.string()).nullable(),
  timezone: z.string(),
  emailEnabled: z.boolean(),
});

/**
 * Input schema for updating digest preferences
 * All fields optional for partial updates
 */
const UpdateDigestPreferencesSchema = z.object({
  digestDaily: z.boolean().optional(),
  digestWeekly: z.boolean().optional(),
  digestDailyTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM format (24-hour)')
    .optional(),
  digestSiteIds: z.array(z.string().uuid()).nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
});

/**
 * Response schema for disable all operation
 */
const DisableAllResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const preferencesRouter = router({
  /**
   * Get digest preferences
   * Equivalent to: GET /api/preferences/digest
   *
   * Returns current user's digest email preferences.
   */
  getDigest: protectedProcedure.output(DigestPreferencesSchema).query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const [profile] = await db
      .select({
        digestDaily: profiles.digestDaily,
        digestWeekly: profiles.digestWeekly,
        digestDailyTime: profiles.digestDailyTime,
        digestSiteIds: profiles.digestSiteIds,
        timezone: profiles.timezone,
        emailEnabled: profiles.emailEnabled,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (!profile) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Profile not found',
      });
    }

    // Parse digestSiteIds from JSON text to array
    return {
      ...profile,
      digestSiteIds: profile.digestSiteIds ? JSON.parse(profile.digestSiteIds) : null,
    };
  }),

  /**
   * Update digest preferences
   * Equivalent to: PATCH /api/preferences/digest
   *
   * Updates digest preferences and syncs BullMQ schedulers.
   * Uses fire-and-forget pattern to avoid blocking the response.
   */
  updateDigest: protectedProcedure
    .input(UpdateDigestPreferencesSchema)
    .output(DigestPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Get current profile (need organizationId for scheduler)
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);

      if (!profile) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Profile not found',
        });
      }

      // Build update object with only provided fields
      const updates: Partial<{
        digestDaily: boolean;
        digestWeekly: boolean;
        digestDailyTime: string;
        digestSiteIds: string | null;
        timezone: string;
      }> = {};

      if (input.digestDaily !== undefined) updates.digestDaily = input.digestDaily;
      if (input.digestWeekly !== undefined) updates.digestWeekly = input.digestWeekly;
      if (input.digestDailyTime !== undefined) updates.digestDailyTime = input.digestDailyTime;
      if (input.digestSiteIds !== undefined) {
        updates.digestSiteIds = input.digestSiteIds ? JSON.stringify(input.digestSiteIds) : null;
      }
      if (input.timezone !== undefined) updates.timezone = input.timezone;

      // Update profile in database
      const [updated] = await db
        .update(profiles)
        .set(updates as any)
        .where(eq(profiles.userId, userId))
        .returning({
          digestDaily: profiles.digestDaily,
          digestWeekly: profiles.digestWeekly,
          digestDailyTime: profiles.digestDailyTime,
          digestSiteIds: profiles.digestSiteIds,
          timezone: profiles.timezone,
          emailEnabled: profiles.emailEnabled,
        });

      // Sync schedulers with new preferences (fire-and-forget)
      syncUserDigestSchedulers(userId, profile.organizationId, {
        dailyEnabled: updated.digestDaily,
        weeklyEnabled: updated.digestWeekly,
        timezone: updated.timezone,
        dailyTime: updated.digestDailyTime,
      }).catch((err) => {
        console.error('[Preferences] Failed to sync digest schedulers:', err);
      });

      // Parse digestSiteIds from JSON text to array
      return {
        ...updated,
        digestSiteIds: updated.digestSiteIds ? JSON.parse(updated.digestSiteIds) : null,
      };
    }),

  /**
   * Disable all digest emails
   * Equivalent to: POST /api/preferences/digest/disable-all
   *
   * Used for one-click unsubscribe from email digest notifications.
   * Removes both daily and weekly schedulers immediately.
   */
  disableAllDigests: protectedProcedure
    .output(DisableAllResponseSchema)
    .mutation(async ({ ctx }) => {
      const userId = ctx.user.id;

      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);

      if (!profile) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Profile not found',
        });
      }

      // Disable both digest types in database
      await db
        .update(profiles)
        .set({ digestDaily: false, digestWeekly: false } as any)
        .where(eq(profiles.userId, userId));

      // Remove all schedulers for this user
      await removeUserDigestSchedulers(userId);

      return {
        success: true,
        message: 'All digest emails disabled',
      };
    }),
});
