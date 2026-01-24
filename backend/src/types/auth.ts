/**
 * Authentication type definitions for Stack Auth integration
 */

/**
 * Stack Auth JWT token payload structure
 * Based on Stack Auth JWT claims format
 */
export interface StackAuthJWTPayload {
  /** User ID from Stack Auth (subject) */
  sub: string;
  /** Issuer (Stack Auth) */
  iss: string;
  /** Audience (Stack Auth Project ID) */
  aud: string;
  /** Expiration timestamp (seconds since epoch) */
  exp: number;
  /** Issued at timestamp (seconds since epoch) */
  iat: number;
  /** User email address */
  email?: string;
  /** Whether email has been verified */
  email_verified?: boolean;
  /** User display name */
  name?: string;
  /** Selected team/organization ID in Stack Auth */
  selected_team_id?: string;
  /** Whether this is an anonymous user */
  is_anonymous?: boolean;
}

/**
 * Application role types matching database enum
 * Defined in backend/src/db/schema/enums.ts
 */
export type AppRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

/**
 * Authenticated user context attached to Fastify requests
 * This is the user object available as request.user after authentication
 */
export interface AuthUser {
  /** Stack Auth user ID (from JWT sub claim) */
  id: string;
  /** Local profile UUID (from profiles table) */
  profileId?: string;
  /** User email address */
  email?: string;
  /** User display name */
  name?: string;
  /** Current organization context (from request or session) */
  organizationId?: string;
  /** User's role in the current organization */
  role?: AppRole;
}
