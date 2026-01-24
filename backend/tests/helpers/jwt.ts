import { vi } from 'vitest';
import type { AuthUser } from '../../src/types/auth.js';

// Test user constants
export const TEST_USER = {
  id: 'user_test123456',
  email: 'test@example.com',
  name: 'Test User',
};

export const TEST_ORG = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Test Organization',
};

// Mock token generation helper
export interface MockTokenOptions {
  userId?: string;
  email?: string;
  name?: string;
  expired?: boolean;
}

/**
 * This would be used if we could sign tokens for testing.
 * In practice, we'll mock verifyAccessToken instead for unit tests.
 *
 * Integration tests would use a real Stack Auth project with test tokens.
 */
export async function createMockToken(opts: MockTokenOptions = {}): Promise<string> {
  throw new Error('Use vitest mocking for verifyAccessToken instead');
}

/**
 * Creates a mock authenticated user object for testing.
 * Use this with vitest mocks to stub the authentication flow.
 */
export function mockAuthenticatedUser(user: Partial<AuthUser> = {}): AuthUser {
  return {
    id: user.id ?? TEST_USER.id,
    email: user.email ?? TEST_USER.email,
    name: user.name ?? TEST_USER.name,
    profileId: user.profileId,
    organizationId: user.organizationId,
    role: user.role,
  };
}
