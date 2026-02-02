/**
 * Unsubscribe Token Utility
 *
 * Generates and verifies JWT tokens for one-click email unsubscribe.
 * Tokens are signed with UNSUBSCRIBE_SECRET (falls back to JWT_SECRET)
 * and expire after 30 days.
 *
 * Token payload:
 * - userId: User to unsubscribe
 * - type: 'daily' | 'weekly' | 'all' - which digest to disable
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// Use dedicated secret or fall back to JWT_SECRET
const getUnsubscribeSecret = () => {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      '[UnsubscribeToken] No secret configured. Set UNSUBSCRIBE_SECRET or JWT_SECRET.',
    );
  }
  return new TextEncoder().encode(secret);
};

/**
 * Unsubscribe token payload
 */
export interface UnsubscribePayload extends JWTPayload {
  userId: string;
  type: 'daily' | 'weekly' | 'all';
}

/**
 * Generate a signed JWT token for one-click unsubscribe
 *
 * @param userId - User ID to encode in token
 * @param type - Which digest(s) to unsubscribe from
 * @returns Signed JWT token valid for 30 days
 */
export async function generateUnsubscribeToken(
  userId: string,
  type: 'daily' | 'weekly' | 'all',
): Promise<string> {
  const secret = getUnsubscribeSecret();

  return new SignJWT({ userId, type })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d') // Token valid for 30 days
    .sign(secret);
}

/**
 * Verify and decode an unsubscribe token
 *
 * @param token - JWT token to verify
 * @returns Decoded payload or null if invalid/expired
 */
export async function verifyUnsubscribeToken(token: string): Promise<UnsubscribePayload | null> {
  try {
    const secret = getUnsubscribeSecret();
    const { payload } = await jwtVerify(token, secret);

    // Validate payload structure
    if (
      typeof payload.userId !== 'string' ||
      !['daily', 'weekly', 'all'].includes(payload.type as string)
    ) {
      console.warn('[UnsubscribeToken] Invalid payload structure');
      return null;
    }

    return payload as UnsubscribePayload;
  } catch (error) {
    // Token expired, invalid signature, or malformed
    console.warn('[UnsubscribeToken] Verification failed:', error);
    return null;
  }
}
