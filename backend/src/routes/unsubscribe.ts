/**
 * Unsubscribe Routes
 *
 * Handles one-click email unsubscribe from digest notifications.
 * Token-based authentication (no user session required).
 */

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { profiles } from '../db/schema/users.js';
import { verifyUnsubscribeToken } from '../utils/unsubscribe-token.js';
import {
  removeUserDigestSchedulers,
  syncUserDigestSchedulers,
} from '../jobs/schedulers/digest-schedulers.js';

// Response schemas
const SuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  type: z.enum(['daily', 'weekly', 'all']),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
});

export default async function unsubscribeRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /unsubscribe
   * One-click unsubscribe from digest emails
   *
   * Query params:
   * - token: JWT containing userId and unsubscribe type
   *
   * No authentication required (token-based verification).
   * Returns JSON response confirming unsubscribe or showing error.
   */
  app.get(
    '/',
    {
      schema: {
        querystring: z.object({
          token: z.string().min(1),
        }),
        response: {
          200: SuccessResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { token } = request.query;

      // Verify token
      const payload = await verifyUnsubscribeToken(token);
      if (!payload) {
        return reply.status(400).send({
          error: 'Invalid or expired unsubscribe link. Please update your preferences in the app.',
        });
      }

      const { userId, type } = payload;

      // Get user profile
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);

      if (!profile) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Update preferences based on type
      const updates: Partial<{ digestDaily: boolean; digestWeekly: boolean }> = {};

      if (type === 'daily' || type === 'all') {
        updates.digestDaily = false;
      }
      if (type === 'weekly' || type === 'all') {
        updates.digestWeekly = false;
      }

      await db.update(profiles).set(updates).where(eq(profiles.userId, userId));

      // Remove or update schedulers
      if (type === 'all') {
        await removeUserDigestSchedulers(userId);
      } else {
        // For single type, re-sync to update scheduler state
        await syncUserDigestSchedulers(userId, profile.organizationId, {
          dailyEnabled: type === 'daily' ? false : profile.digestDaily,
          weeklyEnabled: type === 'weekly' ? false : profile.digestWeekly,
          timezone: profile.timezone,
          dailyTime: profile.digestDailyTime || '09:00',
        });
      }

      const messages = {
        daily: 'You have been unsubscribed from daily digest emails.',
        weekly: 'You have been unsubscribed from weekly digest emails.',
        all: 'You have been unsubscribed from all digest emails.',
      };

      fastify.log.info({ userId, type }, '[Unsubscribe] User unsubscribed from digest');

      return reply.send({
        success: true,
        message: messages[type],
        type,
      });
    },
  );
}
