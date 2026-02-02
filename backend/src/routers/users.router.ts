/**
 * Users tRPC Router
 *
 * Provides procedures for user profile and role management:
 * - me: Get current user's profile and primary role
 * - updateProfile: Update personal profile data
 */
import { TRPCError } from '@trpc/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { profiles, userRoles, userSyncLog } from '../db/schema/users.js';
import { userService } from '../services/index.js';
import { router } from '../trpc/index.js';
import { protectedProcedure } from '../trpc/procedures.js';

export const usersRouter = router({
  /**
   * Get current user's profile and active role
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Get profile
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);

    if (!profile) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Profile not found',
      });
    }

    // Get primary role in their current organization
    // Note: In FreshTrack, user.organizationId is the active context org
    const [roleRecord] = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId))
      .limit(1);

    return {
      profile,
      role: roleRecord?.role || 'viewer',
    };
  }),

  /**
   * Update personal profile
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        fullName: z.string().max(256).optional(),
        phone: z.string().max(50).nullable().optional(),
        avatarUrl: z.string().url().nullable().optional(),
        notificationPreferences: z
          .object({
            push: z.boolean().optional(),
            email: z.boolean().optional(),
            sms: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      await db
        .update(profiles)
        .set({
          full_name: input.fullName,
          phone: input.phone,
          avatar_url: input.avatarUrl,
          // We don't have a single JSON column for all prefs anymore in the Drizzle schema,
          // they are individual columns or we update them individually.
          // The Drizzle schema has pushEnabled, emailEnabled, smsEnabled.
          push_enabled: input.notificationPreferences?.push,
          email_enabled: input.notificationPreferences?.email,
          sms_enabled: input.notificationPreferences?.sms,
          updated_at: new Date(),
        } as Record<string, unknown>)
        .where(eq(profiles.userId, userId));

      return { success: true };
    }),

  /**
   * Get last user sync log entry
   * Used by EmulatorResyncCard component
   */
  getLastSyncLog: protectedProcedure
    .output(
      z
        .object({
          id: z.string().uuid(),
          userId: z.string(),
          eventType: z.string(),
          payload: z.record(z.string(), z.unknown()),
          status: z.string(),
          lastError: z.string().nullable(),
          createdAt: z.date(),
          sentAt: z.date().nullable(),
        })
        .nullable(),
    )
    .query(async ({ ctx }) => {
      const log = await db.query.userSyncLog.findFirst({
        where: eq(userSyncLog.userId, ctx.user.id),
        orderBy: [desc(userSyncLog.createdAt)],
      });

      if (!log) return null;

      // Parse payload from JSON string
      let payload: Record<string, unknown> = {};
      if (log.payload) {
        try {
          payload = JSON.parse(log.payload);
        } catch {
          payload = {};
        }
      }

      return {
        id: log.id,
        userId: log.userId,
        eventType: log.eventType,
        payload,
        status: log.status,
        lastError: log.lastError,
        createdAt: log.createdAt,
        sentAt: log.sentAt,
      };
    }),

  /**
   * Trigger emulator sync by updating profile
   * Used by EmulatorResyncCard component
   */
  triggerEmulatorSync: protectedProcedure
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      await db
        .update(profiles)
        .set({ updatedAt: new Date() })
        .where(eq(profiles.userId, ctx.user.id));

      return { success: true };
    }),

  /**
   * Check if the current user has super admin status
   */
  checkSuperAdminStatus: protectedProcedure.query(async ({ ctx }) => {
    const isSuperAdmin = await userService.isSuperAdmin(ctx.user.id);
    return { isSuperAdmin };
  }),
});
