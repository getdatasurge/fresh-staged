import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  EmailAvailabilityQuerySchema,
  PhoneAvailabilityQuerySchema,
  AvailabilityResponseSchema,
} from '../schemas/availability.js';
import {
  checkEmailAvailability,
  checkPhoneAvailability,
} from '../services/availability.service.js';

/**
 * Availability Routes
 *
 * Public endpoints for checking email and phone uniqueness
 * during user registration. No authentication required.
 */
export const availabilityRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /api/availability/email
   *
   * Check if an email address is available for registration.
   * Used for real-time form validation during signup.
   */
  app.get(
    '/email',
    {
      schema: {
        querystring: EmailAvailabilityQuerySchema,
        response: {
          200: AvailabilityResponseSchema,
        },
      },
    },
    async (request) => {
      const { email } = request.query;
      return checkEmailAvailability(email);
    },
  );

  /**
   * GET /api/availability/phone
   *
   * Check if a phone number is available for registration.
   * Used for real-time form validation during signup.
   */
  app.get(
    '/phone',
    {
      schema: {
        querystring: PhoneAvailabilityQuerySchema,
        response: {
          200: AvailabilityResponseSchema,
        },
      },
    },
    async (request) => {
      const { phone } = request.query;
      return checkPhoneAvailability(phone);
    },
  );
};

export default availabilityRoutes;
