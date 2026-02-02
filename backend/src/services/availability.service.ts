import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { profiles } from '../db/schema/users.js';

/**
 * Availability Service
 *
 * Provides real-time validation for email and phone uniqueness
 * during user registration. These checks are public (no auth required)
 * to enable frontend form validation before submission.
 */

export interface AvailabilityResult {
  available: boolean;
}

/**
 * Check if an email address is available for registration
 *
 * @param email - Email address to check
 * @returns Availability result indicating if email is not yet registered
 */
export async function checkEmailAvailability(email: string): Promise<AvailabilityResult> {
  const normalizedEmail = email.toLowerCase().trim();

  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, normalizedEmail))
    .limit(1);

  return { available: !existing };
}

/**
 * Check if a phone number is available for registration
 *
 * @param phone - Phone number to check (E.164 format recommended)
 * @returns Availability result indicating if phone is not yet registered
 */
export async function checkPhoneAvailability(phone: string): Promise<AvailabilityResult> {
  // Normalize phone: remove spaces, dashes, parentheses
  const normalizedPhone = phone.replace(/[\s\-()]/g, '').trim();

  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.phone, normalizedPhone))
    .limit(1);

  return { available: !existing };
}
