/**
 * Email plugin for Fastify
 *
 * Integrates EmailService with Fastify for email delivery functionality.
 * Follows the queue.plugin.ts pattern for consistency.
 *
 * Features:
 * - Initializes EmailService singleton at startup
 * - Decorates Fastify instance with emailService
 * - Graceful fallback when Resend API key not configured
 *
 * Usage:
 *   app.register(emailPlugin);
 *   app.ready().then(() => {
 *     if (app.emailService.isEnabled()) {
 *       app.emailService.sendDigest({ ... });
 *     }
 *   });
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { EmailService, setEmailService } from '../services/email.service.js';

/**
 * Email plugin async implementation
 *
 * Creates EmailService singleton and decorates Fastify instance.
 * Service handles missing RESEND_API_KEY gracefully (disabled mode).
 */
const emailPluginAsync: FastifyPluginAsync = async (fastify) => {
  // Create and initialize EmailService
  const emailService = new EmailService();

  // Set singleton for access from workers/processors
  setEmailService(emailService);

  // Decorate Fastify instance
  fastify.decorate('emailService', emailService);

  // Log initialization status
  if (emailService.isEnabled()) {
    fastify.log.info('[EmailPlugin] EmailService initialized and enabled');
  } else {
    fastify.log.info('[EmailPlugin] EmailService initialized (disabled - no API key)');
  }
};

export const emailPlugin = fp(emailPluginAsync, {
  name: 'email-plugin',
});
