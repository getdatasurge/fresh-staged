/**
 * JWT verification utilities for Stack Auth integration
 *
 * This module provides JWT token verification using Stack Auth's JWKS endpoint.
 * JWKS keys are cached and auto-refreshed according to the configured timings.
 */

import * as jose from 'jose';
import type { StackAuthJWTPayload } from '../types/auth.js';

/**
 * Stack Auth Project ID from environment
 * This must be set in .env file - see backend/.env.example
 */
const STACK_AUTH_PROJECT_ID = process.env.STACK_AUTH_PROJECT_ID;

if (!STACK_AUTH_PROJECT_ID) {
  throw new Error(
    'STACK_AUTH_PROJECT_ID environment variable is required. ' +
      'Get this from Stack Auth Dashboard -> Project Settings -> Project ID',
  );
}

/**
 * Stack Auth JWKS endpoint URL
 * This is the public endpoint where Stack Auth publishes signing keys
 */
const JWKS_URL = `https://api.stack-auth.com/api/v1/projects/${STACK_AUTH_PROJECT_ID}/.well-known/jwks.json`;

/**
 * Remote JWKS key set with caching
 *
 * Configuration:
 * - cooldownDuration: 30 seconds between refresh attempts
 * - cacheMaxAge: 10 minutes key cache lifetime
 *
 * Exported for testing purposes
 */
export const jwks = jose.createRemoteJWKSet(new URL(JWKS_URL), {
  cooldownDuration: 30_000, // 30 seconds
  cacheMaxAge: 600_000, // 10 minutes
});

/**
 * Verify Stack Auth access token
 *
 * @param accessToken - JWT access token from Stack Auth
 * @returns Payload with user information and userId for convenience
 * @throws {jose.errors.JWTExpired} Token has expired
 * @throws {jose.errors.JWTInvalid} Token is invalid or malformed
 * @throws {jose.errors.JWTClaimValidationFailed} Claims don't match expectations
 * @throws {jose.errors.JWSSignatureVerificationFailed} Signature verification failed
 *
 * @example
 * ```typescript
 * try {
 *   const { payload, userId } = await verifyAccessToken(token);
 *   console.log('Authenticated user:', userId);
 * } catch (error) {
 *   if (error instanceof jose.errors.JWTExpired) {
 *     // Token expired
 *   } else if (error instanceof jose.errors.JWTInvalid) {
 *     // Invalid token
 *   }
 * }
 * ```
 */
export async function verifyAccessToken(
  accessToken: string,
): Promise<{ payload: StackAuthJWTPayload; userId: string }> {
  // Verify JWT with JWKS and validate claims
  const { payload } = await jose.jwtVerify(accessToken, jwks, {
    // Validate audience matches our project ID
    audience: STACK_AUTH_PROJECT_ID,
    // Allow 30 seconds clock skew tolerance
    clockTolerance: 30,
  });

  // Extract user ID from subject claim
  const userId = payload.sub;

  if (!userId) {
    throw new Error('JWT payload missing sub (user ID) claim');
  }

  // Return typed payload and userId for convenience
  return {
    payload: payload as StackAuthJWTPayload,
    userId,
  };
}
