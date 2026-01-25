/**
 * Tests for Availability tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - checkEmail: Email availability check
 * - checkPhone: Phone availability check
 *
 * All procedures are PUBLIC (no authentication required).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { availabilityRouter } from '../../src/routers/availability.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the availability service
vi.mock('../../src/services/availability.service.js', () => ({
  checkEmailAvailability: vi.fn(),
  checkPhoneAvailability: vi.fn(),
}));

describe('Availability tRPC Router', () => {
  const createCaller = createCallerFactory(availabilityRouter);

  // Get the mocked functions
  let mockCheckEmailAvailability: ReturnType<typeof vi.fn>;
  let mockCheckPhoneAvailability: ReturnType<typeof vi.fn>;

  // Create context without authentication (public endpoint)
  const createPublicContext = () => ({
    req: {} as any,
    res: {} as any,
    user: null,
  });

  // Create context with authentication (should also work)
  const createAuthContext = () => ({
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

    // Import the mocked module to get references to mocked functions
    const availabilityService = await import('../../src/services/availability.service.js');
    mockCheckEmailAvailability = availabilityService.checkEmailAvailability as any;
    mockCheckPhoneAvailability = availabilityService.checkPhoneAvailability as any;
  });

  describe('checkEmail', () => {
    it('should return available: true for new email', async () => {
      mockCheckEmailAvailability.mockResolvedValue({ available: true });

      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      const result = await caller.checkEmail({ email: 'new@example.com' });

      expect(result.available).toBe(true);
      expect(result.message).toBe('Email is available');
      expect(mockCheckEmailAvailability).toHaveBeenCalledWith('new@example.com');
    });

    it('should return available: false for taken email', async () => {
      mockCheckEmailAvailability.mockResolvedValue({ available: false });

      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      const result = await caller.checkEmail({ email: 'existing@example.com' });

      expect(result.available).toBe(false);
      expect(result.message).toBe('Email is already registered');
    });

    it('should work without authentication (public procedure)', async () => {
      mockCheckEmailAvailability.mockResolvedValue({ available: true });

      // Using public context (no user)
      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      const result = await caller.checkEmail({ email: 'test@example.com' });

      expect(result.available).toBe(true);
      // No error thrown means public access works
    });

    it('should also work with authentication', async () => {
      mockCheckEmailAvailability.mockResolvedValue({ available: true });

      // Using authenticated context
      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.checkEmail({ email: 'test@example.com' });

      expect(result.available).toBe(true);
    });

    it('should reject invalid email format', async () => {
      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      await expect(
        caller.checkEmail({ email: 'not-an-email' })
      ).rejects.toThrow();
    });

    it('should handle empty email', async () => {
      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      await expect(
        caller.checkEmail({ email: '' })
      ).rejects.toThrow();
    });
  });

  describe('checkPhone', () => {
    it('should return available: true for new phone', async () => {
      mockCheckPhoneAvailability.mockResolvedValue({ available: true });

      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      const result = await caller.checkPhone({ phone: '+15551234567' });

      expect(result.available).toBe(true);
      expect(result.message).toBe('Phone number is available');
      expect(mockCheckPhoneAvailability).toHaveBeenCalledWith('+15551234567');
    });

    it('should return available: false for taken phone', async () => {
      mockCheckPhoneAvailability.mockResolvedValue({ available: false });

      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      const result = await caller.checkPhone({ phone: '+15559876543' });

      expect(result.available).toBe(false);
      expect(result.message).toBe('Phone number is already registered');
    });

    it('should work without authentication (public procedure)', async () => {
      mockCheckPhoneAvailability.mockResolvedValue({ available: true });

      // Using public context (no user)
      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      const result = await caller.checkPhone({ phone: '1234567890' });

      expect(result.available).toBe(true);
      // No error thrown means public access works
    });

    it('should also work with authentication', async () => {
      mockCheckPhoneAvailability.mockResolvedValue({ available: true });

      // Using authenticated context
      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.checkPhone({ phone: '1234567890' });

      expect(result.available).toBe(true);
    });

    it('should reject phone number that is too short', async () => {
      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      await expect(
        caller.checkPhone({ phone: '123' }) // Less than 10 chars
      ).rejects.toThrow();
    });

    it('should reject phone number that is too long', async () => {
      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      await expect(
        caller.checkPhone({ phone: '123456789012345678901' }) // More than 20 chars
      ).rejects.toThrow();
    });

    it('should accept phone with dashes and parentheses', async () => {
      mockCheckPhoneAvailability.mockResolvedValue({ available: true });

      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      const result = await caller.checkPhone({ phone: '(555) 123-4567' });

      expect(result.available).toBe(true);
    });

    it('should accept international phone format', async () => {
      mockCheckPhoneAvailability.mockResolvedValue({ available: true });

      const ctx = createPublicContext();
      const caller = createCaller(ctx);

      const result = await caller.checkPhone({ phone: '+1-555-123-4567' });

      expect(result.available).toBe(true);
    });
  });
});
