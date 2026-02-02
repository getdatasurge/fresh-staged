/**
 * Availability tRPC Router
 *
 * Provides public endpoints for:
 * - Email availability checking (registration validation)
 * - Phone availability checking (registration validation)
 *
 * These are PUBLIC procedures - no authentication required.
 * Used for real-time form validation during user signup.
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc/index.js';
import {
  checkEmailAvailability,
  checkPhoneAvailability,
} from '../services/availability.service.js';

/**
 * Input schemas matching existing REST route validation
 */
const CheckEmailInputSchema = z.object({
  email: z.string().email('Invalid email format'),
});

const CheckPhoneInputSchema = z.object({
  phone: z.string().min(10, 'Phone number too short').max(20, 'Phone number too long'),
});

/**
 * Response schema for availability checks
 */
const AvailabilityResponseSchema = z.object({
  available: z.boolean(),
  message: z.string(),
});

/**
 * Availability router
 *
 * Procedures (all PUBLIC - no auth required):
 * - checkEmail: Check if email is available for registration
 * - checkPhone: Check if phone is available for registration
 */
export const availabilityRouter = router({
  /**
   * Check email availability
   *
   * Used during registration to validate that an email is not already in use.
   * Returns availability status and descriptive message.
   *
   * @public No authentication required
   * @input { email: string }
   * @returns { available: boolean, message: string }
   */
  checkEmail: publicProcedure
    .input(CheckEmailInputSchema)
    .output(AvailabilityResponseSchema)
    .query(async ({ input }) => {
      const result = await checkEmailAvailability(input.email);
      return {
        available: result.available,
        message: result.available ? 'Email is available' : 'Email is already registered',
      };
    }),

  /**
   * Check phone availability
   *
   * Used during registration to validate that a phone number is not already in use.
   * Returns availability status and descriptive message.
   *
   * @public No authentication required
   * @input { phone: string }
   * @returns { available: boolean, message: string }
   */
  checkPhone: publicProcedure
    .input(CheckPhoneInputSchema)
    .output(AvailabilityResponseSchema)
    .query(async ({ input }) => {
      const result = await checkPhoneAvailability(input.phone);
      return {
        available: result.available,
        message: result.available
          ? 'Phone number is available'
          : 'Phone number is already registered',
      };
    }),
});
