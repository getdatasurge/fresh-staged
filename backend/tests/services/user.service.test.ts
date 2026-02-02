import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client.js';
import {
  getOrCreateProfile,
  getUserRoleInOrg,
  getUserPrimaryOrganization,
  isSuperAdmin,
  getProfileByUserId,
} from '../../src/services/user.service.js';

// Mock the database client — vi.mock is hoisted automatically by Vitest
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...conditions) => ({ conditions })),
}));

/**
 * User Service Tests
 *
 * Tests cover all 5 exported functions:
 * - getOrCreateProfile: find existing or create new profile
 * - getUserRoleInOrg: get user's role in a specific organization
 * - getUserPrimaryOrganization: get first org the user belongs to
 * - isSuperAdmin: check platform_roles for SUPER_ADMIN
 * - getProfileByUserId: get profile by Stack Auth user ID
 *
 * Each function is tested for success and not-found cases.
 * getOrCreateProfile additionally tests both existing and new profile paths.
 */

// Helper to mock a SELECT chain: db.select() -> from() -> where() -> limit() -> resolves to array
function mockSelectChain(result: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(result);
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  vi.mocked(db.select).mockReturnValue({ from: mockFrom } as ReturnType<typeof db.select>);
  return { mockFrom, mockWhere, mockLimit };
}

// Helper to mock an INSERT chain: db.insert() -> values() -> returning() -> resolves to array
function mockInsertChain(result: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(result);
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  vi.mocked(db.insert).mockReturnValue(mockInsert() as ReturnType<typeof db.insert>);
  return { mockValues, mockReturning };
}

describe('User Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrCreateProfile', () => {
    const stackAuthUserId = 'auth-user-111';
    const organizationId = 'org-aaa-bbb';
    const email = 'alice@example.com';
    const name = 'Alice';

    it('should return existing profile when one already exists', async () => {
      const existingId = 'profile-existing-123';
      mockSelectChain([{ id: existingId }]);

      const result = await getOrCreateProfile(stackAuthUserId, organizationId, email, name);

      expect(result).toEqual({ id: existingId, isNew: false });
      expect(db.select).toHaveBeenCalled();
      // Should not attempt to insert when profile exists
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should create a new profile when none exists', async () => {
      const createdId = 'profile-new-456';

      // First call: SELECT returns empty (no existing profile)
      mockSelectChain([]);

      // Second call: INSERT returns created profile
      mockInsertChain([{ id: createdId }]);

      const result = await getOrCreateProfile(stackAuthUserId, organizationId, email, name);

      expect(result).toEqual({ id: createdId, isNew: true });
      expect(db.select).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });

    it('should create profile with empty email when email is not provided', async () => {
      const createdId = 'profile-no-email-789';
      mockSelectChain([]);
      const { mockValues } = mockInsertChain([{ id: createdId }]);

      const result = await getOrCreateProfile(stackAuthUserId, organizationId);

      expect(result).toEqual({ id: createdId, isNew: true });
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: stackAuthUserId,
          organizationId,
          email: '',
        }),
      );
    });

    it('should pass name to insert values when provided', async () => {
      const createdId = 'profile-with-name';
      mockSelectChain([]);
      const { mockValues } = mockInsertChain([{ id: createdId }]);

      await getOrCreateProfile(stackAuthUserId, organizationId, email, name);

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: stackAuthUserId,
          organizationId,
          email,
          fullName: name,
        }),
      );
    });
  });

  describe('getUserRoleInOrg', () => {
    const stackAuthUserId = 'auth-user-222';
    const organizationId = 'org-ccc-ddd';

    it('should return the user role when membership exists', async () => {
      mockSelectChain([{ role: 'admin' }]);

      const result = await getUserRoleInOrg(stackAuthUserId, organizationId);

      expect(result).toBe('admin');
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when user has no role in the organization', async () => {
      mockSelectChain([]);

      const result = await getUserRoleInOrg(stackAuthUserId, organizationId);

      expect(result).toBeNull();
    });

    it('should return null when role value is falsy', async () => {
      // Covers the `role?.role || null` fallback for edge cases
      mockSelectChain([{ role: '' }]);

      const result = await getUserRoleInOrg(stackAuthUserId, organizationId);

      expect(result).toBeNull();
    });
  });

  describe('getUserPrimaryOrganization', () => {
    const stackAuthUserId = 'auth-user-333';

    it('should return the organization and role when user has memberships', async () => {
      mockSelectChain([{ organizationId: 'org-primary-111', role: 'owner' }]);

      const result = await getUserPrimaryOrganization(stackAuthUserId);

      expect(result).toEqual({ organizationId: 'org-primary-111', role: 'owner' });
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when user has no organizations', async () => {
      mockSelectChain([]);

      const result = await getUserPrimaryOrganization(stackAuthUserId);

      expect(result).toBeNull();
    });
  });

  describe('isSuperAdmin', () => {
    const stackAuthUserId = 'auth-user-444';

    it('should return true when user has SUPER_ADMIN platform role', async () => {
      mockSelectChain([{ id: 'platform-role-id-1' }]);

      const result = await isSuperAdmin(stackAuthUserId);

      expect(result).toBe(true);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return false when user does not have SUPER_ADMIN role', async () => {
      mockSelectChain([]);

      const result = await isSuperAdmin(stackAuthUserId);

      expect(result).toBe(false);
    });
  });

  describe('getProfileByUserId', () => {
    const stackAuthUserId = 'auth-user-555';

    it('should return profile id and organizationId when profile exists', async () => {
      const profileId = 'profile-found-999';
      const orgId = 'org-found-888';
      mockSelectChain([{ id: profileId, organizationId: orgId }]);

      const result = await getProfileByUserId(stackAuthUserId);

      expect(result).toEqual({ id: profileId, organizationId: orgId });
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when no profile exists for the user', async () => {
      mockSelectChain([]);

      const result = await getProfileByUserId(stackAuthUserId);

      expect(result).toBeNull();
    });
  });
});
