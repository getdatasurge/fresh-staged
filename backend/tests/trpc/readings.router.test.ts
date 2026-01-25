/**
 * Tests for Readings tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - list: List readings with pagination and filters
 * - latest: Get latest reading for a unit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { readingsRouter } from '../../src/routers/readings.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the readings service
vi.mock('../../src/services/readings.service.js', () => ({
  queryReadings: vi.fn(),
}));

describe('Readings tRPC Router', () => {
  const createCaller = createCallerFactory(readingsRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockQueryReadings: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const unitId = '423e4567-e89b-12d3-a456-426614174003';

  // Sample reading data
  const mockReading = {
    id: '523e4567-e89b-12d3-a456-426614174004',
    unitId: unitId,
    deviceId: '623e4567-e89b-12d3-a456-426614174005',
    temperature: 35.5,
    humidity: 65.0,
    battery: 85,
    signalStrength: -45,
    rawPayload: null,
    recordedAt: new Date('2024-01-01T12:00:00Z'),
    receivedAt: new Date('2024-01-01T12:00:01Z'),
    source: 'ttn',
  };

  // Create context that simulates authenticated user
  const createOrgContext = () => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked modules to get references to mocked functions
    const userService = await import('../../src/services/user.service.js');
    const readingsService = await import('../../src/services/readings.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockQueryReadings = readingsService.queryReadings as any;

    // Default to staff role
    mockGetUserRoleInOrg.mockResolvedValue('staff');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  describe('list', () => {
    it('should list readings for unit with pagination', async () => {
      const mockReadings = [mockReading, { ...mockReading, id: '723e4567-e89b-12d3-a456-426614174006' }];
      mockQueryReadings.mockResolvedValue(mockReadings);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({
        organizationId: orgId,
        unitId,
        page: 1,
        limit: 50,
      });

      expect(result).toEqual(mockReadings);
      expect(mockQueryReadings).toHaveBeenCalledWith({
        unitId,
        organizationId: orgId,
        limit: 50,
        offset: 0,
        start: undefined,
        end: undefined,
      });
    });

    it('should list readings with date range filters', async () => {
      const mockReadings = [mockReading];
      mockQueryReadings.mockResolvedValue(mockReadings);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const start = '2024-01-01T00:00:00Z';
      const end = '2024-01-02T00:00:00Z';

      const result = await caller.list({
        organizationId: orgId,
        unitId,
        start,
        end,
      });

      expect(result).toEqual(mockReadings);
      expect(mockQueryReadings).toHaveBeenCalledWith({
        unitId,
        organizationId: orgId,
        limit: 100,
        offset: 0,
        start,
        end,
      });
    });

    it('should calculate offset from page correctly', async () => {
      mockQueryReadings.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.list({
        organizationId: orgId,
        unitId,
        page: 3,
        limit: 20,
      });

      expect(mockQueryReadings).toHaveBeenCalledWith({
        unitId,
        organizationId: orgId,
        limit: 20,
        offset: 40, // (3-1) * 20 = 40
        start: undefined,
        end: undefined,
      });
    });

    it('should throw NOT_FOUND when unit not found', async () => {
      mockQueryReadings.mockRejectedValue(new Error('Unit not found or access denied'));

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.list({ organizationId: orgId, unitId })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.list({ organizationId: orgId, unitId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Unit not found or access denied',
      });
    });

    it('should return empty array when no readings', async () => {
      mockQueryReadings.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId, unitId });

      expect(result).toEqual([]);
    });
  });

  describe('latest', () => {
    it('should get latest reading for unit', async () => {
      mockQueryReadings.mockResolvedValue([mockReading]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.latest({ organizationId: orgId, unitId });

      expect(result).toEqual(mockReading);
      expect(mockQueryReadings).toHaveBeenCalledWith({
        unitId,
        organizationId: orgId,
        limit: 1,
        offset: 0,
      });
    });

    it('should return null when no readings exist', async () => {
      mockQueryReadings.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.latest({ organizationId: orgId, unitId });

      expect(result).toBeNull();
    });

    it('should throw NOT_FOUND when unit not found', async () => {
      mockQueryReadings.mockRejectedValue(new Error('Unit not found or access denied'));

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.latest({ organizationId: orgId, unitId })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.latest({ organizationId: orgId, unitId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Unit not found or access denied',
      });
    });
  });
});
