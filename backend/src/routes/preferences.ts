/**
 * User Preferences Routes
 *
 * Endpoints for managing user notification preferences including
 * email digest settings (daily/weekly digests with timezone).
 *
 * All routes require authentication and operate on the current user's profile.
 */

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/index.js';
import { db } from '../db/client.js';
import { profiles } from '../db/schema/users.js';
import {
  syncUserDigestSchedulers,
  removeUserDigestSchedulers,
} from '../jobs/schedulers/digest-schedulers.js';

// Validation schemas
const DigestPreferencesResponseSchema = z.object({
  digestDaily: z.boolean(),
  digestWeekly: z.boolean(),
  digestDailyTime: z.string(),
  digestSiteIds: z.array(z.string()).nullable(),
  timezone: z.string(),
  emailEnabled: z.boolean(),
});

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

const DisableAllResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
});

export default async function preferencesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /api/preferences/digest
   * Get current user's digest preferences
   */
  app.get(
    '/digest',
    {
      preHandler: [requireAuth],
      schema: {
        response: {
          200: DigestPreferencesResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;

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
        return reply.status(404).send({ error: 'Profile not found' });
      }

      // Parse digestSiteIds from JSON text to array
      return reply.send({
        ...profile,
        digestSiteIds: profile.digestSiteIds
          ? JSON.parse(profile.digestSiteIds)
          : null,
      });
    }
  );

  /**
   * PATCH /api/preferences/digest
   * Update digest preferences and sync schedulers
   *
   * After updating the database, syncs BullMQ schedulers in the background.
   * Uses fire-and-forget pattern to avoid blocking the response.
   */
  app.patch(
    '/digest',
    {
      preHandler: [requireAuth],
      schema: {
        body: UpdateDigestPreferencesSchema,
        response: {
          200: DigestPreferencesResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const body = request.body;

      // Get current profile (need organizationId for scheduler)
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);

      if (!profile) {
        return reply.status(404).send({ error: 'Profile not found' });
      }

      // Build update object with only provided fields
      const updates: Partial<{
        digestDaily: boolean;
        digestWeekly: boolean;
        digestDailyTime: string;
        digestSiteIds: string | null;
        timezone: string;
      }> = {};

      if (body.digestDaily !== undefined) updates.digestDaily = body.digestDaily;
      if (body.digestWeekly !== undefined) updates.digestWeekly = body.digestWeekly;
      if (body.digestDailyTime !== undefined)
        updates.digestDailyTime = body.digestDailyTime;
      if (body.digestSiteIds !== undefined) {
        updates.digestSiteIds = body.digestSiteIds
          ? JSON.stringify(body.digestSiteIds)
          : null;
      }
      if (body.timezone !== undefined) updates.timezone = body.timezone;

      // Update profile in database
      const [updated] = await db
        .update(profiles)
        .set(updates)
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
        fastify.log.error({ err }, '[Preferences] Failed to sync digest schedulers');
      });

      // Parse digestSiteIds from JSON text to array
      return reply.send({
        ...updated,
        digestSiteIds: updated.digestSiteIds
          ? JSON.parse(updated.digestSiteIds)
          : null,
      });
    }
  );

  /**
   * POST /api/preferences/digest/disable-all
   * Disable all digest emails and remove schedulers
   *
   * Used for one-click unsubscribe from email digest notifications.
   * Removes both daily and weekly schedulers immediately.
   */
  app.post(
    '/digest/disable-all',
    {
      preHandler: [requireAuth],
      schema: {
        response: {
          200: DisableAllResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;

      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);

      if (!profile) {
        return reply.status(404).send({ error: 'Profile not found' });
      }

      // Disable both digest types in database
      await db
        .update(profiles)
        .set({ digestDaily: false, digestWeekly: false })
        .where(eq(profiles.userId, userId));

      // Remove all schedulers for this user
      await removeUserDigestSchedulers(userId);

      return reply.send({
        success: true,
        message: 'All digest emails disabled',
      });
    }
  );
}
